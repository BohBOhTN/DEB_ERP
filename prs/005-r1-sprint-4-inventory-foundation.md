# R1 Sprint 4 Inventory Foundation

## Branches

- Source: `feature/r1-sprint-4-inventory-foundation`
- Target: `dev`

## Scope

Implements the Release R1, Sprint 4 lightweight inventory foundation.

This PR adds the main stock location seed, append-only inventory movement ledger, idempotent opening-stock and adjustment commands, stock balance and movement views, negative-balance visibility, French inventory UI, and focused permission tests.

## Atomic Commits

- `feat(inventory): add movement ledger schema`
- `feat(api): add idempotency records`
- `feat(inventory): add movement commands and views`
- `feat(inventory): add inventory workspace`

## Summary

- Added `StockLocation` and `InventoryMovement` Prisma models.
- Added inventory enums for item type and movement type.
- Added database checks for non-zero movement quantities and exactly one item reference per movement.
- Added `IdempotencyRecord` persistence for posting-style commands.
- Added idempotent main stock location bootstrap.
- Added `/api/inventory/balances` and `/api/inventory/movements`.
- Added `/api/inventory/opening-stock` and `/api/inventory/adjustments` with required `Idempotency-Key`.
- Added inventory movement snapshots for item name, unit name, source type, reason, actor, and correlation ID.
- Added audit writes for inventory movement creation.
- Added French inventory workspace with balances, movement list, negative-balance warning, opening stock form, and adjustment form.
- Added backend route tests for anonymous, denied, allowed balance view, idempotency-key enforcement, and permitted adjustment posting.

## Out of Scope

- Purchase posting and supplier workflows.
- POS sales and customer orders.
- Distributor custody and settlement.
- Multiple stock locations.
- Production, recipes, or automatic finished-product production output.
- Low-stock alerts.

## Verification

- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed with local-port permission for Supertest.
- `npm run build`: passed.
- `npm run prisma:validate`: passed.

## Database and Migration Impact

Adds migrations:

- `backend/prisma/migrations/20260921040000_add_inventory_ledger/migration.sql`
- `backend/prisma/migrations/20260921041000_add_idempotency_records/migration.sql`

New tables:

- `stock_locations`
- `inventory_movements`
- `idempotency_records`

Startup seed impact:

- Upserts the main stock location with code `main`.

No destructive schema changes are included.

## Permission Impact

Uses existing Sprint 2 permission keys:

- `inventory.view`
- `inventory.movements.view`
- `inventory.opening_stock`
- `inventory.adjust`

## Requirement Mapping

- INV-001: seeds one main stock location.
- INV-003 and INV-004: movement ledger supports future purchase receipts and stockable product sale reductions.
- INV-008: opening stock and adjustments use dedicated permissions.
- INV-009: adjustments require a reason and create audit evidence.
- INV-010: inventory history is append-only through movement records.
- INV-011: negative balances are visible in the UI.
- API-001: opening stock and adjustment are explicit command endpoints.
- API-002: inventory commands run through service-level transactions.
- API-005 and API-006: posting commands require idempotency keys and detect key reuse conflicts.
- API-011: errors remain stable and French-safe.

## Merge Checklist

- [ ] CI passed on GitHub.
- [ ] Migrations reviewed before applying to any shared database.
- [ ] One person owns migration deployment to the shared development database.
- [ ] No real `.env` files or secrets committed.
- [ ] Scope remains limited to R1 Sprint 4.
- [ ] Target branch is `dev`.

## GitHub PR Link

Use this compare URL:

```text
https://github.com/BohBOhTN/DEB_ERP/compare/dev...feature/r1-sprint-4-inventory-foundation?expand=1
```
