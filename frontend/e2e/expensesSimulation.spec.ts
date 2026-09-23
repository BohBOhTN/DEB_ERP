import { expect, test } from "@playwright/test";
import {
  makeExpensesSimulationState,
  mockExpensesSimulation,
} from "./expensesSimulation";
import { mockApi, ownerPermissions } from "./mockApi";

/// AS-017 and AS-V2-21 at 360 and 1280 px: cancel a posted expense with a
/// reason, then the month view shows it as "Annulée", excludes it from the
/// total and the chart. AS-018: a 6,350 TND scenario for 50 pieces reads
/// 0,127 TND per piece and states it touches nothing operational.
test("cancels an expense out of the month totals and simulates a unit cost", async ({
  page,
}) => {
  const state = makeExpensesSimulationState();
  await mockApi(page, { signedIn: true, permissions: ownerPermissions });
  await mockExpensesSimulation(page, state);

  await page.goto("/depenses");
  await expect(
    page.getByRole("heading", { level: 1, name: "Dépenses" }),
  ).toBeVisible();
  await expect(page.getByText("Total dépenses").locator("../..")).toContainText(
    "920,000 TND",
  );
  await expect(page.getByRole("main")).toContainText("2 dépenses validées");
  const row = page
    .getByRole("main")
    .getByText("Facture STEG")
    .first()
    .locator("xpath=ancestor::*[self::tr or self::li or self::article][1]");
  await row.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Annuler" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Annuler DEP-000001" });
  await expect(dialog).toContainText(
    "exclue des totaux et restera visible dans l'historique",
  );
  await dialog.getByLabel(/Motif/).fill("Facture en double");
  await dialog.getByRole("button", { name: "Annuler la dépense" }).click();
  await expect(page.getByText("Dépense annulée").first()).toBeVisible();
  await expect(page.getByText("Total dépenses").locator("../..")).toContainText(
    "800,000 TND",
  );
  await expect(page.getByRole("main")).toContainText("1 dépense validée");
  await expect(page.getByRole("main")).toContainText("Annulée");
  expect(state.expenses[0]).toMatchObject({
    status: "CANCELLED",
    cancellationReason: "Facture en double",
  });

  await page.goto("/simulations/nouvelle");
  await expect(
    page.getByRole("heading", { level: 1, name: "Nouvelle simulation" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText(
    "Une simulation n'a aucun effet sur le stock ni la comptabilité.",
  );
  await page.getByLabel(/^Nom/).fill("Baguette tradition");
  await page.getByRole("textbox", { name: /Quantité produite/ }).fill("50");
  await page.getByRole("combobox", { name: "Unité produite" }).click();
  await page.getByRole("option", { name: "Pièce" }).click();
  await page.getByRole("combobox", { name: "Matière première 1" }).click();
  await page.getByPlaceholder("Nom de l'article").fill("farine");
  await page.getByText(/Farine T55/).click();
  await page.getByRole("textbox", { name: "Quantité 1" }).fill("3");
  await page.getByRole("textbox", { name: "Prix unitaire 1" }).fill("1,8");
  await page.getByRole("button", { name: "Ajouter un ingrédient" }).click();
  await page.getByRole("radio", { name: "Ingrédient libre" }).nth(1).click();
  await page.getByRole("textbox", { name: "Ingrédient 2" }).fill("Levure");
  await page.getByRole("textbox", { name: "Quantité 2" }).fill("0,1");
  await page.getByRole("textbox", { name: "Prix unitaire 2" }).fill("9");
  await page.getByRole("button", { name: "Ajouter un ingrédient" }).click();
  await page.getByRole("radio", { name: "Ingrédient libre" }).nth(2).click();
  await page.getByRole("textbox", { name: "Ingrédient 3" }).fill("Sel");
  await page.getByRole("textbox", { name: "Quantité 3" }).fill("0,05");
  await page.getByRole("textbox", { name: "Prix unitaire 3" }).fill("1");
  await expect(
    page.getByText("Coût unitaire (par pièce)").locator(".."),
  ).toContainText("0,127 TND");
  await page.getByRole("button", { name: "Enregistrer la simulation" }).click();
  await expect(page.getByText("Simulation enregistrée").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Baguette tradition" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("6,350 TND");
  expect(state.simulations[0]).toMatchObject({
    totalIngredientCostTnd: "6.350",
    costPerOutputUnitTnd: "0.127",
  });
});
