import { expect, test } from "@playwright/test";
import { makeDistributionState, mockDistribution } from "./distribution";
import { expectLineEditorFits } from "./lineEditor";
import { mockApi, ownerPermissions } from "./mockApi";

/// AS-014, AS-015, AS-016 and AS-V2-20 at 360 and 1280 px: dispatch 40 breads
/// to Karim, settle them as 30 sold, 8 returned, 2 unaccounted (blocked
/// until the line reconciles), then the custody board shows nothing held
/// and the discrepancy, the receivable is 36,000, and a 20,000 payment
/// reduces it without touching custody.
test("dispatches, settles with a reconciled equation and records a payment", async ({
  page,
}) => {
  const state = makeDistributionState();
  await mockApi(page, { signedIn: true, permissions: ownerPermissions });
  await mockDistribution(page, state);

  await page.goto("/distribution/sorties/nouvelle");
  await expect(
    page.getByRole("heading", { level: 1, name: "Nouvelle sortie" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Distributeur" }).click();
  await page.getByPlaceholder("Nom du distributeur").fill("karim");
  await page.getByText("Karim Distribution").click();
  await page.getByRole("combobox", { name: "Produit 1" }).click();
  await page.getByPlaceholder("Rechercher produit").fill("pain");
  await page.getByText("Pain complet").click();
  await page.getByRole("textbox", { name: "Quantité 1" }).fill("40");
  await page.getByRole("button", { name: "Enregistrer la sortie" }).click();
  const confirmDispatch = page.getByRole("alertdialog", {
    name: "Confirmer la sortie",
  });
  await expect(confirmDispatch).toContainText("Aucune vente ni dette");
  await confirmDispatch.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Sortie enregistrée").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "BL-000001" }),
  ).toBeVisible();
  expect(state.settlements).toHaveLength(0);

  await page.getByRole("button", { name: "Régler la sortie" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Régler BL-000001" }),
  ).toBeVisible();
  const line = page.getByRole("group", { name: "Pain complet" });
  await expect(line).toContainText("Reste 40 à classer");
  await expect(
    page.getByRole("button", { name: "Régler la sortie" }),
  ).toBeDisabled();
  await line.getByRole("textbox", { name: "Vendue Pain complet" }).fill("30");
  await line.getByRole("textbox", { name: "Retournée Pain complet" }).fill("8");
  await expect(line).toContainText("Reste 2 à classer");
  await expect(
    page.getByRole("button", { name: "Régler la sortie" }),
  ).toBeDisabled();
  await line
    .getByRole("textbox", { name: "Non justifiée Pain complet" })
    .fill("2");
  await expect(line).toContainText("Équation vérifiée");
  await expect(line).toContainText("Revenu 36,000 TND");
  await page.getByRole("button", { name: "Régler la sortie" }).click();
  const confirmSettlement = page.getByRole("alertdialog", {
    name: "Régler BL-000001",
  });
  await expect(confirmSettlement).toContainText(
    "Retour en stock principal : +8 Pain complet.",
  );
  await expect(confirmSettlement).toContainText(
    "signalé comme écart sans créer de dette",
  );
  await confirmSettlement.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Sortie réglée").first()).toBeVisible();
  expect(state.settlements[0]).toMatchObject({
    totalTnd: "36.000",
    remainingDueTnd: "36.000",
  });
  expect(state.dispatches[0]?.status).toBe("CLOSED");

  await page.goto("/distribution/depot-vente");
  await expect(
    page.getByRole("status", { name: "Totaux du dépôt" }),
  ).toContainText("0");
  await expect(page.getByText("2 non justifiées").first()).toBeVisible();

  await page.goto("/distributeurs/distributor-1");
  await expect(page.getByRole("main")).toContainText("36,000 TND");
  await page.getByRole("button", { name: "Nouveau paiement" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau paiement" });
  await dialog.getByRole("textbox", { name: /^Montant/ }).fill("20");
  await dialog
    .getByRole("textbox", { name: "Affectation RG-000002" })
    .fill("20");
  await dialog.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Paiement enregistré").first()).toBeVisible();
  await expect(page.getByRole("main")).toContainText("16,000 TND");
  expect(state.payments[0]).toMatchObject({ amountTnd: "20.000" });
  expect(state.dispatches[0]?.lines[0]?.unaccountedQuantity).toBe("2.000000");

  // Issue 009: the Accueil quick action lands on the direct-sale dialog,
  // whose lines take an edited price or a typed total and fit the dialog
  // at every width.
  await page.goto("/distributeurs?vente=directe");
  const sale = page.getByRole("dialog", { name: "Vente directe" });
  await expect(sale).toBeVisible();
  await sale.getByRole("combobox", { name: "Produit 1" }).click();
  await page.getByRole("option", { name: /Pain complet/ }).click();
  await sale.getByRole("textbox", { name: "Quantité 1" }).fill("4");
  await expect(
    sale.getByRole("textbox", { name: "Prix unitaire 1" }),
  ).toHaveValue("1,200");
  await sale.getByRole("textbox", { name: "Total ligne 1" }).fill("10");
  await expect(
    sale.getByRole("textbox", { name: "Prix unitaire 1" }),
  ).toHaveValue("2,500");
  await expectLineEditorFits(
    page,
    sale
      .getByRole("combobox", { name: "Produit 1" })
      .locator("xpath=ancestor::li[1]"),
  );
});
