import { expect, test } from "@playwright/test";
import {
  makeCustomersOrdersState,
  mockCustomersOrders,
} from "./customersOrders";
import { mockApi, ownerPermissions } from "./mockApi";

/// AS-V2-17 on a 360 px phone and on desktop: create an order for tomorrow
/// with a 20,000 TND advance while a session is open, then complete it
/// paying the remainder; the linked sale appears and the customer owes
/// nothing.
test("creates an order with an advance and completes it with the remainder", async ({
  page,
}) => {
  const state = makeCustomersOrdersState();
  await mockApi(page, { signedIn: true, permissions: ownerPermissions });
  await mockCustomersOrders(page, state);

  await page.goto("/commandes/nouvelle");
  await expect(
    page.getByRole("heading", { level: 1, name: "Nouvelle commande" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Client" }).click();
  await page.getByPlaceholder("Nom ou téléphone du client").fill("amel");
  await page.getByText("Amel Trabelsi").click();
  await page.getByRole("combobox", { name: "Produit 1" }).click();
  await page.getByPlaceholder("Rechercher produit").fill("pain");
  await page.getByText("Pain complet").click();
  await page.getByRole("textbox", { name: "Quantité 1" }).fill("10");
  await expect(
    page.getByRole("textbox", { name: "Prix unitaire 1" }),
  ).toHaveValue("4,000");
  await page.getByRole("textbox", { name: /Acompte/ }).fill("20");
  await page.getByRole("button", { name: "Enregistrer la commande" }).click();

  await expect(page.getByText("Commande enregistrée").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "CMD-000001" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Acompte du");
  expect(state.orders[0]?.advanceBalanceTnd).toBe("20.000");

  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByText("Commande confirmée").first()).toBeVisible();
  await page.getByRole("button", { name: "Terminer" }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Terminer CMD-000001",
  });
  await expect(confirm).toContainText("Acompte appliqué : 20,000 TND.");
  await confirm.getByRole("textbox", { name: /^Montant/ }).fill("20");
  await expect(confirm).toContainText("Rien ne reste dû.");
  await confirm.getByRole("button", { name: "Terminer la commande" }).click();

  await expect(page.getByText("Commande terminée").first()).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Vente liée");
  await expect(page.getByRole("main")).toContainText("VT-000");
  expect(state.sales[0]).toMatchObject({
    paidAmountTnd: "40.000",
    remainingDueTnd: "0.000",
  });

  await page.goto("/clients/customer-1");
  await expect(
    page.getByRole("heading", { level: 1, name: "Amel Trabelsi" }),
  ).toBeVisible();
  await expect(page.getByText("Reste à payer").locator("..")).toContainText(
    "0,000 TND",
  );
});
