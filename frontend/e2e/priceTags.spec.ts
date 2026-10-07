import { expect, test } from "@playwright/test";
import { makeCatalogueStockState, mockCatalogueStock } from "./catalogueStock";
import { mockApi, ownerPermissions } from "./mockApi";

const bread = {
  id: "category-bread",
  name: "Pains",
  description: null,
  isActive: true,
};
const piece = {
  id: "unit-piece",
  code: "PC",
  name: "Pièce",
  symbol: "pièce",
  precision: 0,
  isActive: true,
};
const kg = {
  id: "unit-kg",
  code: "KG",
  name: "Kilogramme",
  symbol: "kg",
  precision: 3,
  isActive: true,
};

const MM = 96 / 25.4;

/// Runs in the page: the tags of a sheet whose name lost its last line or
/// whose price no longer fits its frame.
function countClipped(sheet: Element) {
  return Array.from(sheet.querySelectorAll("article")).filter((tag) => {
    const frame = tag.firstElementChild as HTMLElement;
    const name = tag.querySelector("h3") as HTMLElement;
    const price = tag.querySelector("p") as HTMLElement;
    const line = parseFloat(getComputedStyle(name).fontSize) * 1.15;
    return (
      frame.scrollHeight > frame.clientHeight + 1 ||
      name.clientHeight < line - 1 ||
      price.scrollWidth > price.clientWidth + 1
    );
  }).length;
}

/// Issue 024: pick products, set the format, read the sheet; then, under
/// the print media, the sheet is A4 at true size with the tags packed from
/// the top-left corner and nothing clipped inside a tag.
test("composes a sheet of price tags and prints it at true size", async ({
  page,
}) => {
  const state = makeCatalogueStockState();
  const names = [
    "Pain complet",
    "Baguette tradition",
    "Pain de campagne aux noix et aux raisins secs",
    "Gâteau au kilo",
  ];
  names.forEach((name, index) => {
    const perKg = name === "Gâteau au kilo";
    state.products.push({
      id: `product-${index + 1}`,
      code: null,
      barcode: null,
      name,
      categoryId: bread.id,
      baseUnitId: perKg ? kg.id : piece.id,
      salePriceTnd: perKg ? "24.500" : "1.200",
      isStockable: true,
      isActive: true,
      notes: null,
      version: 1,
      createdAt: "2026-10-01T08:00:00.000Z",
      category: bread,
      baseUnit: perKg ? kg : piece,
    });
  });
  await mockApi(page, { signedIn: true, permissions: ownerPermissions });
  await mockCatalogueStock(page, state);

  await page.goto("/produits/etiquettes");
  await expect(
    page.getByRole("heading", { level: 1, name: "Étiquettes de prix" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimer" })).toBeDisabled();

  const list = page.getByRole("group", { name: "Produits" });
  await list.getByRole("checkbox", { name: "Pain complet" }).check();
  await list.getByRole("checkbox", { name: "Gâteau au kilo" }).check();
  await list.getByRole("checkbox", { name: /Pain de campagne/ }).check();
  await expect(page.getByText("3 étiquettes sur 1 feuille A4")).toBeVisible();

  const copies = page.getByRole("textbox", {
    name: "Exemplaires de Pain complet",
  });
  await copies.fill("16");
  await copies.blur();
  await expect(page.getByText("18 étiquettes sur 1 feuille A4")).toBeVisible();

  await list.getByRole("checkbox", { name: "Baguette tradition" }).check();
  await expect(page.getByText("19 étiquettes sur 2 feuilles A4")).toBeVisible();

  // No horizontal scroll with the scaled sheets; on the phone the layout
  // viewport must not have grown past the device width either.
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.inner);
  expect(width.inner).toBe(page.viewportSize()?.width);

  await page.emulateMedia({ media: "print" });
  const sheets = page.locator("[aria-label^='Feuille ']");
  await expect(sheets).toHaveCount(2);
  await expect(list).toBeHidden();

  const first = sheets.first();
  const box = await first.boundingBox();
  expect(box?.width).toBeCloseTo(210 * MM, 0);
  expect(box?.height).toBeCloseTo(297 * MM, 0);

  // Eighteen slots: 2 × 7 upright from (8, 8) mm, four turned at x = 148 mm.
  const slots = await first.evaluate((sheet) =>
    Array.from(sheet.children).map((child) => {
      const rect = child.getBoundingClientRect();
      const origin = sheet.getBoundingClientRect();
      return {
        x: rect.left - origin.left,
        y: rect.top - origin.top,
        w: rect.width,
        h: rect.height,
      };
    }),
  );
  expect(slots).toHaveLength(18);
  expect(slots[0]).toMatchObject({
    x: expect.closeTo(8 * MM, 0),
    y: expect.closeTo(8 * MM, 0),
    w: expect.closeTo(70 * MM, 0),
    h: expect.closeTo(40 * MM, 0),
  });
  expect(slots[2]).toMatchObject({
    x: expect.closeTo(148 * MM, 0),
    y: expect.closeTo(8 * MM, 0),
    w: expect.closeTo(40 * MM, 0),
    h: expect.closeTo(70 * MM, 0),
  });
  expect(slots[17]).toMatchObject({
    x: expect.closeTo(78 * MM, 0),
    y: expect.closeTo(248 * MM, 0),
  });

  // The long name keeps at least one line and the price stays whole
  // inside the gold frame.
  const clipped = await first.evaluate(countClipped);
  expect(clipped).toBe(0);
  await expect(
    first.getByRole("article", { name: /^Gâteau au kilo/ }),
  ).toContainText("TND / kg");

  // The other presets scale the type with the tag: nothing clipped either.
  for (const preset of ["Petite", "Grande"]) {
    await page.emulateMedia({ media: "screen" });
    await page.getByRole("radio", { name: preset }).click();
    await page.emulateMedia({ media: "print" });
    const clippedAt = await sheets.first().evaluate(countClipped);
    expect(clippedAt, preset).toBe(0);
  }
});
