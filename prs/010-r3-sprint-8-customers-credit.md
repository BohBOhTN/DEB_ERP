# R3 Sprint 8 Customers Credit and Payments

## Branches

- Source: `feature/r3-sprint-8-customers-credit`
- Target: `dev`

## Scope

Implements Release R3, Sprint 8 for customer management, partial/unpaid POS
sales, customer receivables, statements, and customer payments.

This PR extends the Sprint 7 paid POS flow without changing the fast fully paid
sale path. Credit is allowed only for registered active customers, revenue is
recognized once at sale posting, actual cash is recorded separately, and later
customer payments reduce receivables without creating sale revenue again.

## Summary

- Added customer credit schema:
  - `customers`;
  - `customer_payments`;
  - `customer_payment_allocations`;
  - `customer_ledger_entries`;
  - `sales.customer_id`;
  - `sales.remaining_due_tnd`;
  - customer payment and ledger entry enums.
- Replaced the paid-only sale consistency check with payment-state rules that
  allow `PAID`, `PARTIALLY_PAID`, and `UNPAID`, while requiring a customer for
  any remaining due.
- Added customer backend service and API routes for customer CRUD, balances,
  statements, customer payment creation, payment allocation, and payment
  history.
- Extended POS sale posting with optional `customerId` and `paidAmountTnd`.
- Added `GET /api/pos/customers` for cashiers with `pos.credit_sale` to search
  active customers without full customer-management permission.
- Added frontend customer workspace for customer creation, balances,
  statements, payments, and payment allocation.
- Extended the POS workspace to support partial/unpaid sales with frontend
  anonymous-credit rejection.
- Added focused tests for POS credit permissions, anonymous credit rejection,
  receivable creation, idempotent retry, customer payment ledger behavior,
  overpayment rejection, and allocation validation.

## Out of Scope

- Customer orders, advances, deposits, cancellation handling, and order
  completion remain Sprint 9.
- Customer opening balances remain disabled because `CUS-012` and `OD-004` are
  open.
- Customer overpayment credit is not implemented; overpayment is rejected per
  `OD-009`.
- Discounts and taxes remain disabled because `POS-019` is open.
- Non-cash methods remain out of UI scope; cash is the only active method per
  `OD-014`.

## Verification

- `npm run prisma:validate`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed; backend 79 tests and frontend 3 tests.
- `npm run build`: passed.
- `npm run format:check`: passed after formatting this PR note.

## Database and Migration Impact

Adds migration:

- `backend/prisma/migrations/20260921080000_add_customer_credit_foundation/migration.sql`

The migration is additive for new customer/payment/ledger structures and adds
nullable customer linkage plus `remaining_due_tnd` to existing `sales`. It also
updates the sale payment-state check so partial and unpaid posted sales are
valid only when the remaining due is consistent with the paid amount and linked
customer.

Apply to shared remote development only after review using:

```bash
npm run prisma:migrate:deploy --workspace backend
```

Do not use `prisma migrate dev`, `db push`, or reset commands against shared
remote development.

## API and Permission Surface

- `GET /api/customers`
  - Requires `customers.view`.
  - Lists customers with search and active filters.
- `POST /api/customers`
  - Requires `customers.create`.
  - Creates customer master data.
- `PATCH /api/customers/:customerId`
  - Requires `customers.update`.
  - Updates customer fields and activation state with optimistic versioning.
- `GET /api/customer-balances`
  - Requires `customer_balances.view`.
  - Reconstructs balances from customer ledger entries.
- `GET /api/customers/:customerId/statement`
  - Requires `customer_balances.view`.
  - Returns customer, sales, ledger entries, payments, and sale balances.
- `GET /api/customer-payments`
  - Requires `customer_payments.view`.
  - Lists customer payments and allocations.
- `POST /api/customer-payments`
  - Requires `customer_payments.create`.
  - Requires `Idempotency-Key`.
  - Records customer payments and optional sale allocation.
- `GET /api/pos/customers`
  - Requires `pos.credit_sale`.
  - Returns active customers for POS credit-sale selection.
- `POST /api/pos/sales`
  - Still requires `pos.sell`.
  - Also requires `pos.credit_sale` when `paidAmountTnd` is supplied.
  - Posts paid, partial, or unpaid direct sales atomically.

## Requirement Coverage

