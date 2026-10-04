import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { toBusinessDate } from "../../i18n/format";
import { shiftBusinessDate } from "../../lib/dates/periodRange";
import {
  makeAnalyticsFrequency,
  makeAnalyticsOverview,
  makeAnalyticsProducts,
  makeFrequencyBlock,
  makeQuietOverview,
} from "../../test/factories/analytics";
import { makeUser } from "../../test/factories/user";
import { apiError, apiV1 } from "../../test/msw/envelope";
import {
  analyticsHandlers,
  type AnalyticsFixtures,
} from "../../test/msw/handlers/analytics";
import { authHandlers } from "../../test/msw/handlers/auth";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";
import { hoursShown } from "./tabs/FrequencyTab";

const owner = [
  "analytics.view",
  "pos.access",
  "orders.view",
  "expenses.view",
  "margin.view",
  "customers.view",
  "products.view",
];

function renderAnalytics(
  options: {
    path?: string;
    permissions?: string[];
    fixtures?: AnalyticsFixtures;
    width?: number;
  } = {},
) {
  mockViewport(options.width ?? 1280);
  server.use(
    ...authHandlers(
      makeUser({ effectivePermissions: options.permissions ?? owner }),
    ),
    ...analyticsHandlers(options.fixtures),
  );
  const router = createTestRouter([options.path ?? "/analyses"]);
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return router;
}

