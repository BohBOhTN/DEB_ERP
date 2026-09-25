# 004 · Ventes: KPIs, period filters, search, cancel a sale, pay the remainder

| Field              | Value                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Module             | `frontend/src/features/pos` (SalesPage, SaleDetailPage), `backend/src/modules/pos`, `backend/src/modules/customers` (allocation)                 |
| Type               | Feature + data-integrity fixes                                                                                                                   |
| Priority           | High                                                                                                                                             |
| Depends on         | 001 (period filter), 007 (sale payment state kept in sync)                                                                                       |
| Suggested branches | `fix/ventes-kpis-filters` then `feat/ventes-cancel-and-pay` (two PRs; the second needs a migration and a new permission)                         |
| Related            | source of truth §11 (`POS-012`, `POS-015`, sale states POSTED/CANCELLED), §13.3, `OD-009`, `OD-012`, rule 04 §12 (cancel, reverse, never delete) |

## Owner's request

> Add KPIs showing the sales, partial sales, sales value, sum of the "reste" (credits), useful insights. Filters: today by default, yesterday, this week, this month, one date or a date interval, same style across the app.
> Add a table action to cancel a sale; every effect must be rolled back (client balance, purchase [stock], caisse solde, etc.) so everything stays mathematically consistent.
> Search by sale. Add an action to add a payment for a sale to fulfil the rest; it cannot exceed the sale's remaining total.

## Findings

### List, filters, search

