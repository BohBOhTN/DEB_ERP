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

// The bars once had a width only under the pointer: they must be drawn
// without any hover, on a phone as on a desktop, and a tap reads a bar.
test("draws the weekday and hour bars without a hover and reads a tapped bar", async ({
  page,
}) => {
  await page.goto("/analyses?tab=frequency");
  const weekdays = page.getByRole("figure", {
    name: "Moyenne par jour de la semaine",
  });
  const hours = page.getByRole("figure", { name: "Total par heure" });
  await expect(weekdays).toBeVisible();

  const barOf = (figure: typeof weekdays, name: RegExp) =>
    figure.getByRole("button", { name }).locator("span").first();
  const saturday = await barOf(weekdays, /^Sam/).boundingBox();
  const monday = await barOf(weekdays, /^Lun/).boundingBox();
  const eight = await barOf(hours, /^8h/).boundingBox();
  expect(saturday?.width ?? 0).toBeGreaterThan(8);
  expect(saturday?.height ?? 0).toBeGreaterThan(100);
  // Monday sells about a third of Saturday: a shorter bar, not a missing one.
  expect(monday?.height ?? 0).toBeGreaterThan(20);
  expect(monday?.height ?? 0).toBeLessThan(saturday?.height ?? 0);
  expect(eight?.width ?? 0).toBeGreaterThan(8);
  expect(eight?.height ?? 0).toBeGreaterThan(100);

  // The highest bar is read first; a tap moves the line to that bar.
  await expect(weekdays.getByText(/^Sam : en moyenne 22 ventes/)).toBeVisible();
  await weekdays.getByRole("button", { name: /^Lun/ }).click();
  await expect(weekdays.getByText(/^Lun : en moyenne 8 ventes/)).toBeVisible();
  await expectNoPageOverflow(page, "Fréquence, barres");
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