describe("Analyses: vue d'ensemble", () => {
  it("reads the last thirty days by default and compares them with the period before", async () => {
    const requests: Array<[string, string | null, string | null]> = [];
    renderAnalytics({
      fixtures: {
        onRequest: (endpoint, from, to) => requests.push([endpoint, from, to]),
      },
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Analyses" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Chiffre d'affaires")).toBeInTheDocument();
    const today = toBusinessDate(new Date());
    expect(requests[0]).toEqual([
      "overview",
      shiftBusinessDate(today, -29),
      today,
    ]);
    expect(screen.getByRole("radio", { name: "30 jours" })).toBeChecked();

    // 4 800 against 4 000 the period before.
    expect(screen.getByText("4 800,000")).toBeInTheDocument();
    expect(screen.getByText("+20 % vs période précédente")).toBeInTheDocument();
    expect(screen.getByText("Ventes en caisse")).toBeInTheDocument();
    expect(screen.getByText("360")).toBeInTheDocument();
    expect(screen.getByText("hors 2 ventes annulées")).toBeInTheDocument();
    expect(screen.getByText("Panier moyen")).toBeInTheDocument();
    expect(screen.getByText("Reste à encaisser")).toBeInTheDocument();
    expect(screen.getByText("240,000")).toBeInTheDocument();
    // Spending went down: good news, in the direction of the arrow only.
    expect(screen.getByText("dépenses validées")).toBeInTheDocument();
    expect(screen.getByText("−10 % vs période précédente")).toBeInTheDocument();
    expect(screen.getByText("Marge approximative")).toBeInTheDocument();
    expect(
      screen.getByText("ingrédients seulement · sur 75 % des ventes en caisse"),
    ).toBeInTheDocument();
  });

  it("draws the trend against the previous period and names the best day", async () => {
    renderAnalytics();

    expect(
      await screen.findByRole("img", { name: "Chiffre d'affaires par jour" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Par jour, comparé aux 30 jours précédents."),
    ).toBeInTheDocument();
    expect(screen.getByText("Période précédente")).toBeInTheDocument();
    expect(screen.getByText("samedi 12/09/2026")).toBeInTheDocument();

    const channels = screen.getByRole("figure", {
      name: "Chiffre d'affaires par canal",
    });
    expect(
      within(channels).getByLabelText(/^Comptoir : 3 000,000.TND · 63 %$/),
    ).toBeInTheDocument();
    expect(
      within(channels).getByLabelText(/^Distributeurs : 1 200,000.TND · 25 %$/),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("figure", { name: "Dépenses par catégorie" }),
      ).getByLabelText(/^Énergie : 600,000.TND · 67 %$/),
    ).toBeInTheDocument();
  });

  it("hides expenses and margin when the server leaves them out", async () => {
    renderAnalytics({
      permissions: ["analytics.view"],
      fixtures: {
        overview: makeAnalyticsOverview({ expenses: null, margin: null }),
      },
    });

    expect(await screen.findByText("Chiffre d'affaires")).toBeInTheDocument();
    expect(screen.queryByText("dépenses validées")).toBeNull();
    expect(screen.queryByText("Marge approximative")).toBeNull();
    expect(screen.queryByText("Dépenses par catégorie")).toBeNull();
    // Without customers.view the customer analysis is not offered.
    expect(screen.queryByRole("tab", { name: "Clients" })).toBeNull();
  });

  it("says so when the period holds nothing", async () => {
    renderAnalytics({ fixtures: { overview: makeQuietOverview() } });

    expect(
      await screen.findByText("Aucune activité sur cette période"),
    ).toBeInTheDocument();
    // Revenue, sales and expenses: nothing now, nothing before.
    expect(screen.getAllByText("Comme la période précédente")).toHaveLength(3);
    expect(
      screen.queryByRole("img", { name: "Chiffre d'affaires par jour" }),
    ).toBeNull();
  });

  it("asks the server for the window of the preset picked", async () => {
    const requests: Array<[string, string | null, string | null]> = [];
    renderAnalytics({
      fixtures: {
        onRequest: (endpoint, from, to) => requests.push([endpoint, from, to]),
      },
    });
    await screen.findByText("Chiffre d'affaires");

    await userEvent.click(screen.getByRole("radio", { name: "90 jours" }));

    const today = toBusinessDate(new Date());
    await waitFor(() =>
      expect(requests.at(-1)).toEqual([
        "overview",
        shiftBusinessDate(today, -89),
        today,
      ]),
    );
  });

  it("refuses a custom period longer than a year without calling the server", async () => {
    const requests: string[] = [];
    renderAnalytics({
      path: "/analyses?period=custom&from=2024-01-01&to=2026-09-30",
      fixtures: { onRequest: (endpoint) => requests.push(endpoint) },
    });

    expect(await screen.findByText("Période trop longue")).toBeInTheDocument();
    expect(
      screen.getByText("Choisissez une période de 366 jours au plus."),
    ).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it("shows a retryable error with the server's message", async () => {
    renderAnalytics();
    server.use(
      http.get(`${apiV1}/analytics/overview`, () =>
        apiError(500, "RETRYABLE_SERVER_ERROR", "Erreur temporaire."),
      ),
    );

    expect(
      await screen.findByRole("button", { name: "Réessayer" }),
    ).toBeInTheDocument();
  });

  it("is refused without analytics.view", async () => {
    renderAnalytics({ permissions: ["pos.access"] });

    expect(await screen.findByText(/Accès refusé/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Analyses" })).toBeNull();
  });
});

describe("Analyses: fréquence", () => {
  it("names the busiest slot, the strongest weekday and the rush hour", async () => {
    renderAnalytics({ path: "/analyses?tab=frequency" });

    expect(
      await screen.findByText("Créneau le plus actif"),
    ).toBeInTheDocument();
    expect(screen.getByText("Samedi 8 h")).toBeInTheDocument();
    expect(screen.getByText(/^48 ventes · 520,000.TND$/)).toBeInTheDocument();
    expect(screen.getByText("Jour le plus fort")).toBeInTheDocument();
    // 88 sales over four Saturdays.
    expect(
      screen.getByText(/^en moyenne 22 ventes et 232,500.TND par jour$/),
    ).toBeInTheDocument();
    expect(screen.getByText("Heure de pointe")).toBeInTheDocument();
    expect(screen.getByText("8 h à 9 h")).toBeInTheDocument();
    expect(screen.getByText("60 ventes sur la période")).toBeInTheDocument();
  });

  it("draws the weekday by hour grid around the hours with activity", async () => {
    renderAnalytics({ path: "/analyses?tab=frequency" });

    const grid = await screen.findByRole("grid", {
      name: "Quand vendez-vous ?",
    });
    // Sales between 7 h and 9 h: columns from 6 h to 10 h.
    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["6 h", "7 h", "8 h", "9 h", "10 h"]);
    expect(within(grid).getAllByRole("rowheader")).toHaveLength(7);
    expect(
      within(grid).getByRole("gridcell", {
        name: /^Samedi, 8 h à 9 h : 48 ventes · 520,000.TND$/,
      }),
    ).toHaveAttribute("data-level", "4");
    expect(
      within(grid).getByRole("gridcell", {
        name: "Mercredi, 8 h à 9 h : aucune vente",
      }),
    ).toHaveAttribute("data-level", "0");
  });

  it("switches to order pickups and to amounts, and keeps both in the URL", async () => {
    const router = renderAnalytics({ path: "/analyses?tab=frequency" });
    await screen.findByText("Créneau le plus actif");

    await userEvent.click(
      screen.getByRole("radio", { name: "Retraits de commandes" }),
    );

    expect(
      await screen.findByRole("grid", {
        name: "Quand les commandes sont-elles à retirer ?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Vendredi 16 h")).toBeInTheDocument();
    expect(screen.getByText(/^8 commandes · 640,000.TND$/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Montant" }));
    expect(router.state.location.search).toContain("source=orders");
    expect(router.state.location.search).toContain("metric=amount");
  });

  it("offers sales only when the server sends no order block", async () => {
    renderAnalytics({
      path: "/analyses?tab=frequency&source=orders",
      permissions: ["analytics.view"],
      fixtures: { frequency: makeAnalyticsFrequency({ orders: null }) },
    });

    expect(
      await screen.findByRole("grid", { name: "Quand vendez-vous ?" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Retraits de commandes" }),
    ).toBeNull();
  });

  it("turns the grid on a phone: hours down, weekdays across", async () => {
    renderAnalytics({ path: "/analyses?tab=frequency", width: 360 });

    const grid = await screen.findByRole("grid", {
      name: "Quand vendez-vous ?",
    });
    expect(within(grid).getAllByRole("columnheader")).toHaveLength(7);
    expect(
      within(grid)
        .getAllByRole("rowheader")
        .map((header) => header.textContent),
    ).toEqual(["6 h", "7 h", "8 h", "9 h", "10 h"]);
  });

  it("says so when nothing was sold", async () => {
    renderAnalytics({
      path: "/analyses?tab=frequency",
      fixtures: {
        frequency: makeAnalyticsFrequency({ sales: makeFrequencyBlock([]) }),
      },
    });

    expect(
      await screen.findByText("Aucune vente sur cette période"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("pads the hours shown by one on each side and falls back to a bakery's day", () => {
    expect(
      hoursShown([{ weekday: 1, hour: 0, count: 1, totalTnd: "1.000" }]),
    ).toEqual([0, 1]);
    expect(
      hoursShown([
        { weekday: 1, hour: 7, count: 1, totalTnd: "1.000" },
        { weekday: 2, hour: 23, count: 1, totalTnd: "1.000" },
      ]),
    ).toEqual(Array.from({ length: 18 }, (_, index) => index + 6));
    expect(hoursShown([])).toHaveLength(15);
  });
});

describe("Analyses: produits", () => {
  it("ranks products, categories and margins, and details every product", async () => {
    renderAnalytics({ path: "/analyses?tab=products" });

    expect(await screen.findByText("Produits vendus")).toBeInTheDocument();
    const best = screen.getByRole("list", {
      name: "Meilleures ventes par chiffre d'affaires",
    });
    expect(
      within(best)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Baguette", "Croissant", "Pain complet"]);
    expect(
      within(best).getByText(/^2 400,000.TND · 50 %$/),
    ).toBeInTheDocument();
    expect(
      within(best).getByRole("link", { name: "Baguette" }),
    ).toHaveAttribute("href", "/produits/baguette");
    expect(
      within(
        screen.getByRole("figure", {
          name: "Chiffre d'affaires par catégorie",
        }),
      ).getByLabelText(/^Pains : 3 360,000.TND · 70 %$/),
    ).toBeInTheDocument();
    // The product never costed has no margin, so it is not ranked by it.
    expect(
      within(
        screen.getByRole("list", { name: "Meilleures marges approximatives" }),
      )
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Baguette", "Croissant"]);

    const table = screen.getByRole("table", { name: "Détail par produit" });
    const row = within(table).getByRole("row", { name: /Pain complet/ });
    expect(row).toHaveTextContent("800");
    expect(row).toHaveTextContent("95 ventes");
    expect(row).toHaveTextContent("20 %");
    expect(row).toHaveTextContent("—");
    expect(within(table).getByText("Marge approx.")).toBeInTheDocument();
  });

  it("lists the products that did not sell", async () => {
    renderAnalytics({ path: "/analyses?tab=products" });

    const unsold = await screen.findByRole("list", {
      name: "Produits sans vente",
    });
    expect(
      within(unsold).getByRole("link", { name: "Tarte aux pommes" }),
    ).toHaveAttribute("href", "/produits/tarte");
    expect(within(unsold).getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows no margin when the server sends no cost figure", async () => {
    const products = makeAnalyticsProducts();
    renderAnalytics({
      path: "/analyses?tab=products",
      permissions: ["analytics.view"],
      fixtures: {
        products: {
          ...products,
          items: products.items.map((item) => ({
            ...item,
            costedRevenueTnd: null,
            marginTnd: null,
          })),
        },
      },
    });

    expect(
      await screen.findByRole("table", { name: "Détail par produit" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Marge approx.")).toBeNull();
    expect(screen.queryByText("Meilleures marges approximatives")).toBeNull();
  });

  it("cuts the detail into pages in the browser", async () => {
    const products = makeAnalyticsProducts();
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...products.items[0]!,
      productId: `product-${index}`,
      name: `Produit ${String(index + 1).padStart(2, "0")}`,
    }));
    renderAnalytics({
      path: "/analyses?tab=products",
      fixtures: { products: { ...products, items: many } },
    });

    const table = await screen.findByRole("table", {
      name: "Détail par produit",
    });
    expect(within(table).getAllByRole("row")).toHaveLength(11);
    expect(within(table).queryByText("Produit 11")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Suivant" }));

    expect(await within(table).findByText("Produit 11")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });
});

describe("Analyses: clients", () => {
  it("segments customers, ranks the best and lists who to win back", async () => {
    renderAnalytics({ path: "/analyses?tab=customers" });

    expect(await screen.findByText("Clients actifs")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("Nouveaux clients")).toBeInTheDocument();
    expect(screen.getByText("Clients fidèles")).toBeInTheDocument();
    // 2 400 of 3 600 TND were sold without a registered customer.
    expect(screen.getByText("67 %")).toBeInTheDocument();

    const top = screen.getByRole("list", {
      name: "Meilleurs clients par chiffre d'affaires",
    });
    expect(
      within(top).getByRole("link", { name: "Hôtel du Lac" }),
    ).toHaveAttribute("href", "/clients/hotel");
    expect(
      within(top).getByText(/^480,000.TND · 12 achats$/),
    ).toBeInTheDocument();

    const inactive = screen.getByRole("list", { name: "Clients à relancer" });
    expect(
      within(inactive).getByRole("link", { name: "Restaurant El Medina" }),
    ).toHaveAttribute("href", "/clients/restaurant");
    expect(
      within(inactive).getByText(
        "Dernier achat le 12/06/2026, il y a 110 jours",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("et 2 autres clients.")).toBeInTheDocument();
  });

  it("falls back to the overview when the tab is not offered", async () => {
    renderAnalytics({
      path: "/analyses?tab=customers",
      permissions: ["analytics.view"],
    });

    expect(await screen.findByText("Chiffre d'affaires")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Vue d'ensemble" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