- [SalesPage.tsx](../frontend/src/features/pos/pages/SalesPage.tsx): URL state `from=today`, `to=today`, `customerId`, `state`, `sessionId`, `sort`, `page`. Filters are two "Du"/"Au" `DateInput`s, a customer combobox and an "État" select. No search, no row actions, row click opens the detail.
- Backend `GET /pos/sales` ([pos.routes.ts:40-48](../backend/src/modules/pos/pos.routes.ts#L40-L48), service [pos.service.ts:181-245](../backend/src/modules/pos/pos.service.ts#L181-L245)) accepts `from`, `to`, `customerId`, `paymentState`, `cashierUserId`, `sessionId`, `sort` (`soldAt|totalTnd`), `page`, `pageSize`. No `q`, no `status` filter. The query runs `findMany` + `count` in one transaction plus one batched user lookup: no N+1.
- Column "Heure" shows only the time even when the range spans several days ([SalesPage.tsx:63-119](../frontend/src/features/pos/pages/SalesPage.tsx#L63-L119)); the link from a session sets `from=&to=` so the list shows times without dates.
- `sessionId` is a hidden filter: it counts in `activeCount` and is cleared by reset but has no chip.
- The Payée / Partielle / Impayée ternary is copy-pasted three times; `StatusPill` defaults are the masculine "Payé / Partiel / Impayé".
- Indexes: `soldAt`, `paymentState`, `status`, `customerId` exist singly; no composite `(status, soldAt)` for the KPI aggregate, no index for a reference search beyond the unique btree (prefix match is fine for `VT-0001`).

### KPIs

- No summary endpoint exists. The closest aggregates are the home `salesBlock` (one day) and the session totals. Nothing counts per `paymentState`.

### Cancel

- **No cancel command exists for sales.** `SaleStatus.CANCELLED`, `CustomerLedgerEntryType.SALE_REVERSAL` and `PAYMENT_REVERSAL` are declared ([schema.prisma:809-829](../backend/prisma/schema.prisma#L809-L829)) but never written. `Sale` has no `cancelledAt` / `cancelledByUserId` / `cancellationReason` columns (`CustomerOrder` and `Purchase` have them). `InventorySourceType` has `PURCHASE_CANCELLATION` but no `POS_SALE_CANCELLATION`.
- **There is no `sales.cancel` permission** in the source of truth permission table (§4) nor in [permissions.ts:120-124](../backend/src/modules/access/permissions.ts#L120-L124). Adding one is a source-of-truth change: it needs a decision-log entry and a permission-catalogue migration, and the roles that get it by default must be named.
- What posting creates, and therefore what cancelling must reverse ([pos.service.ts:424-699](../backend/src/modules/pos/pos.service.ts#L424-L699)):
  1. `Sale` + `SaleLine`s (status POSTED, `paymentState`, totals).
  2. `SalePayment` (cash into the open session) when paid > 0. Session cash is computed from `salePayment.aggregate` **without a sale-status filter** ([pos.service.ts:360-363, 826-829](../backend/src/modules/pos/pos.service.ts#L360-L363)), so cancelling must write a refund row, not just flip the status.
  3. `CustomerLedgerEntry` RECEIVABLE / `SALE_RECEIVABLE` for the remainder (customer sales only).
  4. `InventoryMovement` POS_SALE, `-qty`, source `POS_SALE` for stockable lines.
  5. Audit event `pos_sale.post`, idempotency record.
- Later effects that may hang off a sale: `CustomerPaymentAllocation` rows (issue 007) and, for order-completion sales, `CustomerOrder.saleId` + the applied advance ([orders.service.ts:537-770](../backend/src/modules/orders/orders.service.ts#L537-L770)).
- Pattern to copy: `ProcurementService.cancelPurchase` ([procurement.service.ts:676-786](../backend/src/modules/procurement/procurement.service.ts#L676-L786)): REVERSAL stock movements, `*_REVERSAL` ledger entries, `cancelledAt`, reason, audit. Note its own gap (later allocated payments are not reversed, see 007) and do not copy it.

### Pay the remainder

- No `/pos/sales/:id/payments` route. The right primitive already exists: `POST /customer-payments` with `allocations: [{ saleId, amountTnd }]` ([customers.routes.ts:74-89](../backend/src/modules/customers/customers.routes.ts#L74-L89), service [customers.service.ts:540-684](../backend/src/modules/customers/customers.service.ts#L540-L684)). It already refuses an allocation above the sale's ledger balance and an amount above the customer's receivable.
- **But the sale row is never updated** (no `sale.update` anywhere in the backend): `paymentState`, `paidAmountTnd`, `remainingDueTnd` keep their posting values, so `/caisse/ventes`, the sale detail and the home "crédit" figure all go stale after a payment. This is the core bug behind "payments are not tied to a sale"; it is specified in issue 007 and must land before or with this one.
- Anonymous sales are always fully paid (`POS-011`), so "Encaisser le reste" only applies to customer sales.

### Detail page gaps

- "Paiements" lists `sale.payments` only: the applied order advance and later allocated customer payments are missing, so the list does not add up to "Payé" ([SaleDetailPage.tsx:113-124](../frontend/src/features/pos/pages/SaleDetailPage.tsx#L113-L124)). No link to the originating order (`getSale` does not include `order`).

## Proposed change

### PR 1 · `fix/ventes-kpis-filters` (no migration)

Backend

- `GET /pos/sales`: add `q` (`searchFields`: `reference` prefix/contains, customer name via the existing trigram index) and `status` (`POSTED|CANCELLED`, default POSTED so cancelled sales are hidden unless asked).
- `GET /pos/sales/summary`: same query schema; returns `{ count, paidCount, partiallyPaidCount, unpaidCount, totalTnd, paidTnd, remainingTnd, cancelledCount }` from one `groupBy(paymentState)` + one `aggregate`, POSTED only. Permission `pos.access`. Add index `(status, soldAt)`.
- `getSale`: include `order { id, reference }` and the allocated customer payments (`paymentAllocations` with payment date, reference).

Frontend

- Period control from issue 001 (default `Aujourd'hui`), search box in `FilterBar` ("Référence ou client"), "État" select, customer combobox, a visible chip for `sessionId`.
- KPI row above the filter: `Ventes` (count, featured), `Payées / Partielles / Impayées` (counts), `Chiffre` (totalTnd), `Encaissé` (paidTnd), `Reste à encaisser` (remainingTnd). Same tiles bound to the same URL filters.
- Column "Date" shows date + time when the range spans more than one day; keep "Heure" for a single day.
- Row actions (`RowActions` pattern from Sprint 29 if merged, otherwise the existing `rowActions` slot): `Voir`, `Encaisser le reste` (customer sales with remaining > 0, `customer_payments.create`), `Annuler` (PR 2).
- One `salePaymentStateLabel()` helper replacing the three ternaries; feminine labels.
- Detail page: "Paiements" section lists sale payments, the applied advance (labelled "Acompte appliqué") and allocated règlements; link to the order; actions `Encaisser le reste`, `Annuler`, `Nouvelle vente`.

### PR 2 · `feat/ventes-cancel-and-pay` (migration + permission)

Decision to record first (decision log `DEC-V2-xxx`, resolves the missing permission): add `pos.cancel_sale` ("Annuler une vente"), granted by default to the owner/manager roles only, not to the seeded cashier.

Backend

- Migration: `Sale.cancelledAt`, `cancelledByUserId`, `cancellationReason` (nullable), `SalePayment.movement RECEIPT|REFUND` (default RECEIPT) so a cash refund is a row in the same table the session totals already aggregate, `InventorySourceType.POS_SALE_CANCELLATION`, the permission row.
- `POST /pos/sales/:saleId/cancel` (idempotency key, `pos.cancel_sale`, body `{ reason }`), one transaction with `SELECT … FOR UPDATE` on the sale:
  1. Sale must be POSTED; refuse `SALE_ALREADY_CANCELLED`.
  2. Refuse if the sale is linked to a completed order (`SALE_LINKED_TO_ORDER`): the order's advance was applied and the order is COMPLETED; reverting both is a separate decision (`OD-008` family). Message: "Cette vente provient d'une commande terminée et ne peut pas être annulée ici."
  3. Refuse if customer payments are allocated to it (`SALE_HAS_ALLOCATED_PAYMENTS`) until issue 007 delivers payment reversal; the message tells the user to reverse those règlements first. (Alternative if the owner prefers: reverse them in the same transaction with `PAYMENT_REVERSAL` entries and a REFUND row when they were collected at the till.)
  4. Stock: one `REVERSAL` movement per stockable line, `+qty`, source `POS_SALE_CANCELLATION`, reason from the body.
  5. Customer: `SALE_REVERSAL` ledger entry `-remainingDueTnd` (RECEIVABLE, with `saleId`) when a customer receivable was created.
  6. Cash: when `paidAmountTnd > 0`, require an open session (money leaves the drawer, same rule as order cancellation with REFUNDED) and write `SalePayment { movement: REFUND, amountTnd: -paid }` on the current session. Update `closeSession` / `getSession` cash formulas to sum RECEIPT minus REFUND (they currently sum every row).
  7. Sale: `status = CANCELLED`, `cancelledAt`, actor, reason; `paymentState` unchanged (historical), `remainingDueTnd` unchanged (the ledger carries the reversal).
  8. Audit `pos_sale.cancel` with before/after; invalidation event `pos.sale`.
- Every aggregate that reads sales must filter `status = POSTED`: home `salesBlock` and `creditTnd`, session totals (already), customer `openSales`, the new summary. Grep `sale.aggregate|sale.groupBy|sale.findMany` and add the filter where missing.
- "Encaisser le reste": no new endpoint. The sale detail and the row action open `CustomerPaymentDialog` pre-filled with the customer and one allocation row for this sale, amount capped at the sale's current ledger balance (not the stale `remainingDueTnd`). Server keeps enforcing both caps.

Frontend

- `CancelSaleDialog` (`ConfirmPostingDialog`, reason required ≥ 5 chars, impact list: "Stock +N pièces", "Solde client −X TND", "Caisse −Y TND (remboursement)").
- Cancelled rows: `StatusPill` "Annulée", muted, no actions except `Voir`; detail shows the reason, actor and time.

### Tests

- Backend: `pos.service.test.ts` cancel cases (cash sale, credit sale, partially paid sale, stockable and non-stockable lines, no session with cash, already cancelled, linked order, allocated payments, idempotent retry); `pos.routes.test.ts` permission allowed/denied; concurrency test cancel-vs-cancel and cancel-vs-payment on PostgreSQL (CI); summary endpoint with the filters; `listSales` search and status filter.
- Frontend: `SalesPage.test.tsx` (new): KPIs and table follow the same filters; search; row actions per permission; cancel dialog flow; "Encaisser le reste" capped. MSW handlers for summary, cancel and the `q` filter (the current mock ignores dates: add date filtering so the tests mean something).
- Session close test: expected cash after a cancelled cash sale equals opening + receipts − refunds.

## Acceptance criteria

- For any filter combination, KPI count = number of rows across all pages and KPI `remainingTnd` = sum of the "Reste" column.
- After cancelling a credit sale: stock balance back to its previous value, customer "Reste à payer" reduced by the sale's remaining due, session expected cash reduced by the cash taken, home summary no longer counts the sale, audit shows the reason.
- After "Encaisser le reste" on a partially paid sale: the sale shows "Payée", "Reste 0,000", the customer balance drops by the same amount, and a second attempt is refused with "Aucun montant dû".
- A cancelled sale can never be paid, and a paid amount can never exceed the sale's balance (server-side).

## Open decisions to surface before PR 2

- New permission `pos.cancel_sale` (source-of-truth change) and its default roles.
- Cancelling an order-completion sale: refuse (proposed) or revert the order to READY with its advance restored.
- Cancelling a sale that already received allocated règlements: refuse (proposed) or reverse them in the same command.
- `OD-012`: negative stock is allowed on sale; a reversal can only increase stock, no conflict.
