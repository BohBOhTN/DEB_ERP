import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { kg, makeProduct, pastryCategory } from "../../test/factories/catalog";
import { makeUser } from "../../test/factories/user";
import {
  catalogHandlers,
  makeCatalogStore,
} from "../../test/msw/handlers/catalog";
import { authHandlers } from "../../test/msw/handlers/auth";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";

const viewer = makeUser({
  effectivePermissions: ["products.view", "categories.view"],
});

function renderAt(path: string) {
  mockViewport(1280);
  server.use(...authHandlers(viewer));
  const router = createTestRouter([path]);
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return router;
}

const store = () =>
  makeCatalogStore({
    products: [
      makeProduct({ id: "product-1", name: "Pain complet" }),
      makeProduct({
        id: "product-2",
        name: "Croissant",
        categoryId: pastryCategory.id,
        category: pastryCategory,
        salePriceTnd: "1.000",
      }),
      makeProduct({
        id: "product-3",
        name: "Gâteau au kilo",
        categoryId: pastryCategory.id,
        category: pastryCategory,
        baseUnitId: kg.id,
        baseUnit: kg,
        salePriceTnd: "24.500",
      }),
      makeProduct({ id: "product-4", name: "Ancien pain", isActive: false }),
    ],
  });

describe("Étiquettes de prix", () => {
  beforeAll(async () => {
    await Promise.all([
      import("./pages/PriceTagsPage"),
      import("./pages/ProductsPage"),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists the active products, fills the sheet from the selection and prints it", async () => {
    server.use(...catalogHandlers(store()));
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderAt("/produits/etiquettes");

    const list = await screen.findByRole("group", { name: "Produits" });
    expect(
      await within(list).findByRole("checkbox", { name: "Pain complet" }),
    ).toBeInTheDocument();
    expect(within(list).getByText(/24,500/)).toHaveTextContent("/ kg");
    expect(within(list).queryByText("Ancien pain")).not.toBeInTheDocument();
    expect(
      screen.getByText("La feuille se remplit au fil de la sélection."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Imprimer" })).toBeDisabled();
    expect(
      screen.getByText("18 par feuille A4, 92 % de la feuille"),
    ).toBeInTheDocument();

    await userEvent.click(
      within(list).getByRole("checkbox", { name: "Pain complet" }),
    );
    await userEvent.click(
      within(list).getByRole("checkbox", { name: "Gâteau au kilo" }),
    );

    expect(
      screen.getByText("2 étiquettes sur 1 feuille A4"),
    ).toBeInTheDocument();
    const sheet = screen.getByRole("group", { name: "Feuille 1 sur 1" });
    expect(
      within(sheet).getByRole("article", { name: /^Pain complet, 1,200/ }),
    ).toHaveTextContent("Dar El Barka");
    expect(
      within(sheet).getByRole("article", {
        name: /^Gâteau au kilo, 24,500/,
      }),
    ).toHaveTextContent("TND / kg");

    await userEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("prints several copies, removes a product and clears the selection", async () => {
    server.use(...catalogHandlers(store()));
    renderAt("/produits/etiquettes");

    const list = await screen.findByRole("group", { name: "Produits" });
    await userEvent.click(
      await within(list).findByRole("checkbox", { name: "Croissant" }),
    );
    await userEvent.click(
      within(list).getByRole("checkbox", { name: "Pain complet" }),
    );

    const copies = screen.getByRole("textbox", {
      name: "Exemplaires de Croissant",
    });
    await userEvent.clear(copies);
    await userEvent.type(copies, "3");
    await userEvent.tab();

    expect(
      screen.getByText("4 étiquettes sur 1 feuille A4"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("article", { name: /^Croissant, 1,000/ }),
    ).toHaveLength(3);

    await userEvent.click(
      screen.getByRole("button", { name: "Retirer Croissant" }),
    );
    expect(
      screen.getByText("1 étiquette sur 1 feuille A4"),
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("checkbox", { name: "Croissant" }),
    ).not.toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Tout retirer" }));
    expect(screen.getByText("Aucun produit choisi")).toBeInTheDocument();
  });

  it("filters by search and category, selects the rows shown and keeps the selection", async () => {
    server.use(...catalogHandlers(store()));
    renderAt("/produits/etiquettes");

    const list = await screen.findByRole("group", { name: "Produits" });
    await within(list).findByRole("checkbox", { name: "Pain complet" });

    await userEvent.click(screen.getByRole("combobox", { name: "Catégorie" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Pâtisserie" }),
    );
    await waitFor(() =>
      expect(
        within(list).queryByRole("checkbox", { name: "Pain complet" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(list).getByRole("checkbox", { name: "Croissant" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Tout sélectionner" }),
    );
    expect(screen.getByText("2 produits, 2 étiquettes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tout sélectionner" }),
    ).toBeDisabled();

    await userEvent.type(
      screen.getByRole("searchbox", { name: /Rechercher/ }),
      "crois",
    );
    await waitFor(() =>
      expect(
        within(list).queryByRole("checkbox", { name: "Gâteau au kilo" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("2 produits, 2 étiquettes")).toBeInTheDocument();
  });

  it("changes the format with the presets and free sizes, within the sheet", async () => {
    server.use(...catalogHandlers(store()));
    const router = renderAt("/produits/etiquettes");
    await screen.findByRole("group", { name: "Produits" });

    await userEvent.click(screen.getByRole("radio", { name: "Petite" }));
    expect(
      screen.getByText("33 par feuille A4, 91 % de la feuille"),
    ).toBeInTheDocument();
    expect(router.state.location.search).toContain("w=50");
    expect(router.state.location.search).toContain("h=30");

    const width = screen.getByRole("textbox", { name: "Largeur" });
    await userEvent.clear(width);
    await userEvent.type(width, "300");
    await userEvent.tab();
    expect(width).toHaveValue("194");
    expect(screen.getByRole("radio", { name: "Libre" })).toBeChecked();

    const height = screen.getByRole("textbox", { name: "Hauteur" });
    await userEvent.clear(height);
    await userEvent.type(height, "281");
    await userEvent.tab();
    expect(
      screen.getByText("1 par feuille A4, 100 % de la feuille"),
    ).toBeInTheDocument();
  });

  it("is reached from the products page", async () => {
    server.use(...catalogHandlers(store()));
    const router = renderAt("/produits");
    await screen.findByRole("table", { name: "Produits" });

    await userEvent.click(screen.getByRole("button", { name: "Étiquettes" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/produits/etiquettes"),
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Étiquettes de prix",
      }),
    ).toBeInTheDocument();
  });
});
