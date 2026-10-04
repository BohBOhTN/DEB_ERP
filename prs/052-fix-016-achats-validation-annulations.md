# Fix 016: purchase form validation, one line per material, and payments of a cancelled purchase

## Branches

- Source: `fix/achats-validation-annulations` (stacked on `fix/commandes-file-visible`, PR for issue 015)
- Target: `dev`

## Scope

Closes issue 016 ([issues/016](../issues/016-achats-validation-et-annulations.md)):
the client's four points on purchases, the last of which corrupted a
supplier balance. Decision `DEC-V2-007` records the rule.

## Summary

- **A payment came back twice.** Cancelling a purchase reversed its
  payments in the ledger but left the payment rows as they were;
  cancelling such a payment afterwards reversed it again, and the supplier
  ended up owed money nobody owed him (the client's 50 / 20 / 30 case).
  The mirror order, payment first then purchase, did the same, and so did
  a payment spread over several purchases. Both commands reversed "the
  payment entries" instead of what was still applied.
  - `appliedPaymentEntries` (`shared/ledger.ts`): what a payment still
    settles per document, the net of its payments and reversals.
  - `cancelPurchase` takes back that net only, then marks as cancelled,
    with "Achat AC-… annulé" and the actor, every payment left with
    nothing applied anywhere. A payment that also settles another
    purchase keeps that share.
  - `reverseSupplierPayment` takes back that net only and answers 409
    `PAYMENT_DOCUMENT_CANCELLED` when nothing is left.
  - The payments page shows such a payment as `Annulé` (or `Achat annulé`
    for a purchase cancelled before this fix) and offers no action.
- **The other modules were checked.** A sale cannot be cancelled while a
  règlement is allocated to it; an order's cancellation settles its
  advance explicitly; distributor documents have no cancellation;
  expenses carry no payment. None had the defect. The customer and
  distributor reversals shared the pattern, so they now use the same net
  rule and the same refusal.
- **Purchase form.** The server refuses, all at once and on the fields
  concerned (`VALIDATION_ERROR` with `fieldErrors`): a material on two
  lines, a quantity or unit price that is not strictly positive, a line
  total that rounds to zero, a purchase dated in the future, a due date
  before the purchase. A zero price used to reach the database and come
  back as a generic failure. The form applies the same rules before any
  request, brings a refusal of the server back to its own field names
  (`rawMaterialId` to the line's picker), and shows a summary styled as
  an error and scrolled into view ("Corrigez les 4 champs signalés.").
- **One line per item.** `LineEditor` leaves out of a line's picker what
  the other lines hold (`uniqueItems`, on by default; `Combobox`
  `excludeValues`). Purchases, orders, dispatches and distributor sales
  all refuse a repeated item on the server; their editors no longer let
  it be picked.
- **"Prix par kg" under the quantity** is gone. With the base unit there
  is no text; with another unit the quantity shows "= 200 kg" and the
  price shows "par kg" (`priceHint`).

## Out of Scope

- A unique index on `purchase_lines (purchase_id, raw_material_id)`:
  posted purchases may already hold a material twice.
- Repairing a balance already corrupted by a double reversal: the owner
  is emptying the test data; the fix prevents new ones and refuses a
  third reversal.
- Cancelling distributor sales and settlements (no such command exists).

## Verification

Run locally on macOS, Node 24, on 2026-10-05:

- `npm run format:check`, `npm run lint`, `npm run typecheck`: passed
  (`openapi:generate` and `api:types` leave the committed files unchanged)
- `npm run test --workspace backend`: 426 passed, 16 skipped (59 files).
  New: the client's case (purchase cancelled, balance 0, payment marked
  with the reason, second cancellation refused); a purchase cancelled
  before the rule (refused with `PAYMENT_DOCUMENT_CANCELLED`, balance 0);
  payment cancelled first, purchase after (one reversal per payment,
  balance 0); a payment over two purchases, one cancelled (only the other
  share comes back); the helper on five cases; the purchase input rules
  with their field errors, the Tunis day boundary and the line total that
  rounds to zero
- `npm run test --workspace frontend`: 291 passed (99 files). New: the
  form's summary and field messages on an empty save; no hint on the base
  unit and a refused zero price; the two date rules; a server refusal
  shown on the line it concerns; the payment of a cancelled purchase
  reading `Annulé` with no action, and `Achat annulé` for an older one;
  the line editor's pickers without the other lines' items; the field
  name mapping and the error count
- `npm run build`: passed; 201.5 kB gzip initial against 250 kB
- Playwright on the system Brave browser, mocked API, 360, 768 and
  1280 px: the whole suite, 141 passed,
  3 skipped by design; the purchase flow now checks "= 200 kg" under the
  quantity, "par kg" under the price and no "prix par" anywhere
- Not run here: the database-backed suites (CI). The fix adds no raw SQL;
  it uses `findMany`, `createMany` and `updateMany` on typed models

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- `cancelPurchase` now writes to `supplier_payments` (the reversal
  columns) inside its transaction; the reason is prefixed with the
  purchase reference so the statement says why a payment reads cancelled.
- A purchase draft saved before this fix with a material on two lines can
  still be opened; saving or posting it through the editor now asks to
  remove the duplicate.
- Merge order: issue 015 first, then this pull request.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue 016
- [ ] Target branch is `dev`
