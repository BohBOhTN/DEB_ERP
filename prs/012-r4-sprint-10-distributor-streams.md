# R4 Sprint 10 Distributor Streams

## Branches

- Source: `feature/r4-sprint-10-distributor-streams`
- Target: `dev`

## Scope

Implements Release R4, Sprint 10: distributor management, direct distributor
sales, consignment dispatch with custody, settlement of dispatched quantity, and
distributor receivables and payments.

This PR opens Release R4. It keeps the two distributor streams the source of
truth describes strictly apart. A direct sale behaves like a sale: stock leaves,
revenue is recognized once, any remainder is receivable. Consignment does not:
dispatch transfers custody only, and nothing becomes revenue until a settlement
says what was actually sold.

## Summary

- Added the distributor schema:
  - `distributors`;
  - `distributor_sales` and `distributor_sale_lines`;
  - `distributor_dispatches` and `distributor_dispatch_lines`;
  - `distributor_settlements` and `distributor_settlement_lines`;
  - `distributor_payments` and `distributor_payment_allocations`;
  - `distributor_ledger_entries`;
  - reference sequences for `VD-`, `BL-`, and `REG-` documents;
  - dispatch status, payment method, and ledger entry type enums.
- Added distributor master data with optimistic versioning and deactivation
  that preserves history.
- Added direct distributor sale posting: stock leaves main immediately, the full
  amount becomes receivable, and only the money actually received reduces it.
- Added consignment dispatch: main stock decreases, custody increases, and no
  sale, receivable, or payment is created.
- Added settlement: the sold part becomes revenue and receivable, returns
  re-enter main stock, still-held quantity stays in custody, and unaccounted
  quantity is recorded as a discrepancy with no automatic debt.
- Added distributor payments with optional allocation to a direct sale or a
  settlement, ledger-derived balances, and a statement.
- Added the custody and discrepancy views.
- Added the French distribution workspace with tabs for distributors, direct
  sales, consignment, and balances.
- Added tests for every posting effect, the custody invariant, the permission
  surface, and a PostgreSQL-backed proof that a dispatched quantity cannot be
  settled twice under concurrency.

## Out of Scope

- Distributor-specific price lists are not implemented, per the `OD-006` and
  `DST-029` safe default. The price is entered or confirmed on each transaction
  and snapshotted.
- Rich discrepancy resolution, alerts, and approval workflows remain deferred
  per `DST-024`.
- Distributor credit limits are not introduced, per `DST-028`.
- Expenses remain Sprint 11 and cost simulation remains Sprint 12.
- Non-cash methods remain out of UI scope; cash is the only active method per
  `OD-014`.

## Verification

- `npm run prisma:validate`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed; backend 148 tests and frontend 3 tests. The 4
  database-backed concurrency tests skip locally and run in CI, where
  `REQUIRE_INTEGRATION_TESTS` makes a missing database fail the build rather
  than skip them.
- `npm run build`: passed.
- `npm run format:check`: passed.

## Database and Migration Impact

Adds migration:

- `backend/prisma/migrations/20260922100000_add_distributor_streams/migration.sql`

The migration is purely additive. It creates nine tables, three reference
sequences, and three enums, and touches no existing table or column. It reuses
the existing `SaleStatus` and `SalePaymentState` enums rather than duplicating
them, so it adds no enum values either.

Database check constraints enforce the money and quantity invariants directly:

- a direct sale's paid amount never exceeds its total, and the remaining due
  always equals total less paid;
- a settlement's paid amount never exceeds the amount sold, and a settlement of
  returns only is valid at a zero total;
- **the custody invariant** — settled sold plus returned plus unaccounted can
  never exceed the dispatched quantity on a dispatch line (`DST-022`);
- a settlement line must classify at least one quantity;
- a payment allocation targets exactly one document, a sale or a settlement.

Apply to shared remote development only after review using:

```bash
npm run prisma:migrate:deploy --workspace backend
```

Do not use `prisma migrate dev`, `db push`, or reset commands against shared
remote development.

## Environment Impact

No new or changed environment variables.

## API and Permission Surface

