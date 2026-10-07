import { expect, test } from "@playwright/test";
import { expectLineEditorFits } from "./lineEditor";
import { mockApi, ownerPermissions } from "./mockApi";
import { makeProcurementState, mockProcurement } from "./procurement";

/// AS-005 then AS-004 / AS-V2-16 on a 360 px phone and on desktop: buy 4
/// sacs of flour at 1,250 TND per kg unpaid (250,000 TND due), post it with
/// the impact stated in base units, then pay 300,000 TND against two open
/// purchases allocated 200,000 + 100,000 with nothing left unallocated.
test("creates and posts a purchase, then pays the supplier with allocations", async ({
  page,
}) => {
  const state = makeProcurementState();
  await mockApi(page, { signedIn: true, permissions: ownerPermissions });
  await mockProcurement(page, state);

  await page.goto("/achats/nouveau");
  await expect(
    page.getByRole("heading", { level: 1, name: "Nouvel achat" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Fournisseur" }).click();
  await page.getByPlaceholder("Nom du fournisseur").fill("minoterie");
  await page.getByText("Minoterie du Sud").click();
  await page.getByRole("combobox", { name: "Article 1" }).click();
  await page.getByPlaceholder("Rechercher article").fill("farine");
  await page.getByText("Farine T55").click();
  await page.getByRole("textbox", { name: "Quantité 1" }).fill("4");
  await page.getByRole("combobox", { name: "Unité 1" }).click();
  await page.getByRole("option", { name: "Sac de 50 kg" }).click();
  // The quantity formatter joins number and unit with a no-break space;
  // string matching normalises whitespace, a regex would not.
  // Issue 016: the quantity says what it amounts to in the base unit and
  // the price says which unit it is for; nothing about the price sits
  // under the quantity any more.
  await expect(page.getByRole("main")).toContainText("= 200 kg");
  await expect(page.getByRole("main")).toContainText("par kg");
  await expect(page.getByRole("main")).not.toContainText("prix par");
  await page.getByRole("textbox", { name: "Prix unitaire 1" }).fill("1,25");
  await expect(
    page.getByRole("textbox", { name: "Total ligne 1" }),
  ).toHaveValue("250,000");
  await expectLineEditorFits(
    page,
    page
      .getByRole("combobox", { name: "Article 1" })
      .locator("xpath=ancestor::li[1]"),
  );
  await page.getByRole("radio", { name: "Impayé" }).click();
  await page.getByLabel(/Échéance/).fill("2026-10-31");
  await page.getByRole("button", { name: "Valider l'achat" }).click();
  const confirm = page.getByRole("alertdialog", { name: /Valider l'achat/ });
  await expect(confirm).toContainText("Stock : +200 kg Farine T55.");
  await expect(confirm).toContainText(
    "Dette fournisseur Minoterie du Sud : +250,000 TND",
  );
  await confirm.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Achat validé").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "AC-000002" }),
  ).toBeVisible();

  // A second unpaid purchase, straight into the store, so the payment has
  // two open purchases to split across.
  state.purchases.unshift({
    ...(state.purchases[0] as (typeof state.purchases)[number]),
    id: "purchase-two",
    reference: "AC-000003",
    totalTnd: "100.000",
    dueDate: "2026-09-01T08:00:00.000Z",
  });

  await page.goto("/fournisseurs/supplier-1");
  await expect(
    page.getByRole("heading", { level: 1, name: "Minoterie du Sud" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("350,000 TND");
  await page.getByRole("button", { name: "Payer" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau paiement" });
  await dialog.getByRole("textbox", { name: /^Montant/ }).fill("300");
  await dialog
    .getByRole("textbox", { name: "Affectation AC-000002" })
    .fill("200");
  await dialog
    .getByRole("textbox", { name: "Affectation AC-000003" })
    .fill("100");
  await expect(dialog).toContainText("Reste à répartir");
  await expect(dialog).toContainText("0,000 TND");
  await dialog.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Paiement enregistré").first()).toBeVisible();
  await expect(page.getByRole("main")).toContainText("50,000 TND");
  expect(state.payments[0]?.allocations.map((a) => a.amountTnd).sort()).toEqual(
    ["100.000", "200.000"],
  );
});

/// Issue 019 at the three widths: a product flagged for resale is found on
/// `Nouvel achat` beside the raw materials, bought in its own unit, and the
/// purchase page says which line it is.
test("buys a resold product beside a raw material on one purchase", async ({
  page,
}) => {
  const state = makeProcurementState();
  await mockApi(page, { signedIn: true, permissions: ownerPermissions });
  await mockProcurement(page, state);

  await page.goto("/achats/nouveau");
  await page.getByRole("combobox", { name: "Fournisseur" }).click();
  await page.getByPlaceholder("Nom du fournisseur").fill("minoterie");
  await page.getByText("Minoterie du Sud").click();

  await page.getByRole("combobox", { name: "Article 1" }).click();
  await page.getByPlaceholder("Rechercher article").fill("eau");
  await expect(
    page.getByText("Produit de revente · Pièce · Boissons"),
  ).toBeVisible();
  await page.getByText("Eau 1,5 L").click();
  await page.getByRole("textbox", { name: "Quantité 1" }).fill("24");
  await page.getByRole("textbox", { name: "Prix unitaire 1" }).fill("0,85");
  await expect(
    page.getByRole("textbox", { name: "Total ligne 1" }),
  ).toHaveValue("20,400");
  await expect(page.getByRole("combobox", { name: "Unité 1" })).toContainText(
    "Pièce",
  );

  await page.getByRole("button", { name: "Ajouter une ligne" }).click();
  await page.getByRole("combobox", { name: "Article 2" }).click();
  await page.getByPlaceholder("Rechercher article").fill("farine");
  await page.getByText("Farine T55").click();
  await page.getByRole("textbox", { name: "Quantité 2" }).fill("10");
  await page.getByRole("textbox", { name: "Prix unitaire 2" }).fill("1,2");
  await expectLineEditorFits(
    page,
    page
      .getByRole("combobox", { name: "Article 1" })
      .locator("xpath=ancestor::li[1]"),
  );

  await page.getByRole("radio", { name: "Payé", exact: true }).click();
  await page.getByRole("button", { name: "Valider l'achat" }).click();
  const confirm = page.getByRole("alertdialog", { name: /Valider l'achat/ });
  await expect(confirm).toContainText("Eau 1,5 L");
  await expect(confirm).toContainText("Farine T55");
  await confirm.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Achat validé").first()).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: state.purchases[0]?.reference ?? "",
    }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText(/revente/i);
  expect(state.purchases[0]?.lines).toMatchObject([
    {
      productId: "product-water",
      rawMaterialId: null,
      enteredUnitId: "unit-piece",
      lineTotalTnd: "20.400",
    },
    { rawMaterialId: "raw-1", productId: null, enteredUnitId: "unit-kg" },
  ]);
  expect(state.purchases[0]).toMatchObject({ totalTnd: "32.400" });
});
