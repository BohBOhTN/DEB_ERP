import { expect, test, type Page } from "@playwright/test";
import { mockApi, ownerPermissions } from "./mockApi";

/// Issue 014: the analyses read at the three review widths. Every tab
/// draws its charts from the mocked month and never pushes the page
/// sideways; a wide grid scrolls inside its own card.
async function expectNoPageOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, `${label} overflows horizontally`).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ page }) => {
  await mockApi(page, { signedIn: true, permissions: ownerPermissions });
});

test("reads the month: figures, trend, channels, then each tab", async ({
  page,
}) => {
  await page.goto("/analyses");
  await expect(
    page.getByRole("heading", { level: 1, name: "Analyses" }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "30 jours" })).toBeChecked();
  await expect(page.getByText("4 800,000")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Chiffre d'affaires par jour" }),
  ).toBeVisible();
  await expect(
    page.getByRole("figure", { name: "Chiffre d'affaires par canal" }),
  ).toBeVisible();
  await expectNoPageOverflow(page, "Vue d'ensemble");

  await page.getByRole("tab", { name: "Fréquence" }).click();
  await expect(page).toHaveURL(/tab=frequency/);
  await expect(page.getByText("Samedi 8 h")).toBeVisible();
  await expect(
    page.getByRole("grid", { name: "Quand vendez-vous ?" }),
  ).toBeVisible();
  await expectNoPageOverflow(page, "Fréquence");

  await page.getByRole("tab", { name: "Produits" }).click();
  await expect(
    page.getByRole("list", {
      name: "Meilleures ventes par chiffre d'affaires",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Produits sans vente" }),
  ).toBeVisible();
  await expectNoPageOverflow(page, "Produits");

  await page.getByRole("tab", { name: "Clients" }).click();
  await expect(
    page.getByRole("list", { name: "Clients à relancer" }),
  ).toBeVisible();
  await expectNoPageOverflow(page, "Clients");
});

test("keeps the period and the tab in the address", async ({ page }) => {
  await page.goto("/analyses?tab=frequency&period=last90&source=orders");

  await expect(page.getByRole("radio", { name: "90 jours" })).toBeChecked();
  await expect(
    page.getByRole("grid", {
      name: "Quand les commandes sont-elles à retirer ?",
    }),
  ).toBeVisible();
  await expect(page.getByText("Vendredi 16 h")).toBeVisible();
});

test("crosses the heat map with one tab stop and the arrow keys", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "keyboard flow: tablet and desktop projects");
  await page.goto("/analyses?tab=frequency");
  const grid = page.getByRole("grid", { name: "Quand vendez-vous ?" });
  await expect(grid).toBeVisible();

  // The busiest cell is the grid's only tab stop.
  const busiest = grid.getByRole("gridcell", { name: /^Samedi, 8 h à 9 h/ });
  await busiest.focus();
  await expect(busiest).toBeFocused();
  await expect(grid.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);

  await page.keyboard.press("ArrowRight");
  await expect(
    grid.getByRole("gridcell", { name: /^Samedi, 9 h à 10 h : 40 ventes/ }),
  ).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(
    grid.getByRole("gridcell", {
      name: "Vendredi, 9 h à 10 h : aucune vente",
    }),
  ).toBeFocused();
  await expect(
    page.getByText("Vendredi, 9 h à 10 h : aucune vente"),
  ).toBeVisible();
});
