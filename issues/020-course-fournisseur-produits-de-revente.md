# 020 · Nouvelle course: a section for the resold products, between the raw materials and the other goods

| Field            | Value                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| Module           | `frontend/src/features/procurement`, `backend/src/modules/procurement`                 |
| Type             | Feature                                                                                |
| Priority         | High                                                                                   |
| Depends on       | 019 (purchase lines of resold products), 018 (the trip)                                |
| Suggested branch | `feat/020-course-produits-de-revente`                                                  |
| Related          | `DEC-V2-009` (a trip is one validation over a purchase and its expenses), `DEC-V2-010` |

## Owner's request

> On `Nouvelle course` there are two sections today: the raw materials and the other purchases. Add, right after the raw materials, a section for the resold products.

## Findings

- The trip page holds one `PurchaseLineEditor` for the raw materials and one `ExpenseLineEditor` for the other goods ([ShoppingTripPage.tsx](../frontend/src/features/procurement/pages/ShoppingTripPage.tsx)); its totals, its confirmation and its error mapping know those two.
- The trip's `purchase.lines` reach `createPurchaseWith` unchanged ([shoppingTrip.service.ts](../backend/src/modules/procurement/shoppingTrip.service.ts)), so once issue 019 is in, the API already accepts a product line in a trip. Its route schema still demands `rawMaterialId` on every line.
- The payment card says "Paiement des matières premières": with resold products in the same purchase it covers both.

## Proposed change

- **API**: the trip's line schema takes `rawMaterialId` or `productId`, like a purchase. Nothing else changes: the raw materials and the resold products of a trip are one purchase, the other goods are its expenses.
- **Page**: three cards in this order: `Matières premières` (picker of raw materials only), `Produits de revente` (picker of resold products only, "Entrent en stock pour être revendus et dans le compte du fournisseur"), `Autres achats`. Each has its subtotal. The trip may leave any of them empty; one line anywhere is enough.
- **Totals**: `Matières premières`, `Produits de revente`, `Autres achats`, `Total de la course`; the payment card becomes `Paiement des marchandises` and covers the first two; `Sortie de caisse aujourd'hui` unchanged.
- **Confirmation**: the stock received lists both kinds; the rest is unchanged.
- **Errors**: a refusal on `purchase.lines.N` lands in the card that holds that line.

## Tests

- Backend: the trip route accepts a product line and refuses a line with both ids or none; the service posts a purchase mixing both kinds with its expenses.
- Frontend: a trip with flour, resold bottles and bags validated together (totals, impact, the purchase page); a trip of resold products only; each picker limited to its kind; a server refusal on a product line shown in its card.
- Browser: the trip with the three sections at the three widths.

## Acceptance criteria

- On one page the owner records 10 kg of flour, 24 bottles to resell and a pack of bags, validates once, and finds one purchase with two lines, the stock of both raised, and one expense.

## Decisions surfaced

- None new: `DEC-V2-009` and `DEC-V2-010` cover it. The resold products of a trip are paid on the same terms as its raw materials, because they are one purchase.
