# Changelog

All notable project changes are recorded here.

## [0.4.0] - 2026-09-22

Release R3 retail, customers, and orders. Sprints 7 and 8 merged without a
changelog entry, so this entry records the whole release.

### Added

- Single POS terminal with one active session, starting cash, counted cash, and
  expected-cash reconciliation.
- Mobile-first product search, cart, and atomic idempotent sale posting.
- Customer management, credit and partially paid sales, ledger-derived customer
  balances, statements, and customer payments with optional sale allocation.
- Customer orders for later fulfillment:
  - order lifecycle from draft through ready, with requested fulfillment time;
  - order lines that snapshot product, unit, quantity, and price;
  - order advances collected through the POS drawer;
  - atomic once-only completion into exactly one linked sale;
  - cancellation with an explicit refund or customer-credit outcome;
  - an order queue filtered by status and due time.
- `requireAnyPermission` middleware for endpoints that serve several
  capabilities equally.

### Changed

- Customer ledger entries now carry a balance kind, so an advance held for a
  customer never nets against that customer's receivable.
- POS expected closing cash now includes order advances taken and refunds paid
  in the session.

### Security

- Order endpoints enforce action-specific RBAC permissions, and collecting an
  order advance requires both the order and the customer-payment permission.
- Order creation, advance, completion, and cancellation require idempotency
  keys so a retry cannot duplicate money or stock effects.

### Migration

- Added committed Prisma migrations for POS sales, customer credit, and the
  customer order and advance foundation. All are additive.
- Customer opening balances remain disabled until explicit approval and cutover
  values exist.
- Hard stock reservation for orders is deliberately not implemented.

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
