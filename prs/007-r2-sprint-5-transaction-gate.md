# R2 Sprint 5 Transaction Gate Hardening

## Branches

- Source: `feature/r2-sprint-5-transaction-gate`
- Target: `dev`

## Scope

Completes the remaining Release R2, Sprint 5 transaction-gate evidence for purchase posting.

This PR adds service-level rollback tests that force failures after each internal purchase-posting step and prove no partial purchase, stock, payable, payment, audit, or idempotency effect remains committed.

## Summary

- Added internal procurement transaction checkpoints for test-only failure injection.
- Added a staged in-memory Prisma transaction double for purchase posting tests.
- Added a successful posting test proving stock receipt, supplier payable, immediate payment, audit, and idempotency effects commit together.
- Added forced-failure tests after:
  - idempotency reservation;
  - purchase status update;
  - stock receipt movement creation;
  - supplier payable ledger creation;
  - immediate supplier payment creation;
  - supplier payment ledger creation;
  - purchase-post audit creation;
  - idempotency response persistence.
- Verified each forced failure rolls back to the original draft purchase state with no committed side effects.

## Out of Scope

- New procurement UI behavior.
- Schema or migration changes.
- Sprint 6 supplier statements and later supplier payments.
- Supplier returns or exchanges.

## Verification

- `npm run typecheck --workspace backend`: passed.
- `npm run test --workspace backend`: passed.
- `npm run lint`: passed.
- `npx prettier --check backend/src/modules/procurement/procurement.service.ts backend/src/modules/procurement/procurement.service.transaction.test.ts`: passed.

## Database and Migration Impact

No database migration is included.

The test uses an in-memory staged transaction double and does not touch the shared development database.

## Requirement Coverage

- R2 Sprint 5 transaction gate.
- `SUP-009`
- `SUP-010`
- `SUP-011`
- `API` transaction consistency rules from the source of truth.

## Risks and Follow-Up

- These tests prove the service transaction boundary and rollback behavior without using the shared database.
- Sprint 6 should continue with ledger-derived supplier statements and later supplier payments.

## Merge Checklist

- [ ] CI passed on GitHub.
- [ ] Scope remains limited to R2 Sprint 5 transaction-gate hardening.
- [ ] Target branch is `dev`.

## GitHub PR Link

Use this compare URL:

```text
https://github.com/BohBOhTN/DEB_ERP/compare/dev...feature/r2-sprint-5-transaction-gate?expand=1
```
