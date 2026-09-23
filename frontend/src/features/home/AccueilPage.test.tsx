import { render, screen } from "@testing-library/react";
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
import { apiError, apiV1 } from "../../test/msw/envelope";
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
    expect(screen.getByText("+12 % vs hier")).toBeInTheDocument();
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
    expect(
      screen.getByRole("link", { name: "Nouvel achat" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Activité récente" }),
    ).toHaveTextContent("Vente en caisse");
    expect(screen.getByText("Dépenses du mois")).toBeInTheDocument();
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
          custody: null,
          recent: null,
        }),
      ),
    );

    renderHome();

    expect(await screen.findByText("Ventes du jour")).toBeInTheDocument();
    expect(screen.queryByText("À payer fournisseurs")).not.toBeInTheDocument();
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
      label: "+25 % vs hier",
      direction: "up",
    });
    expect(salesDelta("800", "1000")).toEqual({
      label: "−20 % vs hier",
      direction: "down",
    });
    expect(salesDelta("0", "0")).toEqual({
      label: "Comme hier",
      direction: "flat",
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
  });
});
