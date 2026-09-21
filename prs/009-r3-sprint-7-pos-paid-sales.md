# R3 Sprint 7 Single POS Sessions and Paid Sales

## Branches

- Source: `feature/r3-sprint-7-pos-paid-sales`
- Target: `dev`

## Scope

Implements Release R3, Sprint 7 for exactly one POS terminal, one active cash
session, and fully paid direct POS sales.

This PR adds the POS database foundation, singleton terminal bootstrap,
session open/close commands, cashier product search, paid sale posting, cash
payment recording, stock movement effects, audit events, idempotency
protection, and a French mobile-first POS workspace.

## Summary

- Added additive POS migration with:
  - `pos_terminals`;
  - `pos_sessions`;
  - `sales`;
  - `sale_lines`;
  - `sale_payments`;
  - POS/sale/payment enums;
  - partial unique index enforcing one open session per terminal.
- Added backend POS service and routes under `/api/pos`.
- Added `GET /api/pos/products` so cashiers can search active products without
  requiring catalog management permission.
- Added `GET /api/pos/sessions/current`.
- Added `POST /api/pos/sessions/open`.
- Added `POST /api/pos/sessions/:sessionId/close`.
- Added `POST /api/pos/sales` for fully paid cash sales.
- Added frontend POS module for open/close session, product search, cart, and
  paid sale confirmation.
- Added route and service tests for permissions, idempotency, posting effects,
  stock movement, duplicate retry, and cash close reconciliation.

## Out of Scope

- Credit sales, partial payments, and customer receivables remain Sprint 8.
- Future orders, advances, and order completion remain Sprint 9.
- Discounts and taxes remain disabled because `OD-002` and `OD-003` are open.
- Printed tickets remain disabled because `OD-013` is open.
- Non-cash methods remain out of UI scope; cash is the only active method per
  `OD-014`.

## Verification

- `npm run prisma:validate`: passed.
- `npm run typecheck --workspace backend`: passed.
- `npm run test --workspace backend -- pos.routes pos.service`: passed.
- `npm run typecheck --workspace frontend`: passed.
- `npm run test --workspace frontend -- App`: passed.
- `npm run format:check`: passed during implementation slices.

## Database and Migration Impact

Adds migration:

- `backend/prisma/migrations/20260921070000_add_pos_sales_foundation/migration.sql`

The migration is additive. It creates the singleton POS terminal seed with code
`main` and enforces one open session per terminal through a PostgreSQL partial
unique index.

Apply to shared remote development only after review using:

```bash
npm run prisma:migrate:deploy --workspace backend
```

Do not use `prisma migrate dev`, `db push`, or reset commands against shared
remote development.

## API and Permission Surface

- `GET /api/pos/products`
  - Requires `pos.access`.
  - Returns active products for POS search.
- `GET /api/pos/sessions/current`
  - Requires `pos.access`.
  - Returns the currently open POS session, if any.
- `POST /api/pos/sessions/open`
  - Requires `pos.open_session`.
  - Requires `Idempotency-Key`.
  - Opens the singleton cash session with starting cash.
- `POST /api/pos/sessions/:sessionId/close`
  - Requires `pos.close_session`.
  - Requires `Idempotency-Key`.
  - Stores counted cash, expected cash, and difference.
- `POST /api/pos/sales`
  - Requires `pos.sell`.
  - Requires `Idempotency-Key`.
  - Posts a fully paid cash sale, sale lines, payment, stock movement, and audit
    event atomically.

## Requirement Coverage

| Requirement | Coverage                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `POS-001`   | Version 1 exposes one singleton POS terminal with code `main`.                                           |
| `POS-002`   | POS terminal is system configuration seeded by migration/bootstrap, not user-managed UI.                 |
| `POS-003`   | At most one active session is allowed for the terminal.                                                  |
| `POS-004`   | Concurrent open attempts are guarded by a database partial unique index on open sessions.                |
| `POS-005`   | Permitted users can open with starting cash and close with counted cash.                                 |
| `POS-006`   | Closing stores expected cash, counted cash, and cash difference.                                         |
| `POS-007`   | Fully paid direct sale is supported.                                                                     |
| `POS-012`   | Paid sale posts stock movements for stockable products, records payment, and recognizes sale total once. |
| `POS-014`   | Sale lines snapshot product, unit, quantity, unit price, and line total.                                 |
| `POS-015`   | Posted sale records are immutable in this sprint; no edit/delete route is introduced.                    |
| `POS-016`   | Backend calculations use Prisma decimal arithmetic.                                                      |
| `POS-017`   | Backend calculates sale line totals and sale total authoritatively.                                      |
| `POS-018`   | UI previews totals only; submitted payload contains product and quantity, not trusted totals.            |
| `POS-019`   | Discounts and taxes are not implemented.                                                                 |
| `OD-012`    | Negative stock is not blocked in Sprint 7; sale stock movements remain auditable.                        |
| `OD-013`    | Printed receipts are not implemented.                                                                    |
| `OD-014`    | Cash is the only active POS payment method.                                                              |

## Acceptance Evidence

- One-active-session database guard:
  - `backend/prisma/migrations/20260921070000_add_pos_sales_foundation/migration.sql`
- Session open/close, paid sale posting, stock effects, audit, and idempotency:
  - `backend/src/modules/pos/pos.service.ts`
  - `backend/src/modules/pos/pos.service.test.ts`
- Permission-denied and allowed API paths:
  - `backend/src/modules/pos/pos.routes.ts`
  - `backend/src/modules/pos/pos.routes.test.ts`
- French mobile-first POS workspace:
  - `frontend/src/features/pos/PosManagement.tsx`
  - `frontend/src/features/pos/posApi.ts`
  - `frontend/src/styles/global.css`

## Risks and Follow-Up

- Sprint 7 supports the paid flow only; Sprint 8 must add customer credit and
  partial/unpaid sale handling.
- The UI is functional but still needs manual responsive review at 360 px,
  430 px, 768 px, and desktop widths before acceptance.
- Expected cash currently includes opening cash plus POS sale cash payments;
  Sprint 8 can extend this with customer payments collected in POS context.

## Merge Checklist

- [ ] CI passed on GitHub.
- [ ] Migration reviewed before applying to any shared database.
- [ ] No real `.env` files or secrets committed.
- [ ] Scope remains limited to R3 Sprint 7.
- [ ] Target branch is `dev`.

## GitHub PR Link

Use this compare URL:

```text
https://github.com/BohBOhTN/DEB_ERP/compare/dev...feature/r3-sprint-7-pos-paid-sales?expand=1
```
