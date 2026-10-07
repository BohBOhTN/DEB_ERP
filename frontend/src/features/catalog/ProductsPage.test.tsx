import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import {
  makeCatalogStore,
  makePurchasePrices,
  catalogHandlers,
} from "../../test/msw/handlers/catalog";
import { makeResaleProduct } from "../../test/factories/catalog";
import { makeSimulation } from "../../test/factories/simulation";
import { makeUser } from "../../test/factories/user";
import {
  inventoryHandlers,
  makeInventoryStore,
} from "../../test/msw/handlers/inventory";
import {
  makeSimulationStore,
  simulationHandlers,
} from "../../test/msw/handlers/simulation";
import { apiError, apiV1, ok } from "../../test/msw/envelope";
import { authHandlers } from "../../test/msw/handlers/auth";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";

const manager = makeUser({
  effectivePermissions: [
    "products.view",
    "products.create",
    "products.update",
    "products.activate",
    "categories.view",
    "units.view",
    "inventory.view",
  ],
});

function renderAt(path: string, permissions = manager.effectivePermissions) {
  mockViewport(1280);
  server.use(...authHandlers(makeUser({ effectivePermissions: permissions })));
  const router = createTestRouter([path]);
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return router;
}

describe("Produits", () => {
  beforeAll(async () => {
    await Promise.all([
      import("./pages/ProductsPage"),
      import("./pages/ProductDetailPage"),
      import("./pages/RawMaterialDetailPage"),
    ]);
  });

  it("lists products with their category, price and status, then opens the detail", async () => {
    const router = renderAt("/produits");

    const table = await screen.findByRole("table", { name: "Produits" });
    expect(within(table).getByText("Pain complet")).toBeInTheDocument();
    expect(within(table).getAllByText("Pains").length).toBeGreaterThan(0);
    expect(within(table).getByText(/1,200/)).toBeInTheDocument();

    await userEvent.click(within(table).getByText("Croissant"));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/produits/product-2"),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Croissant" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Stock" })).toBeInTheDocument();
  });

  it("creates a product from the dialog without typing any identifier", async () => {
    renderAt("/produits");

    await userEvent.click(
      await screen.findByRole("button", { name: "Nouveau produit" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Nouveau produit" });
    await userEvent.type(
      within(dialog).getByLabelText(/^Nom/),
      "Baguette tradition",
    );
    await userEvent.click(
      within(dialog).getByRole("combobox", { name: /Catégorie/ }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Pains" }));
    await userEvent.click(
      within(dialog).getByRole("combobox", { name: /Unité de base/ }),
    );
    await userEvent.click(await screen.findByRole("option", { name: /Pièce/ }));
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /Prix de vente/ }),
      "0,9",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      await within(screen.getByRole("table", { name: "Produits" })).findByText(
        "Baguette tradition",
      ),
    ).toBeInTheDocument();
  });

  // Issue 019: a product bought to be resold is always stock-tracked; the
  // list says which products are resold and filters on it.
  it("flags a product for resale, locks its stock switch on, and filters the list on it", async () => {
    const store = makeCatalogStore();
    server.use(...catalogHandlers(store));
    renderAt("/produits");

    await userEvent.click(
      await screen.findByRole("button", { name: "Nouveau produit" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Nouveau produit" });
    await userEvent.type(within(dialog).getByLabelText(/^Nom/), "Eau 1,5 L");
    await userEvent.click(
      within(dialog).getByRole("combobox", { name: /Catégorie/ }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Pains" }));
    await userEvent.click(
      within(dialog).getByRole("combobox", { name: /Unité de base/ }),
    );
    await userEvent.click(await screen.findByRole("option", { name: /Pièce/ }));
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /Prix de vente/ }),
      "1,2",
    );
    const stockable = within(dialog).getByRole("switch", { name: /Stockable/ });
    await userEvent.click(stockable);
    expect(stockable).not.toBeChecked();
    await userEvent.click(
      within(dialog).getByRole("switch", { name: /Produit de revente/ }),
    );
    expect(stockable).toBeChecked();
    expect(stockable).toBeDisabled();
    expect(
      within(dialog).getByText("Toujours suivi pour un produit de revente."),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(store.products.at(-1)).toMatchObject({
      name: "Eau 1,5 L",
      isResale: true,
      isStockable: true,
    });
    const table = screen.getByRole("table", { name: "Produits" });
    const row = (await within(table).findByText("Eau 1,5 L")).closest(
      "tr",
    ) as HTMLElement;
    expect(within(row).getByText("Revente")).toBeInTheDocument();
    expect(within(table).getAllByText("Revente")).toHaveLength(1);

    await userEvent.click(screen.getByRole("combobox", { name: "Origine" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Produits de revente" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("table", { name: "Produits" })).queryByText(
          "Pain complet",
        ),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("table", { name: "Produits" })).getByText(
        "Eau 1,5 L",
      ),
    ).toBeInTheDocument();
  });

  // Issue 023, DEC-V2-013: a purchase never rewrites the cost; the prices
  // paid and the sale prices are read on a Prix tab.
  it("reads the prices paid and the sale prices of a resold product on its Prix tab", async () => {
    server.use(
      ...catalogHandlers(
        makeCatalogStore({
          products: [makeResaleProduct()],
          purchasePrices: makePurchasePrices(),
          salePrices: {
            "product-water": [
              {
                id: "s1",
                salePriceTnd: "1.000",
                effectiveAt: "2026-08-20T08:00:00.000Z",
              },
              {
                id: "s2",
                salePriceTnd: "1.200",
                effectiveAt: "2026-09-10T08:00:00.000Z",
              },
            ],
          },
        }),
      ),
    );
    renderAt("/produits/product-water", [
      ...manager.effectivePermissions,
      "purchases.view",
      "margin.view",
    ]);

    await screen.findByRole("heading", { level: 1, name: "Eau 1,5 L" });
    await userEvent.click(screen.getByRole("tab", { name: "Prix" }));

    expect(await screen.findByText("Prix de vente actuel")).toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
    // The gap to the last price paid, the owner's figure, with margin.view.
    expect(
      screen.getByText(/^0,350.TND au-dessus du dernier prix d'achat$/),
    ).toBeInTheDocument();
    expect(screen.getByText("Dernier prix d'achat")).toBeInTheDocument();
    expect(screen.getByText("0,850")).toBeInTheDocument();
    expect(
      screen.getByText("le 01/10/2026 chez Minoterie du Sud"),
    ).toBeInTheDocument();
    expect(screen.getByText("+6 %")).toBeInTheDocument();
    expect(
      screen.getByText("du premier au dernier des 3 achats"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Prix d'achat par achat" }),
    ).toBeInTheDocument();
    // The chart carries both series: the price paid and the price set.
    expect(screen.getAllByText("Prix de vente").length).toBeGreaterThan(1);

    const purchases = screen.getByRole("table", { name: "Prix d'achat" });
    const rows = within(purchases).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    // Most recent first, each linked to its purchase.
    expect(rows[0]).toHaveTextContent("01/10/2026");
    expect(
      within(rows[0] as HTMLElement).getByRole("link", { name: "AC-000015" }),
    ).toHaveAttribute("href", "/achats/purchase-w3");
    const sales = screen.getByRole("table", { name: "Prix de vente" });
    const saleRows = within(sales).getAllByRole("row").slice(1);
    expect(saleRows).toHaveLength(2);
    expect(saleRows[0]).toHaveTextContent("10/09/2026");
    expect(
      within(saleRows[0] as HTMLElement).getByText("En vigueur"),
    ).toBeInTheDocument();
  });

  it("shows a resold product's sale prices alone when the purchases are withheld", async () => {
    server.use(
      ...catalogHandlers(
        makeCatalogStore({
          products: [makeResaleProduct()],
          purchasePrices: makePurchasePrices(),
        }),
      ),
    );
    // Without purchases.view the server answers no purchase at all.
    server.use(
      http.get(`${apiV1}/catalog/products/:productId/price-history`, () =>
        ok({
          priceHistory: {
            productId: "product-water",
            currentSalePriceTnd: "1.200",
            salePrices: [
              {
                id: "s1",
                salePriceTnd: "1.200",
                effectiveAt: "2026-09-01T08:00:00.000Z",
              },
            ],
            purchasePrices: null,
          },
        }),
      ),
    );
    renderAt("/produits/product-water");

    await screen.findByRole("heading", { level: 1, name: "Eau 1,5 L" });
    await userEvent.click(screen.getByRole("tab", { name: "Prix" }));

    expect(await screen.findByText("Prix de vente actuel")).toBeInTheDocument();
    expect(screen.getByText("1 prix depuis la création")).toBeInTheDocument();
    expect(screen.queryByText("Dernier prix d'achat")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "Prix d'achat" }),
    ).not.toBeInTheDocument();
  });

  it("reads how the price paid for a raw material moved", async () => {
    server.use(
      ...catalogHandlers(
        makeCatalogStore({ purchasePrices: makePurchasePrices() }),
      ),
    );
    renderAt("/matieres-premieres/raw-1", [
      ...manager.effectivePermissions,
      "raw_materials.view",
      "purchases.view",
    ]);

    await screen.findByRole("heading", { level: 1, name: "Farine T55" });
    await userEvent.click(screen.getByRole("tab", { name: "Prix" }));

    expect(await screen.findByText("Dernier prix d'achat")).toBeInTheDocument();
    expect(screen.getByText("1,320")).toBeInTheDocument();
    expect(screen.getByText("+10 %")).toBeInTheDocument();
    expect(screen.queryByText("Prix de vente actuel")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("table", { name: "Prix d'achat" })).getAllByRole(
        "row",
      ),
    ).toHaveLength(3);
  });

  it("offers no Prix tab on a raw material without purchases.view", async () => {
    server.use(...catalogHandlers(makeCatalogStore()));
    renderAt("/matieres-premieres/raw-1", [
      ...manager.effectivePermissions,
      "raw_materials.view",
    ]);

    await screen.findByRole("heading", { level: 1, name: "Farine T55" });
    expect(screen.queryByRole("tab", { name: "Prix" })).not.toBeInTheDocument();
  });

  it("shows the reload prompt on a stale version (AS-V2-15)", async () => {
    const store = makeCatalogStore();
    server.use(...catalogHandlers(store));
    renderAt("/produits");

    const row = (await screen.findByText("Pain complet")).closest(
      "tr",
    ) as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Modifier" }),
    );
    // Another tab saved a newer version meanwhile.
    store.products[0]!.version = 2;
    store.products[0]!.salePriceTnd = "1.500";
    const dialog = await screen.findByRole("dialog", {
      name: /Modifier Pain complet/,
    });
    await userEvent.clear(
      within(dialog).getByRole("textbox", { name: /Prix de vente/ }),
    );
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /Prix de vente/ }),
      "1,3",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Fiche modifiée entre-temps",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Recharger" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(/1,500/)).toBeInTheDocument();
  });

  it("hides the creation and row actions without the permissions", async () => {
    renderAt("/produits", ["products.view"]);

    await screen.findByRole("table", { name: "Produits" });
    expect(
      screen.queryByRole("button", { name: "Nouveau produit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Actions" }),
    ).not.toBeInTheDocument();
    // Issue 008: the cost and the margin are the owner's figures.
    expect(
      screen.queryByRole("columnheader", { name: "Coût" }),
    ).not.toBeInTheDocument();
  });

  // Issue 008: with margin.view the owner types an approximate cost, sees
  // it in the list with the margin, and on the product page as price less
  // cost with its share of the price.
  it("captures the approximate cost and shows the margin with margin.view", async () => {
    const store = makeCatalogStore();
    server.use(...catalogHandlers(store));
    const router = renderAt("/produits", [
      ...manager.effectivePermissions,
      "margin.view",
    ]);

    const table = await screen.findByRole("table", { name: "Produits" });
    expect(
      within(table).getByRole("columnheader", { name: "Coût" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Marge" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByText("Pain complet").closest("tr"),
    ).toHaveTextContent("—");

    await userEvent.click(
      within(
        within(table).getByText("Pain complet").closest("tr") as HTMLElement,
      ).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Modifier" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Modifier Pain complet",
    });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /Coût approximatif/ }),
      "0,8",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(store.products[0]).toMatchObject({ approximateCostTnd: "0.8" });
    await waitFor(() =>
      expect(
        within(screen.getByRole("table", { name: "Produits" }))
          .getByText("Pain complet")
          .closest("tr"),
      ).toHaveTextContent("0,400"),
    );

    await userEvent.click(
      within(screen.getByRole("table", { name: "Produits" })).getByText(
        "Pain complet",
      ),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/produits/product-1"),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Pain complet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Coût approximatif").parentElement,
    ).toHaveTextContent("0,800");
    expect(
      screen.getByText("Marge approximative").parentElement,
    ).toHaveTextContent("0,400 TND (33,3 %)");
  });

  it("shows the empty and error states", async () => {
    server.use(
      ...authHandlers(manager),
      ...catalogHandlers(makeCatalogStore({ products: [] })),
    );
    const { unmount } = render(
      <AppProviders client={createQueryClient({ retry: false })}>
        <RouterProvider router={createTestRouter(["/produits"])} />
      </AppProviders>,
    );
    expect(await screen.findByText("Aucun produit")).toBeInTheDocument();
    unmount();

    server.use(
      http.get(`${apiV1}/catalog/products`, () =>
        apiError(503, "SERVICE_UNAVAILABLE", ""),
      ),
    );
    renderAt("/produits");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Service indisponible",
    );
  });
  // Issue #66: the product page shows the latest simulation whose target
  // is this product, never another product's, and its adjustment dialog
  // keeps the page's product fixed and states the impact from the real
  // balance.
  it("shows the simulation linked to the product and adjusts it without a picker", async () => {
    server.use(
      ...catalogHandlers(makeCatalogStore()),
      ...inventoryHandlers(makeInventoryStore()),
      ...simulationHandlers(
        makeSimulationStore({
          simulations: [
            makeSimulation({
              id: "sim-other",
              name: "Croissant pur beurre",
              targetProductId: "product-2",
              costPerOutputUnitTnd: "0.900",
              updatedAt: "2026-09-25T08:00:00.000Z",
            }),
            makeSimulation({
              id: "sim-old",
              name: "Pain complet 2025",
              targetProductId: "product-1",
              costPerOutputUnitTnd: "0.500",
              updatedAt: "2026-09-01T08:00:00.000Z",
            }),
            makeSimulation({
              id: "sim-latest",
              name: "Pain complet 2026",
              targetProductId: "product-1",
              costPerOutputUnitTnd: "0.610",
              updatedAt: "2026-09-20T08:00:00.000Z",
            }),
          ],
        }),
      ),
    );
    renderAt("/produits/product-1", [
      ...manager.effectivePermissions,
      "margin.view",
      "simulations.view",
      "inventory.adjust",
    ]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Pain complet" }),
    ).toBeInTheDocument();
    const hint = await screen.findByRole("link", {
      name: /Pain complet 2026/,
    });
    expect(hint).toHaveAttribute("href", "/simulations/sim-latest");
    expect(hint).toHaveTextContent("0,610 TND");
    expect(screen.queryByText(/Croissant pur beurre/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ajustement" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Ajustement de stock",
    });
    expect(
      within(dialog).queryByRole("combobox", { name: "Article" }),
    ).not.toBeInTheDocument();
    // The quantity formatter joins number and unit with a no-break space.
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: "Article",
        }) as HTMLInputElement
      ).value,
    ).toMatch(/^Pain complet · stock actuel 18.pièce$/);
  });
  // Issue #64: the photo is chosen in the product dialog and sent once the
  // product is saved; the list shows it; "Retirer la photo" removes it.
  it("uploads a photo from the product dialog and removes it again", async () => {
    const store = makeCatalogStore();
    server.use(...catalogHandlers(store));
    renderAt("/produits");

    const table = await screen.findByRole("table", { name: "Produits" });
    const row = within(table)
      .getByText("Pain complet")
      .closest("tr") as HTMLElement;
    expect(row.querySelector("img")).toBeNull();
    await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Modifier" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Modifier Pain complet",
    });
    await userEvent.upload(
      within(dialog).getByLabelText("Photo"),
      new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])],
        "pain.png",
        {
          type: "image/png",
        },
      ),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(store.products[0]).toMatchObject({
      imageUrl: "/media/products/product-1.webp",
    });
    // The test environment points the API at another origin, so the
    // thumbnail address carries that origin in front of the path.
    await waitFor(() =>
      expect(
        (
          within(screen.getByRole("table", { name: "Produits" }))
            .getByText("Pain complet")
            .closest("tr") as HTMLElement
        )
          .querySelector("img")
          ?.getAttribute("src"),
      ).toMatch(/\/media\/products\/product-1\.webp$/),
    );

    const rowWithPhoto = within(screen.getByRole("table", { name: "Produits" }))
      .getByText("Pain complet")
      .closest("tr") as HTMLElement;
    await userEvent.click(
      within(rowWithPhoto).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Modifier" }),
    );
    const again = await screen.findByRole("dialog", {
      name: "Modifier Pain complet",
    });
    await userEvent.click(
      within(again).getByRole("button", { name: "Retirer la photo" }),
    );
    await userEvent.click(
      within(again).getByRole("button", { name: "Enregistrer" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(store.products[0]).toMatchObject({ imageUrl: null });
  });

  it("refuses a photo that is not an image before any request", async () => {
    renderAt("/produits");
    await userEvent.click(
      await screen.findByRole("button", { name: "Nouveau produit" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Nouveau produit" });
    await userEvent.upload(
      within(dialog).getByLabelText("Photo"),
      new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }),
      // The field's `accept` would filter it in the browser's picker; the
      // guard behind it is what this test covers.
      { applyAccept: false },
    );
    expect(
      within(dialog).getByText(
        "La photo doit être un fichier JPEG, PNG ou WebP.",
      ),
    ).toBeInTheDocument();
  });
});
