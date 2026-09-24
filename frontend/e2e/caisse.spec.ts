import { expect, test } from "@playwright/test";
import { makeCaisseState, mockCaisse } from "./caisse";
import { mockApi, ownerPermissions } from "./mockApi";

/// AS-V2-18 at 360 px and on desktop: open the till with 50,000, add three
/// products and adjust one, pay 25,000 with change on 21,400, then a partial
/// credit sale for a registered customer, then close with a difference shown
/// before confirming. AS-V2-19: the first "Encaisser" loses its response
/// and the retry reuses the same key, so one sale exists.
test("sells on a phone with change and credit, retries a lost response once, and closes the till", async ({
  page,
  isMobile,
}) => {
  const state = makeCaisseState();
  await mockApi(page, { signedIn: true, permissions: ownerPermissions });
  await mockCaisse(page, state);

  await page.goto("/caisse");
  await expect(page.getByText("Aucune session ouverte")).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir la caisse" }).click();
  const openDialog = page.getByRole("dialog", { name: "Ouvrir la caisse" });
  await openDialog.getByRole("textbox", { name: /Fonds de caisse/ }).fill("50");
  await openDialog.getByRole("button", { name: "Ouvrir la caisse" }).click();
  await expect(page.getByText("Caisse ouverte").first()).toBeVisible();

  // Tile actions are scoped to the product list: the cart panel repeats the
  // same stepper labels on desktop.
  const tiles = page.getByRole("list", { name: "Produits" });
  const tap = (name: string) =>
    tiles.getByRole("button", { name, exact: true }).click();
  await tap("Ajouter Pain complet");
  await tap("Ajouter Croissant");
  await tap("Ajouter Pain de mie");
  await tap("Ajouter un Pain complet");
  await tap("Retirer un Croissant");
  await tap("Ajouter Croissant");

  const openCart = async (total: string) => {
    if (isMobile) {
      await expect(page.getByRole("main")).toContainText(total);
      await page.getByRole("button", { name: "Voir le panier" }).click();
      return page.getByRole("dialog", { name: /Panier/ });
    }
    return page.getByRole("main");
  };

  let cart = await openCart("5,900 TND");
  await cart.getByRole("textbox", { name: /^Montant/ }).fill("10");
  await expect(cart).toContainText("Monnaie à rendre");
  state.dropNextSaleResponse = true;
  await cart.getByRole("button", { name: "Encaisser" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Encaisser la vente" });
  await expect(confirm).toContainText("Monnaie à rendre : 4,100 TND.");
  await confirm.getByRole("button", { name: "Valider" }).click();
  await expect(confirm.getByRole("alert")).toBeVisible();
  expect(state.sales).toHaveLength(1);
  await confirm.getByRole("button", { name: /Réessayer|Valider/ }).click();
  await expect(page.getByText("Vente enregistrée").first()).toBeVisible();
  expect(state.sales).toHaveLength(1);
  expect(state.saleKeys.size).toBe(1);
  // Issue #43: the till stays open for the next customer.
  await expect(
    page.getByRole("heading", { level: 1, name: "Caisse" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Voir", exact: true }),
  ).toBeVisible();

  await tap("Ajouter Pain de mie");
  await tap("Ajouter un Pain de mie");
  cart = await openCart("5,000 TND");
  await cart.getByRole("textbox", { name: /^Montant/ }).fill("2");
  await expect(cart.getByRole("button", { name: "Encaisser" })).toBeDisabled();
  await expect(cart).toContainText(
    "Un client enregistré est obligatoire pour une vente à crédit.",
  );
  await cart.getByRole("combobox", { name: "Client" }).click();
  await page.getByPlaceholder("Client de passage").fill("amel");
  await page.getByText("Amel Trabelsi").click();
  await expect(cart).toContainText(
    "3,000 TND seront portés au compte de Amel Trabelsi",
  );
  await cart.getByRole("button", { name: "Encaisser" }).click();
  await page
    .getByRole("alertdialog", { name: "Encaisser la vente" })
    .getByRole("button", { name: "Valider" })
    .click();
  await expect(page.getByText("Vente enregistrée").first()).toBeVisible();
  expect(state.sales[0]).toMatchObject({
    paidAmountTnd: "2.000",
    remainingDueTnd: "3.000",
    paymentState: "PARTIALLY_PAID",
  });

  await page.getByRole("button", { name: "Clôturer" }).click();
  const closeDialog = page.getByRole("alertdialog", {
    name: "Clôturer la caisse",
  });
  await expect(closeDialog).toContainText("57,900 TND");
  await closeDialog
    .getByRole("textbox", { name: /Espèces comptées/ })
    .fill("55");
  await expect(closeDialog).toContainText("−2,900 TND");
  await closeDialog.getByRole("button", { name: "Clôturer" }).click();
  await expect(page.getByText("Caisse clôturée").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: /Session du/ }),
  ).toBeVisible();
  expect(state.sessions[0]).toMatchObject({
    status: "CLOSED",
    expectedCashTnd: "57.900",
    countedCashTnd: "55.000",
    cashDifferenceTnd: "-2.900",
  });
});
