import { expect, test } from "@playwright/test";
import { makeCatalogueStockState, mockCatalogueStock } from "./catalogueStock";
import { mockApi, ownerPermissions } from "./mockApi";

/// AS-V2-14: on a 360 px phone (and on desktop), create "Pain complet", set
/// opening stock 20 pièces, adjust −2 with reason "Casse"; both movements
/// listed with French labels, balance 18, no identifier typed or shown.
test("creates a product, sets opening stock and adjusts it with a reason", async ({
  page,
}) => {
  const state = makeCatalogueStockState();
  // Registered after the shell mock so these routes take precedence.
  await mockApi(page, { signedIn: true, permissions: ownerPermissions });
  await mockCatalogueStock(page, state);

  await page.goto("/produits");
  await expect(
    page.getByRole("heading", { level: 1, name: "Produits" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nouveau produit" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau produit" });
  await dialog.getByLabel(/^Nom/).fill("Pain complet");
  await dialog.getByRole("combobox", { name: /Catégorie/ }).click();
  await page.getByRole("option", { name: "Pains" }).click();
  await dialog.getByRole("combobox", { name: /Unité de base/ }).click();
  await page.getByRole("option", { name: /Pièce/ }).click();
  await dialog.getByRole("textbox", { name: /Prix de vente/ }).fill("1,2");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("main").getByText("Pain complet", { exact: true }).first(),
  ).toBeVisible();

  await page.goto("/stock");
  await page.getByRole("button", { name: "Stock d'ouverture" }).click();
  const opening = page.getByRole("dialog", { name: "Stock d'ouverture" });
  await opening.getByRole("combobox", { name: "Article" }).click();
  await page.getByPlaceholder("Nom de l'article").fill("pain");
  await page.getByText(/stock actuel 0/).click();
  await opening.getByRole("textbox", { name: "Quantité" }).fill("20");
  await opening.getByLabel(/Motif/).fill("Inventaire initial");
  await opening.getByRole("button", { name: "Suivant" }).click();
  const confirmOpening = page.getByRole("alertdialog", {
    name: "Stock d'ouverture",
  });
  await expect(confirmOpening).toContainText("passera de 0 pièce à 20 pièce");
  await confirmOpening.getByRole("button", { name: "Valider" }).click();
  await expect(
    page.getByText("Stock d'ouverture enregistré").first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ajustement" }).click();
  const adjustment = page.getByRole("dialog", { name: "Ajustement de stock" });
  await adjustment.getByRole("combobox", { name: "Article" }).click();
  await page.getByPlaceholder("Nom de l'article").fill("pain");
  await page.getByText(/stock actuel 20/).click();
  await expect(adjustment.getByRole("radio", { name: "Sortie" })).toBeChecked();
  await adjustment.getByRole("textbox", { name: "Quantité" }).fill("2");
  await adjustment.getByLabel(/Motif/).fill("Casse");
  await adjustment.getByRole("button", { name: "Suivant" }).click();
  const confirmAdjustment = page.getByRole("alertdialog", {
    name: "Ajustement de stock",
  });
  await expect(confirmAdjustment).toContainText(
    "passera de 20 pièce à 18 pièce",
  );
  await confirmAdjustment.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Ajustement enregistré").first()).toBeVisible();
  await expect(page.getByRole("main")).toContainText("18");

  await page.goto("/stock/mouvements");
  const main = page.getByRole("main");
  await expect(
    main.getByText("Stock d'ouverture", { exact: true }).first(),
  ).toBeVisible();
  await expect(main.getByText("Ajustement (sortie)").first()).toBeVisible();
  await expect(main.getByText(/Casse/).first()).toBeVisible();
  const text = await main.textContent();
  expect(text).not.toMatch(/product-\d|movement-\d|[0-9a-f]{8}-[0-9a-f]{4}/);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

/// AS-V2-15: editing a product whose version moved on shows the reload
/// prompt and never overwrites the newer price.
test("refuses to overwrite a product saved elsewhere", async ({ page }) => {
  const state = makeCatalogueStockState();
  state.products.push({
    id: "product-1",
    code: null,
    barcode: null,
    name: "Pain complet",
    categoryId: "category-bread",
    baseUnitId: "unit-piece",
    salePriceTnd: "1.200",
    isStockable: true,
    isActive: true,
    notes: null,
    version: 1,
    createdAt: new Date().toISOString(),
    category: {
      id: "category-bread",
      name: "Pains",
      description: null,
      isActive: true,
    },
    baseUnit: {
      id: "unit-piece",
      code: "PC",
      name: "Pièce",
      symbol: "pièce",
      precision: 0,
      isActive: true,
    },
  });
  // Registered after the shell mock so these routes take precedence.
  await mockApi(page, { signedIn: true, permissions: ownerPermissions });
  await mockCatalogueStock(page, state);

  await page.goto("/produits");
  // The list is a table on desktop and cards on a phone; one product, one action menu.
  await page
    .getByRole("main")
    .getByRole("button", { name: "Actions" })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Modifier" }).click();
  const dialog = page.getByRole("dialog", { name: /Modifier Pain complet/ });
  // Another tab saves a newer version while this dialog is open.
  state.products[0]!.version = 2;
  state.products[0]!.salePriceTnd = "1.500";
  await dialog.getByRole("textbox", { name: /Prix de vente/ }).fill("1,3");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();

  await expect(dialog.getByRole("alert")).toContainText(
    "Fiche modifiée entre-temps",
  );
  await dialog.getByRole("button", { name: "Recharger" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("main")).toContainText("1,500");
  expect(state.products[0]!.salePriceTnd).toBe("1.500");
});
