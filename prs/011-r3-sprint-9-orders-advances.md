# R3 Sprint 9 Customer Orders and Advances

## Branches

- Source: `feature/r3-sprint-9-orders-advances`
- Target: `dev`

## Scope

Implements Release R3, Sprint 9: customer orders for later fulfillment, order
advances, exactly-once completion into a linked sale, and cancellation with an
explicit refund or customer-credit outcome.

This PR closes Release R3. It builds on the Sprint 7 paid sale and the Sprint 8
credit sale without changing either path. An order is not a sale: confirming one
recognizes no revenue and moves no stock. Deposits are customer advances.
Completion is the only operation that turns an order into revenue, stock
movement, and receivable.

## Summary

- Added customer order schema:
  - `customer_orders`;
  - `customer_order_lines`;
  - `customer_order_advances`;
  - `customer_order_reference_seq` for human order references;
  - order status, advance movement, and advance disposition enums;
  - four `ORDER_ADVANCE*` customer ledger entry types.
- Added a `balance_kind` dimension to `customer_ledger_entries`
  (`RECEIVABLE` or `ADVANCE`) so an advance held for a customer never nets
  against what that customer owes. Every Sprint 8 balance, statement, and
  overpayment check now reads only receivable entries.
- Added the orders backend service and API for the order queue, order CRUD,
  status progression, advance collection, completion, and cancellation.
- Order completion is one atomic idempotent command that applies the advance,
  records only money received now, creates the receivable remainder, decreases
  stockable inventory, recognizes the sale total once, and links the sale.
- Cancellation requires a reason, and requires an explicit `REFUNDED` or
  `CREDITED` outcome whenever the order still holds an advance.
- POS close now counts order advances and refunds in expected closing cash, so
  the drawer reconciles against money that actually moved.
- Added the French order workspace and a `Vente immediate` /
  `Commande pour plus tard` choice in the POS cart.
- Added `requireAnyPermission` so the POS customer lookup serves either
  `pos.credit_sale` or `orders.create` without a new permission key.
- Added tests for order creation without revenue or stock, advance recording,
  the advance cap, completion effects, once-only completion, session
  requirements, both cancellation dispositions, and every order permission.
- Added the `0.4.0` changelog entry. Sprints 7 and 8 merged without one, so the
  entry records Release R3 as a whole rather than this sprint alone.

## Out of Scope

- Hard stock reservation is not implemented, per the `OD-007` safe default.
  Ordered quantities are visible operationally but reserve nothing.
- Automated customer notifications and reminders remain deferred per `ORD-019`.
- Discounts and taxes remain disabled because `POS-019` is open.
- Customer opening balances remain disabled because `CUS-012` and `OD-004` are
  open.
- Non-cash methods remain out of UI scope; cash is the only active method per
  `OD-014`.

## Verification

- `npm run prisma:validate`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed; backend 110 tests and frontend 3 tests.
- `npm run build`: passed.
- `npm run format:check`: passed.

## Database and Migration Impact

Adds migration:

- `backend/prisma/migrations/20260922090000_add_customer_orders_advances/migration.sql`

The migration is additive. It creates the order, order line, and order advance
tables, adds four values to `CustomerLedgerEntryType`, and adds nullable
`order_id` plus `balance_kind` to `customer_ledger_entries`. The `balance_kind`
column defaults to `RECEIVABLE`, so every existing ledger row keeps its current
meaning and all Sprint 8 balances are unchanged.

Database check constraints enforce the money invariants directly:

- an order total is positive;
- the advance held is between zero and the order total (`ORD-016`);
- a completed order has exactly one linked sale, and a linked sale exists only
  on a completed order (`ORD-010`, `ORD-012`);
- a cancelled order keeps its reason and cancellation time (`ORD-013`);
- a completed or cancelled order holds no advance, so the money was applied,
  refunded, or credited (`ORD-017`, `ORD-018`).

