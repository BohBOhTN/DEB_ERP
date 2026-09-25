import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import {
  makeCatalogStore,
  catalogHandlers,
} from "../../test/msw/handlers/catalog";
import { makeUser } from "../../test/factories/user";
import { apiError, apiV1 } from "../../test/msw/envelope";
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
});
