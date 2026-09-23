import { expect, test } from "@playwright/test";
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
  await page.getByRole("combobox", { name: "Matière première 1" }).click();
  await page.getByPlaceholder("Rechercher matière première").fill("farine");
  await page.getByText("Farine T55").click();
  await page.getByRole("textbox", { name: "Quantité 1" }).fill("4");
  await page.getByRole("combobox", { name: "Unité 1" }).click();
  await page.getByRole("option", { name: "Sac de 50 kg" }).click();
  // The quantity formatter joins number and unit with a no-break space;
  // string matching normalises whitespace, a regex would not.
  await expect(page.getByRole("main")).toContainText("= 200 kg · prix par kg");
  await page.getByRole("textbox", { name: "Prix unitaire 1" }).fill("1,25");
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
  await expect(dialog).toContainText("Reste non alloué");
  await expect(dialog).toContainText("0,000 TND");
  await dialog.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Paiement enregistré").first()).toBeVisible();
  await expect(page.getByRole("main")).toContainText("50,000 TND");
  expect(state.payments[0]?.allocations.map((a) => a.amountTnd).sort()).toEqual(
    ["100.000", "200.000"],
  );
});
