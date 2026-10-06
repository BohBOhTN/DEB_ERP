# 016 · Achats: form validation, one line per material, and payments of a cancelled purchase

| Field            | Value                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Module           | `backend/src/modules/procurement`, `frontend/src/features/procurement`, `frontend/src/components/patterns/LineEditor`, `backend/src/shared` |
| Type             | Fix (one of them corrupts a supplier balance)                                                                                               |
| Priority         | Highest                                                                                                                                     |
| Depends on       | 007 (payments settle documents, reversals)                                                                                                  |
| Suggested branch | `fix/achats-validation-annulations` (stacked on 015)                                                                                        |
| Related          | source of truth §10 (`SUP-006` to `SUP-012`, `SUP-015`), rule 04 §12, `OD-010`, `DEC-V2-002`                                                |

## Client's report

> The purchase form needs proper validation. Two lines can hold the same raw material: that must not be possible. When a material is picked, a text appears under the quantity ("Prix par kg"): it is wrong there, remove it.
>
> A purchase of 50 TND paid 20, 30 left. We cancel the purchase: the supplier's balance is 0. Then, on the payments page, we cancel the 20 TND payment linked to that purchase: the supplier's balance becomes 20 TND due. It must be impossible to cancel a payment linked to a cancelled purchase. Same for the customers; look for the same glitch in the other modules.

## Findings

### A payment is reversed twice (balance corrupted)