- `GET /api/distributors` — requires `distributors.view`.
- `POST /api/distributors` — requires `distributors.create`.
- `PATCH /api/distributors/:distributorId` — requires `distributors.update`;
  optimistic versioning.
- `POST /api/distributor-sales` — requires `distribution.direct_sale` and an
  `Idempotency-Key`.
- `GET /api/distributor-dispatches` — requires `distribution.custody.view`.
- `GET /api/distributor-dispatches/:dispatchId` — requires
  `distribution.custody.view`.
- `POST /api/distributor-dispatches` — requires `distribution.dispatch` and an
  `Idempotency-Key`.
- `POST /api/distributor-settlements` — requires `distribution.settle` and an
  `Idempotency-Key`.
- `GET /api/distributor-custody` — requires `distribution.custody.view`; returns
  still-held quantity and the unaccounted discrepancies.
- `GET /api/distributor-balances` — requires `distribution.balances.view`.
- `GET /api/distributors/:distributorId/statement` — requires
  `distribution.balances.view`.
- `GET /api/distributor-payments` — requires `distributor_payments.view`.
- `POST /api/distributor-payments` — requires `distributor_payments.create` and
  an `Idempotency-Key`.

No permission key was added; every key above already existed in the baseline
namespace.

## Requirement Coverage

| Requirement | Coverage                                                                                |
| ----------- | --------------------------------------------------------------------------------------- |
| `DST-001`   | Distributor create, update, and activation are implemented.                             |
| `DST-002`   | Name is required; phone, address, notes, and tax identifier are optional.               |
| `DST-003`   | Distributors are a distinct party with their own custody and ledger.                    |
| `DST-004`   | Direct distributor sale posting is implemented.                                         |
| `DST-005`   | A direct sale reduces main stock immediately for stockable products.                    |
| `DST-006`   | A direct sale recognizes the full amount once.                                          |
| `DST-007`   | Full, partial, and deferred payment are supported.                                      |
| `DST-008`   | Any unpaid remainder stays as distributor receivable in the ledger.                     |
| `DST-009`   | Sale lines snapshot product, unit, quantity, applied price, and line total.             |
| `DST-010`   | Consignment dispatch is implemented.                                                    |
| `DST-011`   | Dispatch creates no sale, receivable, or payment; a test asserts all three.             |
| `DST-012`   | Consigned goods stay bakery-owned; custody is tracked separately from the balance.      |
| `DST-013`   | Dispatch moves quantity out of main stock and into custody.                             |
| `DST-014`   | Unsold quantity stays in custody across days; the dispatch stays open.                  |
| `DST-015`   | Payment and dispatch are independent commands.                                          |
| `DST-016`   | Settlement records the quantities actually sold.                                        |
| `DST-017`   | Sold quantity leaves custody, is recognized, and becomes receivable unless paid.        |
| `DST-018`   | Returned quantity leaves custody and re-enters main stock.                              |
| `DST-019`   | Still-held quantity is derived and stays in custody.                                    |
| `DST-020`   | Unaccounted quantity creates no debt; no ledger entry is written for it.                |
| `DST-021`   | Unaccounted quantity stays visible through the custody discrepancy view.                |
| `DST-022`   | A row lock, a service check, and a database check constraint prevent double settlement. |
| `DST-023`   | Settlement posts custody, revenue, receivable, payment, and stock in one transaction.   |
| `DST-024`   | Rich discrepancy workflows remain deferred and are not implemented.                     |
| `DST-025`   | Distributor payments can be recorded later and at irregular times.                      |
| `DST-026`   | A payment reduces the receivable and never changes custody; a test asserts this.        |
| `DST-027`   | A payment writes no revenue; balances are reconstructed from ledger entries.            |
| `DST-028`   | No credit limit is introduced.                                                          |
| `DST-029`   | The price is entered per transaction and snapshotted, per the documented safe position. |
| `OD-006`    | No distributor price list, matching the documented safe position.                       |
| `OD-012`    | Negative stock stays permitted with an audit trail, unchanged from earlier sprints.     |

## Acceptance Evidence

- `AS-014` distributor consignment:
  `backend/src/modules/distribution/distribution.service.dispatch.test.ts`,
  "moves stock into custody without creating a sale or debt" asserts a
  100-unit stock decrease and zero sales, ledger entries, and payments.
