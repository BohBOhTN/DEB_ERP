# Changelog

All notable project changes are recorded here.

## [0.3.0] - 2026-09-21

### Added

- R2 procurement foundation:
  - supplier management;
  - purchase draft, posting, and cancellation flows;
  - backend-calculated purchase totals and normalized quantity snapshots;
  - ledger-backed supplier payable effects;
  - idempotent purchase posting and supplier payment commands;
  - ledger-derived supplier balances and statements;
  - later supplier payments with optional posted-purchase allocations;
  - French procurement UI for suppliers, purchases, balances, statements, and payments.

### Changed

- Supplier payable status is derived from ledger entries instead of editable balance fields.
- Supplier payments record actual money movement and do not change stock.

### Security

- Procurement endpoints enforce action-specific RBAC permissions.
- Posting commands require idempotency keys to prevent duplicate effects after retries.

### Migration

- Added committed Prisma migrations for procurement tables, supplier ledger entries, idempotency records, and supplier payment allocations.
- Supplier opening balances remain disabled until explicit approval and cutover values exist.
