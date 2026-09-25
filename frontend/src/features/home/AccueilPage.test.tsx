import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import {
  makeFreshHomeSummary,
  makeHomeSummary,
} from "../../test/factories/homeSummary";
import { makeUser } from "../../test/factories/user";
import { formatMoney, toBusinessDate } from "../../i18n/format";
import { apiError, apiV1, ok } from "../../test/msw/envelope";
import { authHandlers } from "../../test/msw/handlers/auth";
import { homeHandlers } from "../../test/msw/handlers/home";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";
import { isFreshDatabase } from "./AccueilPage";
import { buildAlerts } from "./widgets/AlertsCard";
import { salesDelta } from "./widgets/KpiRow";

const ownerPermissions = [
  "pos.access",
  "pos.sell",
  "pos.open_session",
  "customer_balances.view",
  "distribution.balances.view",
  "supplier_balances.view",
  "orders.view",
  "orders.create",
  "inventory.view",
  "expenses.view",
  "purchases.create",
  "distribution.custody.view",
  "audit.view",
];

function renderHome() {
  mockViewport(1280);
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={createTestRouter(["/"])} />
    </AppProviders>,
  );
}

describe("Accueil", () => {
  it("shows every block for the owner with live values, alerts and actions", async () => {
    server.use(
      ...authHandlers(
        makeUser({
          displayName: "Salma Ben Ali",
          effectivePermissions: ownerPermissions,
        }),
      ),
      ...homeHandlers(),
    );

    renderHome();

    expect(await screen.findByText("Ventes du jour")).toBeInTheDocument();
    expect(screen.getByText("1 250,000")).toBeInTheDocument();
    expect(screen.getByText("+12 % vs la veille")).toBeInTheDocument();
    expect(screen.getByText("Solde actuel")).toBeInTheDocument();
    expect(
      screen.getByText("Solde actuel · dont distributeurs 410,000 TND"),
    ).toBeInTheDocument();
    expect(screen.getByText("3 en retard")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /Session ouverte depuis 08:12 par Amine/,
      }),
    ).toHaveAttribute("href", "/caisse");
    expect(
      screen.getByRole("link", { name: "3 achats en retard" }),
    ).toHaveAttribute("href", "/achats");
    expect(
      screen.getByRole("link", { name: "1 stock négatif : Farine T55" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Nouvelle vente" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nouvel achat" })).toHaveAttribute(
      "href",
      "/achats/nouveau",
    );
    expect(
      screen.getByRole("link", { name: "Nouvelle commande" }),
    ).toHaveAttribute("href", "/commandes/nouvelle");
    expect(
      screen.getByRole("list", { name: "Activité récente" }),
    ).toHaveTextContent("Vente en caisse");
    expect(screen.getByText("Dépenses du jour")).toBeInTheDocument();
    expect(screen.getByText("85,000 TND")).toBeInTheDocument();
    // Issue 008: the margin of the day over the costed lines, with the
    // share of the revenue it covers and the lines that had no cost.
    expect(screen.getByText("Marge approximative")).toBeInTheDocument();
    expect(screen.getByText("380,000")).toBeInTheDocument();
    expect(screen.getByText("+13 % vs la veille")).toBeInTheDocument();
    expect(
      screen.getByText("sur 80 % du chiffre d'affaires · 2 lignes sans coût"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("3 dépenses validées · La veille : 40,000 TND"),
    ).toBeInTheDocument();
  });

  // Issue #42: "Hier" moves every daily tile to yesterday, expenses
  // included, through one `date` on the summary request.
  it("switches the daily tiles to yesterday, expenses included", async () => {
    const dates: Array<string | null> = [];
    server.use(
      ...authHandlers(makeUser({ effectivePermissions: ownerPermissions })),
      http.get(`${apiV1}/home/summary`, ({ request }) => {
        const date = new URL(request.url).searchParams.get("date");
        dates.push(date);
        return ok({
          summary: makeHomeSummary(
            date
              ? {
                  date,
                  expenses: {
                    dayTnd: "40.000",
                    dayCount: 1,
                    previousDayTnd: "12.000",
                  },
                }
              : {},
          ),
        });
      }),
    );

    renderHome();

    expect(await screen.findByText("Ventes du jour")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Hier" }));

    expect(await screen.findByText("Ventes d'hier")).toBeInTheDocument();
    expect(screen.getByText("Dépenses d'hier")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("40,000 TND")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("1 dépense validée · La veille : 12,000 TND"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Espèces de la veille à la caisse"),
    ).toBeInTheDocument();
    expect(dates.at(-1)).toBe(
      toBusinessDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
    );
  });

  // AS-V2-08 on the client side: a null block is absent, never zero.
  it("omits the blocks the cashier may not see", async () => {
    server.use(
      ...authHandlers(
        makeUser({ effectivePermissions: ["pos.access", "pos.sell"] }),
      ),
      ...homeHandlers(
        makeHomeSummary({
          receivables: null,
          payables: null,
          orders: null,
          stock: null,
          expenses: null,
          margin: null,
          custody: null,
          recent: null,
        }),
      ),
    );

    renderHome();

    expect(await screen.findByText("Ventes du jour")).toBeInTheDocument();
    expect(screen.queryByText("À payer fournisseurs")).not.toBeInTheDocument();
    expect(screen.queryByText("Marge approximative")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Reste à encaisser clients"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Activité récente")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Nouvel achat" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Nouvelle vente" }),
    ).toBeInTheDocument();
  });

  it("shows the empty hint on a fresh database", async () => {
    server.use(
      ...authHandlers(makeUser({ effectivePermissions: ownerPermissions })),
      ...homeHandlers(makeFreshHomeSummary()),
    );

    renderHome();

    expect(
      await screen.findByText(
        "Commencez par ouvrir la caisse ou enregistrer un achat.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Aucune session de caisse ouverte" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ouvrir la caisse" }),
    ).toBeInTheDocument();
  });

  it("shows the error state with retry when the summary fails", async () => {
    server.use(
      ...authHandlers(makeUser({ effectivePermissions: ownerPermissions })),
      http.get(`${apiV1}/home/summary`, () =>
        apiError(503, "SERVICE_UNAVAILABLE", ""),
      ),
    );

    renderHome();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Service indisponible",
    );
    expect(
      screen.getByRole("button", { name: "Réessayer" }),
    ).toBeInTheDocument();
  });

  it("derives the sales delta and the alert list", () => {
    expect(salesDelta("1250", "1000")).toEqual({
      label: "+25 % vs la veille",
      direction: "up",
    });
    expect(salesDelta("800", "1000")).toEqual({
      label: "−20 % vs la veille",
      direction: "down",
    });
    expect(salesDelta("0", "0")).toEqual({
      label: "Comme la veille",
      direction: "flat",
    });
    expect(salesDelta("50", "0")).toEqual({
      label: `La veille : ${formatMoney("0")}`,
      direction: "up",
    });
    expect(buildAlerts(makeHomeSummary()).map((alert) => alert.id)).toEqual([
      "session",
      "purchases",
      "orders-overdue",
      "orders-today",
      "orders-ready",
      "stock",
      "custody",
    ]);
    expect(isFreshDatabase(makeFreshHomeSummary())).toBe(true);
    expect(isFreshDatabase(makeHomeSummary())).toBe(false);
    // A quiet day on a live database: no sale, but a till open and money
    // owed. Not fresh, so no "commencez par" hint.
    expect(
      isFreshDatabase({
        ...makeFreshHomeSummary(),
        openSession: makeHomeSummary().openSession,
      }),
    ).toBe(false);
    expect(
      isFreshDatabase({
        ...makeFreshHomeSummary(),
        receivables: { customersTnd: "120.000", distributorsTnd: null },
      }),
    ).toBe(false);
  });
});
