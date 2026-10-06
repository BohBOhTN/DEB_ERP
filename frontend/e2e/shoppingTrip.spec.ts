import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectLineEditorFits } from "./lineEditor";
import { mockApi, ownerPermissions } from "./mockApi";
import { makeProcurementState, mockProcurement } from "./procurement";

/// Issue 018 at 360, 768 and 1280 px: one trip to the Minoterie, 10 kg of
/// flour at 1,200 TND paid on the spot and a pack of plastic bags filed
/// under "Fournitures › Emballage", validated once. The purchase page then
/// shows the bags as the other goods of the trip.
test("records a shopping trip of raw materials and other goods in one validation", async ({
  page,
}) => {
  const state = makeProcurementState();
  await mockApi(page, { signedIn: true, permissions: ownerPermissions });
  await mockProcurement(page, state);

  await page.goto("/");
  await page.getByRole("link", { name: "Course fournisseur" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Nouvelle course" }),
  ).toBeVisible();

  await page.getByRole("combobox", { name: "Fournisseur" }).click();
  await page.getByPlaceholder("Nom du fournisseur").fill("minoterie");
  await page.getByText("Minoterie du Sud").click();

  await page.getByRole("combobox", { name: "Matière première 1" }).click();
  await page.getByPlaceholder("Rechercher matière première").fill("farine");
  await page.getByText("Farine T55").click();
  await page.getByRole("textbox", { name: "Quantité 1" }).fill("10");
  await page.getByRole("textbox", { name: "Prix unitaire 1" }).fill("1,2");
  await expect(
    page.getByRole("textbox", { name: "Total ligne 1" }),
  ).toHaveValue("12,000");

  await page.getByRole("combobox", { name: "Catégorie 1" }).click();
  await page.getByRole("option", { name: "Fournitures › Emballage" }).click();
  await page
    .getByRole("textbox", { name: "Libellé 1" })
    .fill("Sachets plastiques");
  await page.getByRole("textbox", { name: "Montant 1" }).fill("12,5");
  await expectLineEditorFits(
    page,
    page
      .getByRole("combobox", { name: "Matière première 1" })
      .locator("xpath=ancestor::li[1]"),
  );
  // The other goods' line never overflows either, at any width.
  const expenseLine = page
    .getByRole("textbox", { name: "Libellé 1" })
    .locator("xpath=ancestor::li[1]");
  const overflow = await expenseLine.evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const totals = page.getByRole("complementary", { name: "Totaux" });
  await expect(totals).toContainText("12,000 TND");
  await expect(totals).toContainText("12,500 TND");
  await expect(totals).toContainText("24,500 TND");

  await page.getByRole("button", { name: "Valider la course" }).click();
  const confirm = page.getByRole("alertdialog", { name: /Valider la course/ });
  await expect(confirm).toContainText("Stock : +10 kg Farine T55.");
  await expect(confirm).toContainText(
    "Dette fournisseur Minoterie du Sud : aucune.",
  );
  await expect(confirm).toContainText("1 dépense pour 12,500 TND");
  await expect(confirm).toContainText(
    "Sortie de caisse aujourd'hui : 24,500 TND.",
  );
  const violations = (
    await new AxeBuilder({ page }).include("[role=alertdialog]").analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
  expect(violations).toEqual([]);
  await confirm.getByRole("button", { name: "Valider" }).click();

  await expect(page.getByText("Course validée").first()).toBeVisible();
  // The mock numbers the draft and the posting: the reference is read
  // from the state rather than guessed.
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: state.purchases[0]?.reference ?? "",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Autres achats de cette course" }),
  ).toBeVisible();
  const main = page.getByRole("main");
  await expect(main).toContainText("Sachets plastiques");
  await expect(main).toContainText("Emballage");
  await expect(main).toContainText("Total des autres achats");
  expect(state.purchases[0]).toMatchObject({
    status: "POSTED",
    paymentTerms: "PAID",
    totalTnd: "12.000",
  });
  expect(state.expenses[0]).toMatchObject({
    description: "Sachets plastiques",
    amountTnd: "12.500",
    purchaseId: state.purchases[0]?.id,
  });
  const pageOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(pageOverflow).toBeLessThanOrEqual(0);
});

test("refuses an empty trip before any request and keeps the summary in view", async ({
  page,
}) => {
  const state = makeProcurementState();
  await mockApi(page, { signedIn: true, permissions: ownerPermissions });
  await mockProcurement(page, state);
  let posted = 0;
  await page.route("**/api/v1/procurement/shopping-trips", (route) => {
    posted += 1;
    return route.fallback();
  });

  await page.goto("/achats/course");
  await page.getByRole("button", { name: "Retirer la ligne 1" }).click();
  await page.getByRole("button", { name: "Retirer la dépense 1" }).click();
  await page.getByRole("button", { name: "Valider la course" }).click();
  await expect(page.getByRole("alert").first()).toContainText(
    "Le formulaire contient des erreurs.",
  );
  await expect(page.getByRole("main")).toContainText(
    "Ajoutez au moins une matière première ou une dépense.",
  );
  expect(posted).toBe(0);
  expect(state.purchases).toHaveLength(0);
});