- `AS-015` distributor settlement:
  `backend/src/modules/distribution/distribution.service.settlement.test.ts`,
  "classifies sold, returned, and unaccounted quantity" settles 80 sold, 15
  returned and 5 unaccounted out of 100 and asserts 160.000 TND recognized, a
  15-unit return to main stock, the 5 recorded as a discrepancy with no ledger
  entry, and the dispatch closing.
- `AS-016` distributor payment:
  `backend/src/modules/distribution/distribution.service.payments.test.ts`,
  "reduces the receivable without touching custody or revenue".
- Double settlement under concurrency:
  `backend/src/modules/distribution/distribution.service.concurrency.test.ts`
  fires four overlapping settlements each claiming 60 of a 100 dispatch and
  asserts exactly one succeeds, the other three fail with
  `SETTLEMENT_EXCEEDS_HELD_QUANTITY`, and custody reconciles at 60 sold and 40
  still held. A second case proves the check constraint refuses an
  over-classified dispatch line even when the service is bypassed.
- Schema and quantity invariants:
  - `backend/prisma/schema.prisma`
  - `backend/prisma/migrations/20260922100000_add_distributor_streams/migration.sql`
- Distribution service and routes:
  - `backend/src/modules/distribution/distribution.service.ts`
  - `backend/src/modules/distribution/distribution.routes.ts`
  - `backend/src/modules/distribution/distribution.routes.test.ts`
- French distribution UI:
  - `frontend/src/features/distribution/DistributionManagement.tsx`
  - `frontend/src/features/distribution/distributionApi.ts`
  - `frontend/src/features/shell/ProtectedShell.tsx`
  - `frontend/src/styles/global.css`

## Decisions Taken

Three points were not settled by the source of truth and were decided for this
sprint. All three are recorded here for review.

1. **Custody lives only in the dispatch tables.** Still-held quantity is always
   derived as dispatched less settled sold, returned, and unaccounted; it is
   never stored. The inventory ledger records main-stock effects only, so
   custody and stock cannot drift apart. The consequence is that the Stock
   screen does not show consigned goods, and custody has its own view. The
   reserved `DISTRIBUTOR_SETTLED_SALE` movement type is therefore unused: the
   stock already left main at dispatch, and writing it again would double-count.
2. **Distributor sales are a separate document, not POS sales.** Section 20 of
   the source of truth offers `DistributorDirectSale or SaleChannel`. A separate
   table keeps `sales.session_id` required for POS work and keeps wholesale
   revenue out of the till's cash reconciliation, matching how supplier payments
   already sit outside the drawer.
3. **Distributor ledgers follow the supplier convention, not the customer one.**
   Sprint 5 writes the full purchase payable then a negative payment entry;
   Sprint 8 writes a customer receivable for the remainder only. Distributors
   use the supplier shape, because a distributor is a party balance with a
   document-then-payments lifecycle and the ledger then shows the whole
   document. Balances are identical under either convention.

Two API defaults follow from those rules and are worth noting: an omitted
`paidAmountTnd` means fully paid on a direct sale, matching the POS precedent,
but means nothing collected on a settlement, matching `DST-017`'s "unless paid".
The UI always sends an explicit amount.

## Risks and Follow-Up

- The customer and supplier ledger conventions still disagree, as described
  above. Distributors now match suppliers, which leaves Sprint 8's customer
  module as the odd one out. Aligning it is a separate change with its own
  migration and was deliberately left out of this sprint.
- Manual responsive review is still needed at 360 px, 430 px, 768 px, and
  desktop widths before acceptance.
- The settlement form lists every line of the selected dispatch. A dispatch
  with many products will produce a long form on a phone; pagination or
  progressive disclosure may be wanted after the responsive review.
- The distributor statement endpoint is implemented and tested at the service
  level but is not yet surfaced in the workspace, which shows balances only.
- Direct distributor sales have no cancellation path. `DST` does not ask for
  one, and posted records stay immutable, so a correction currently needs a
  compensating entry.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches the sprint
- [ ] Target branch is `dev`