Apply to shared remote development only after review using:

```bash
npm run prisma:migrate:deploy --workspace backend
```

Do not use `prisma migrate dev`, `db push`, or reset commands against shared
remote development.

## Environment Impact

No new or changed environment variables.

## API and Permission Surface

- `GET /api/orders`
  - Requires `orders.view`.
  - Lists the order queue with status, customer, and due-time filters, ordered
    by requested fulfillment time.
- `GET /api/orders/:orderId`
  - Requires `orders.view`.
  - Returns the order with customer, lines, advances, and any linked sale.
- `POST /api/orders`
  - Requires `orders.create`.
  - Requires `Idempotency-Key`.
  - Creates a `DRAFT` order with backend-calculated totals and line snapshots.
- `PATCH /api/orders/:orderId`
  - Requires `orders.update`.
  - Edits fulfillment time, notes, and lines on a `DRAFT` or `CONFIRMED` order
    with optimistic versioning.
- `POST /api/orders/:orderId/status`
  - Requires `orders.change_status`.
  - Moves the order forward or back within `DRAFT`, `CONFIRMED`, `PREPARING`,
    and `READY`. It cannot reach `COMPLETED` or `CANCELLED`.
- `POST /api/orders/:orderId/advances`
  - Requires `orders.update` and `customer_payments.create`.
  - Requires `Idempotency-Key`.
  - Requires an open POS session, because the advance is drawer cash.
- `POST /api/orders/:orderId/complete`
  - Requires `orders.complete`.
  - Requires `Idempotency-Key`.
  - Requires an open POS session; creates at most one linked sale.
- `POST /api/orders/:orderId/cancel`
  - Requires `orders.cancel`.
  - Requires `Idempotency-Key`.
  - Requires a reason, and an advance disposition when an advance is held.
- `GET /api/pos/customers`
  - Now requires `pos.credit_sale` **or** `orders.create`.
  - No permission key was added; the lookup serves both till workflows.

## Requirement Coverage

| Requirement | Coverage                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `ORD-001`   | The POS cart offers a direct sale or an order for later.                                                 |
| `ORD-002`   | An order stores customer, lines, quantities, and payment parameters.                                     |
| `ORD-003`   | A registered active customer is mandatory on backend and frontend.                                       |
| `ORD-004`   | Requested fulfillment date and time are stored and drive queue ordering.                                 |
| `ORD-005`   | Customer phone remains optional.                                                                         |
| `ORD-006`   | Creating or confirming an order writes no revenue and no sale.                                           |
| `ORD-007`   | Creating or confirming an order writes no inventory movement.                                            |
| `ORD-008`   | An order may hold no payment, a partial deposit, or a full advance.                                      |
| `ORD-009`   | Advances post to the `ADVANCE` ledger dimension, never to revenue.                                       |
| `ORD-010`   | Completion creates exactly one linked posted sale.                                                       |
| `ORD-011`   | Completion reduces stock, recognizes revenue once, applies the advance, and creates the remainder.       |
| `ORD-012`   | A row lock, a guarded status update, and a unique `sale_id` make completion once-only.                   |
| `ORD-013`   | A cancelled order keeps its reason, actor, time, and advance disposition.                                |
| `ORD-014`   | No hard stock reservation is introduced, per the documented safe default.                                |
| `ORD-015`   | Each advance records amount, time, user, and method.                                                     |
| `ORD-016`   | Advances above the order total are rejected in the service and by a check constraint.                    |
| `ORD-017`   | Reducing a total below the advance held is rejected with a French instruction to refund or credit first. |
| `ORD-018`   | Cancelling with an advance requires an explicit refund or customer-credit choice.                        |
| `ORD-019`   | Customer notifications remain deferred and are not implemented.                                          |
| `CUS-010`   | An advance is tracked until applied to the linked sale, refunded, or converted to customer credit.       |
| `POS-016`   | Order and completion math uses Prisma decimal arithmetic.                                                |
| `POS-017`   | The backend calculates order totals, applied advance, paid amount, and remaining due.                    |
| `POS-018`   | The UI previews a cart total and labels the server total as authoritative.                               |
| `OD-007`    | No hard reservation, matching the documented safe position.                                              |
| `OD-008`    | Refund or customer credit is explicit and required, matching the documented safe position.               |

