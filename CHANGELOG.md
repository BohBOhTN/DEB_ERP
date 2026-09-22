# Changelog

All notable project changes are recorded here.

## [Unreleased]

Release R6 platform hardening, targeting `v1.1.0`.

### Added

- Structured request and error logging (pino) keyed by correlation id.
- Liveness and readiness probes under `/api/v1/health` with build version,
  git sha and latest applied migration; `/api/health` remains as an alias.
- `Idempotency-Replayed: true` header on replayed posting commands.
- Cleanup job for expired idempotency records and sessions.
- Global per-client rate limit, gzip compression, request timeouts, graceful
  shutdown with forced exit, and `trust proxy` configuration.

### Changed

- Body-parser and Prisma errors map to 400/413/415/404/409/503 with stable
  codes instead of a generic 500.
- `VERSION_CONFLICT` is the only code for stale optimistic updates.
- Client-supplied correlation ids are validated before being stored.
- Every posting transaction runs with an explicit timeout and isolation level.

### Fixed

- `InventoryService` could run one request's reads and writes inside another
  request's transaction under load.
- Two identical concurrent posting commands could return a 500 instead of a
  replay.
- Backend user-facing messages were written without accents.

## [1.0.0] - 2026-09-22

Version 1 feature scope is complete. See `RELEASE_v1.0.0.md` for the
stabilization evidence and the exit-gate status; the tag is withheld until the
responsive review and UAT are closed.

### Added

- R5 audit and operational supervision:
  - authentication security events (`auth.login`, `auth.logout`, and
    `auth.login_failed` with a reason);
  - a permission-protected, read-only audit viewer with server-side paging,
    filtering, and a stable sort;
  - the POS sales list, overdue and upcoming purchases and orders, and
    distributor settlement history;
  - ledger reconciliation tests.
- R5 hardening:
  - an authorization matrix derived from the running Express stack, so an
    unguarded route fails the build;
  - error redaction tests proving no stack, host, path, SQL, or schema name
    reaches a client;
  - release evidence in `RELEASE_v1.0.0.md`.
- R4 distribution, expenses, and ingredient cost simulation.
- R3 single POS, customer credit, customer orders, and advances.

### Fixed

- Validation messages are now French. Zod's English defaults were reaching the
  interface through `fieldErrors`.
- The selected state on filter chips and list rows used an undefined CSS
  custom property, so it rendered with no visual feedback.

### Security

- Every authenticated route is mechanically proven to carry a permission guard,
  and no write route is guarded by a view-only permission.
- Authentication failures are audited without storing attacker-supplied email
  addresses.

### Known limitations

- `AS-020`, the French responsive experience, is not automated and has not been
  reviewed on a device.
- `OD-015`, retention and backup, remains open and was excluded from Sprint 14
  by direction.
- Three high-severity advisories affect the Prisma CLI toolchain only. The
  deployed runtime does not depend on the vulnerable package; the fix needs a
  major upgrade and is deferred to the first maintenance release.

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