| Requirement | Coverage                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `POS-008`   | POS can record credit sales when `paidAmountTnd` is less than backend-calculated total.                            |
| `POS-009`   | POS can record partial payment and leave customer receivable.                                                      |
| `POS-010`   | Backend and frontend require a registered customer whenever unpaid amount remains.                                 |
| `POS-011`   | Anonymous sales remain valid only when fully paid.                                                                 |
| `POS-012`   | Sale posting records full sale amount, stock movement, actual payment only, and customer receivable for remainder. |
| `POS-013`   | Later customer payments write payment ledger entries only and do not create revenue again.                         |
| `POS-014`   | Sale lines still snapshot product, unit, quantity, unit price, and line total.                                     |
| `POS-015`   | Posted sales remain immutable; no edit/delete route is introduced.                                                 |
| `POS-016`   | Backend sale and payment calculations use Prisma decimal arithmetic.                                               |
| `POS-017`   | Backend calculates authoritative totals, paid amount, and remaining due.                                           |
| `POS-018`   | UI previews totals and remaining due only; trusted totals are not submitted.                                       |
| `POS-019`   | Discounts and taxes remain open and unimplemented.                                                                 |
| `CUS-001`   | Customer CRUD service and routes are added.                                                                        |
| `CUS-002`   | Customer name is required.                                                                                         |
| `CUS-003`   | Phone, address, notes, and tax identifier are optional.                                                            |
| `CUS-004`   | Customer deactivation preserves history and blocks new credit-sale selection.                                      |
| `CUS-005`   | Customer amounts due and payments are tracked through ledger and payment tables.                                   |
| `CUS-006`   | Registered customers may carry balances; no credit-limit engine is introduced.                                     |
| `CUS-007`   | Customer balances are reconstructed from ledger entries.                                                           |
| `CUS-008`   | Credit and partial sales increase receivable by unpaid amount.                                                     |
| `CUS-009`   | Customer payment decreases receivable by applied amount.                                                           |
| `CUS-010`   | Customer advances remain Sprint 9 with orders; not implemented here.                                               |
| `CUS-011`   | Payment history includes payment rows, allocations, dates, references, and statements.                             |
| `CUS-012`   | Opening balances remain open and disabled.                                                                         |
| `OD-004`    | No customer opening-balance migration or seed is included.                                                         |
| `OD-009`    | Customer overpayment is rejected.                                                                                  |
| `OD-014`    | UI remains cash-only while backend storage stays extensible.                                                       |

## Acceptance Evidence

- Customer credit schema and sale constraints:
  - `backend/prisma/schema.prisma`
  - `backend/prisma/migrations/20260921080000_add_customer_credit_foundation/migration.sql`
- Customer CRUD, balances, statements, payments, allocations, idempotency:
  - `backend/src/modules/customers/customers.service.ts`
  - `backend/src/modules/customers/customers.routes.ts`
  - `backend/src/modules/customers/customers.routes.test.ts`
  - `backend/src/modules/customers/customers.service.payments.test.ts`
- POS partial/unpaid sale posting and credit customer lookup:
  - `backend/src/modules/pos/pos.service.ts`
  - `backend/src/modules/pos/pos.routes.ts`
  - `backend/src/modules/pos/pos.service.test.ts`
  - `backend/src/modules/pos/pos.routes.test.ts`
- French customer and POS credit UI:
  - `frontend/src/features/customers/CustomerManagement.tsx`
  - `frontend/src/features/customers/customersApi.ts`
  - `frontend/src/features/pos/PosManagement.tsx`
  - `frontend/src/features/pos/posApi.ts`
  - `frontend/src/features/shell/ProtectedShell.tsx`
  - `frontend/src/styles/global.css`

## Risks and Follow-Up

- Manual responsive review is still needed at 360 px, 430 px, 768 px, and
  desktop widths before acceptance.
- Sprint 9 must add customer orders, advances, advance application, order
  cancellation, and completion into linked sale.
- Customer payment collection is currently in the customer module, not the POS
  close cash reconciliation workflow.

## Merge Checklist

- [ ] CI passed on GitHub.
- [ ] Migration reviewed before applying to any shared database.
- [ ] No real `.env` files or secrets committed.
- [ ] Scope remains limited to R3 Sprint 8.
- [ ] Target branch is `dev`.

## GitHub PR Link

Use this compare URL:

```text
https://github.com/BohBOhTN/DEB_ERP/compare/dev...feature/r3-sprint-8-customers-credit?expand=1
```