## Acceptance Evidence

- `AS-009` future order with deposit:
  `backend/src/modules/orders/orders.service.test.ts`, "records a deposit as
  customer advance only" asserts no sale, no inventory movement, and one
  `ADVANCE` ledger entry.
- `AS-010` order completion:
  "completes an order into one linked sale with advance applied" asserts a
  40.000 TND sale, a 10.000 TND advance applied, a 16-unit stock decrease, and a
  30.000 TND receivable.
- `AS-011` duplicate completion:
  "completes an order only once" asserts that an idempotent retry returns the
  same sale and that a second completion with a fresh key is rejected while the
  sale count stays at one.
- `AS-012` cancelled paid order:
  "rejects cancelling an order with an advance and no disposition", "refunds an
  advance out of the open session on cancellation", and "keeps a cancelled
  advance as customer credit when chosen".
- Schema and money invariants:
  - `backend/prisma/schema.prisma`
  - `backend/prisma/migrations/20260922090000_add_customer_orders_advances/migration.sql`
- Order service and routes:
  - `backend/src/modules/orders/orders.service.ts`
  - `backend/src/modules/orders/orders.routes.ts`
  - `backend/src/modules/orders/orders.routes.test.ts`
- Ledger balance separation and POS drawer reconciliation:
  - `backend/src/modules/customers/customers.service.ts`
  - `backend/src/modules/pos/pos.service.ts`
  - `backend/src/modules/pos/pos.service.test.ts`
- French order and POS UI:
  - `frontend/src/features/orders/OrderManagement.tsx`
  - `frontend/src/features/orders/ordersApi.ts`
  - `frontend/src/features/pos/PosManagement.tsx`
  - `frontend/src/features/shell/ProtectedShell.tsx`
  - `frontend/src/styles/global.css`

## Decisions Taken

Two points were not settled by the source of truth and were decided for this
sprint. Both are recorded here for review.

1. **Completion requires an open POS session.** `sales.session_id` stays
   `NOT NULL`, so a completion behaves exactly like a direct sale and the cash
   breakdown keeps reconciling. An order therefore cannot be completed while the
   till is closed.
2. **Advances flow through the POS drawer.** Each advance and refund records its
   POS session and adjusts that session's expected closing cash, matching the
   "Customer Payments Collected In POS Context" line of the source-of-truth cash
   formula.

A third reading was necessary: the lifecycle diagram shows `COMPLETED` only
after `READY`, but the state table calls a draft "not committed". Completion is
therefore allowed from `CONFIRMED`, `PREPARING`, or `READY`, and refused from
`DRAFT`. This avoids forcing a counter clerk through two extra status changes
for a customer collecting early, without letting an uncommitted draft become
revenue.

## Risks and Follow-Up

- The once-only completion invariant is enforced by a `SELECT ... FOR UPDATE`
  row lock plus a guarded status update. The service tests prove the sequential
  and idempotent-retry cases; genuine parallel-transaction behavior is not
  exercised by the in-memory test double and should be confirmed against
  PostgreSQL before acceptance.
- Manual responsive review is still needed at 360 px, 430 px, 768 px, and
  desktop widths before acceptance.
- Customer payments collected in the customer module still do not appear in the
  POS expected-cash formula. Sprint 8 raised this, and order advances are now
  counted, so the remaining gap is customer payments only.
- Converting a cancelled advance to customer credit produces a negative customer
  receivable balance. Spending that credit on a later sale is not yet a guided
  flow; the balance is visible on the statement.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches the sprint
- [ ] Target branch is `dev`