- `cancelPurchase` reverses the payable and every payment applied to the purchase with `PAYMENT_REVERSAL` entries ([procurement.service.ts:755](../backend/src/modules/procurement/procurement.service.ts#L755)), which brings the supplier to 0, but it leaves the payment rows untouched: `reversedAt` stays empty.
- `reverseSupplierPayment` only checks `reversedAt` ([procurement.service.ts:1244](../backend/src/modules/procurement/procurement.service.ts#L1244)) and writes a `PAYMENT_REVERSAL` for every `PAYMENT` entry of the payment. The 20 TND come back a second time: +20 owed to a supplier who is owed nothing. The payments page offers the action because the row does not look cancelled.
- **The mirror exists too, unreported.** Cancel the payment first (balance 50), then the purchase: the cancellation collects every `PAYMENT` entry of the purchase, including the one already compensated, and reverses it again. Balance +20 again.
- **A payment spread over several purchases** hits the same code: cancelling one purchase reverses its share, cancelling the payment later reverses that share once more.
- Root cause: both commands reverse "the `PAYMENT` entries" instead of "what is still applied", the net of `PAYMENT` and `PAYMENT_REVERSAL` per payment and per purchase.

### The other modules

| Module           | Can a document be cancelled with payments on it?                                                                                                                                                                                                                              | Verdict       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Ventes (clients) | No: `cancelSale` refuses while a règlement is allocated (`SALE_HAS_ALLOCATED_PAYMENTS`, [pos.service.ts:428](../backend/src/modules/pos/pos.service.ts#L428)); the cash taken at posting is a `SalePayment`, refunded by the cancellation and absent from the règlements list | safe          |
| Commandes        | Cancellation settles the advance explicitly (refund or credit, `ORD-018`); advances are not règlements and have no cancel action; a completed order's sale cannot be cancelled                                                                                                | safe          |
| Distribution     | No cancel command exists for direct sales or settlements                                                                                                                                                                                                                      | safe today    |
| Dépenses         | No payment is attached to an expense                                                                                                                                                                                                                                          | not concerned |
| Achats           | Yes, and both orders of the two commands corrupt the balance                                                                                                                                                                                                                  | **to fix**    |

The customer and distributor reversals share the same pattern (`PAYMENT` entries, guarded by `reversedAt` only). They are safe only because nothing else writes a reversal for them today; one rule for the three parties removes the trap for whoever adds a cancellation later.

### The purchase form accepts what the server then refuses badly

- **Unit price 0** passes the form (`tnd()` allows zero, [procurement.schemas.ts:33](../frontend/src/features/procurement/procurement.schemas.ts#L33)) and the service ([procurement.service.ts:1494](../backend/src/modules/procurement/procurement.service.ts#L1494)); the database refuses the line (`purchase_lines_positive_values_check`) and the user gets the generic server error. Same for a quantity so small that the line total rounds to 0.
- **The same material on two lines** is accepted by the form and by the server. Orders, dispatches, distributor sales and the till refuse a duplicate on the server (`DUPLICATE_*`) but their editors still let the user pick it and only say so after the submit, in a banner.
- **Dates**: a purchase dated in the future and a due date before the purchase date are accepted on both sides.
- **Server refusals are not field errors**: every refusal of the purchase service is a message without `fieldErrors`, so it lands in the banner; the banner itself is grey text (`styles.muted`), easy to miss, and on a phone the fields in error can be far below with nothing pointing to them.
- **"Prix par kg" under the quantity**: the line hint is rendered in the quantity cell ([LineEditor.tsx](../frontend/src/components/patterns/LineEditor/LineEditor.tsx)) and says something about the price ([PurchaseLineEditor.tsx:181](../frontend/src/features/procurement/components/PurchaseLineEditor.tsx#L181)). The useful part exists only when the unit is not the base unit ("= 50 kg").

## Proposed change

### Payments and cancellations (backend)

1. One helper, `appliedPaymentEntries` in `shared/ledger.ts`: from a set of ledger entries, what is still applied per payment and per document (`PAYMENT` plus `PAYMENT_REVERSAL`), dropping what is already compensated.
2. `cancelPurchase` reverses only what is still applied, then marks as reversed every payment that has nothing left applied anywhere, with the reason "Achat AC-… annulé" and the actor, so the payments page shows it as `Annulé` with no action.
3. `reverseSupplierPayment` reverses only what is still applied; when nothing is, it refuses with `PAYMENT_DOCUMENT_CANCELLED` ("Ce paiement est lié à un achat annulé : il a déjà été repris."). The same net rule in `reverseCustomerPayment` and `reverseDistributorPayment`.
4. No data migration: a payment already double-reversed in production stays as it is in the ledger; the owner is emptying the test data. The refusal protects any older row whose purchase was cancelled before this fix.

### Purchase form

- **Server**: unit price and line total strictly positive, one line per material (`PURCHASE_LINE_DUPLICATE`), purchase date not in the future, due date not before the purchase date; each refusal carries `fieldErrors` on the field it concerns (`lines.2.unitPriceTnd`, `dueDate`, …). No unique index on `purchase_lines`: posted purchases may already hold the same material twice.
- **Form**: the same rules in the schema, messages in French on the field; a summary on top with the number of errors, styled as an error, scrolled into view after a refused submit.
- **`LineEditor`**: `uniqueItems` (default on): a line's picker leaves out what the other lines already hold. Used by purchases, orders, dispatches and distributor sales; off for simulations, where the server allows a repeated ingredient.
- **Hint**: nothing under the quantity when the unit is the base unit; "= 50 kg" when it is not, and "par kg" under the price in that case only, where it belongs.

## Tests

- Backend: the client's scenario (cancel the purchase, then the payment: refused, balance 0, payment marked reversed); the mirror (payment then purchase: balance 0); a payment over two purchases, one cancelled, then reversed (only the other share comes back); the helper; duplicate line, zero price, zero total, future date, due date before purchase, each with its `fieldErrors`; the customer and distributor reversals unchanged on a normal payment.
- Frontend: the picker without the materials already chosen; the duplicate, price, date errors on their fields; the summary; no hint on the base unit, both hints on a converted unit; the payments page showing a payment of a cancelled purchase as `Annulé` without the action and the server's refusal as a toast.
- Browser: the purchase flow at the three widths.

## Acceptance criteria

- Purchase 50, paid 20 at posting, cancelled: balance 0, the payment reads `Annulé` and cannot be cancelled; forcing the call answers 409 and the balance stays 0.
- Payment cancelled first, purchase cancelled after: balance 0.
- A purchase cannot be saved with a material on two lines, a zero price, a future date or a due date before its date; each error shows on its field.
- Picking a material shows no text under the quantity.
