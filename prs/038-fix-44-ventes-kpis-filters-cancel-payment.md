# Fix #44: Ventes, figures, period filter, search, cancel a sale, collect the remainder

## Branches

- Source: `fix/44-ventes-kpis-filters-cancel-payment` (stacked on `fix/45-commandes-kpis-filters-actions`)
- Target: `dev`

## Scope

Closes issue #44 ([issues/004](../issues/004-ventes-kpis-filters-cancel-payment.md)):
a KPI row above the sales list, the shared period filter, a search, a
status filter, row actions to open the receipt, collect the remainder of a
credit sale or cancel a sale with every effect reversed, and a receipt page
that lists every movement of money on the sale. Decision `DEC-V2-003`
(local decision log) records the new permission and the two refused cases.

## Summary

- Permission `pos.cancel_sale` ("Annuler une vente") in the catalogue; the
  Super Admin bootstrap and the seeded `Gérant` (every permission) receive
  it, the seeded `Caissier` does not.
- `POST /pos/sales/:id/cancel` (idempotency key, reason of at least three
  characters, `pos.cancel_sale`), one transaction under a row lock: refuses
  a cancelled sale (`SALE_ALREADY_CANCELLED`), a sale that completed an
  order (`SALE_LINKED_TO_ORDER`) and a sale with règlements still
  allocated (`SALE_HAS_ALLOCATED_PAYMENTS`, reverse them first with #47);
  writes a `SalePayment` of movement `REFUND` for the cash taken, in the
  session open now (`POS_SESSION_NOT_OPEN` otherwise, like an order
  refund); a `SALE_REVERSAL` ledger entry for the receivable the sale had
  created; one `REVERSAL` stock movement per stockable line with source
  `POS_SALE_CANCELLATION`; marks the sale `CANCELLED` with `cancelledAt`,
  the actor and the reason, keeping its reference, lines and figures;
  audits `pos_sale.cancel`.
- Session cash: sale payments are summed per movement, so the expected
  cash and `cashCollectedTnd` net out refunds; `saleRefundsTnd` is shown on
  the close dialog and the session page ("Ventes annulées remboursées").
- `GET /pos/sales`: `q` (reference, customer name) and `status` (posted
  sales unless the cancelled ones are asked for). `GET /pos/sales/summary`
  with the same filters: count and totals per payment state of the posted
  sales, the cancelled count. Index `(status, sold_at)`.
- `GET /pos/sales/:id`: the order the sale completed, the règlements
  allocated to it (with their reversal), the advance applied at completion,
  who cancelled it.
- Frontend: KPI row (`Ventes` with paid, partial and unpaid counts,
  `Chiffre d'affaires` with the cancelled count, `Encaissé`, `Reste à
encaisser`), the period filter, search, `État` and `Statut` selects, a
  chip when the list is scoped to a session, a `Date` column once the
  period spans several days, one `salePaymentStateLabel` helper replacing
  three copies of the feminine labels, `Annulée` pill on cancelled rows.
  Row actions `Voir`, `Encaisser le reste` (the customer's règlement dialog
  prefilled with the sale and its balance, #47) and `Annuler`
  (`CancelSaleDialog`: reason, stock, customer balance and drawer impact).
  Receipt page: cancellation card, `Commande` link, a `Paiements` card
  listing cash taken, cash refunded, the applied advance and the allocated
  règlements, and the same actions.
- Customer ledger labels keyed by the entry types the backend writes
  (`PAYMENT`, `SALE_REVERSAL`, `PAYMENT_REVERSAL`, `ORDER_ADVANCE_CREDITED`),
  so a règlement no longer renders as "payment" on the statement.

## Out of Scope

- Cancelling a sale that completed an order (would need the order's advance
  restored: an owner decision) and cancelling a sale with allocated
  règlements in one command (they are reversed first with #47's action).
- The source-of-truth permission table (section 4) still lists no sale
  cancellation permission; `DEC-V2-003` asks the owner to confirm it.

## Verification

Run locally on macOS, Node 24, on the stacked branch:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 351 passed, 10 skipped (48 files);
  new: cancel a cash sale (refund in the open drawer, stock back, sale kept
  as cancelled, expected cash back to the opening float, second attempt
  refused), cancel a credit sale (receivable reversed), refund needs an
  open drawer, order-linked and allocated-payment refusals with a reversed
  règlement no longer blocking, idempotent retry; posted-by-default list
  and search predicate; route allowed and denied, summary route; OpenAPI
  catalogue covering the two new operations
- `npm run test --workspace frontend`: 211 passed (90 files); new
  `SalesPage.test.tsx`: the figures and the table follow the same filters,
  search by customer, `Encaisser le reste` opens the règlement dialog with
  the amount and the allocation prefilled at the sale's balance, `Annuler`
  states the drawer and stock impact and needs a reason, the cancelled sale
  leaves the posted list and the figures, and shows as `Annulée` under the
  `Annulées` status with `Voir` only
- `npm run build`: passed; initial JavaScript 200.3 kB gzip against the
  250 kB budget; POS chunk 13.3 kB
- Playwright on the system Brave browser (`E2E_BROWSER`), the till flow,
  the shell flow and the axe scans at three widths: 97 passed, 2 skipped by
  design

## Database and Migration Impact

One additive migration, `20260925100000_sale_cancellation`: three
nullable columns on `sales`, the `SalePaymentMovement` enum and
`sale_payments.movement` (default `RECEIPT`), the `POS_SALE_CANCELLATION`
value on `InventorySourceType`, and the `(status, sold_at)` index. The
`ALTER TYPE ... ADD VALUE` needs PostgreSQL 12 or later inside a migration
transaction; the value is not used in the same migration.

## Environment Impact

None.

## Risks and Follow-Up

- The new permission must be granted to the roles that should cancel
  sales on the shared development database (the Super Admin and the demo
  `Gérant` get it automatically).
- The cancel dialog on a list row reads the sale detail first so the stock
  lines are listed; on a slow link the dialog opens after that read.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue #44
- [ ] Target branch is `dev`
