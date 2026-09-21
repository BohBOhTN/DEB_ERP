# R2 Sprint 6 Supplier Balances and Payments

## Branches

- Source: `feature/r2-sprint-6-supplier-payments`
- Target: `dev`

## Scope

Implements Release R2, Sprint 6 supplier statements and later supplier payments.

This PR adds ledger-derived supplier balances, supplier statements, supplier payment history, cash-only later supplier payments, optional allocations to posted purchases, idempotent payment posting, duplicate retry protection, and French UI support for balances and payments.

## Summary

- Added `SupplierPaymentAllocation` persistence for optional allocation of one payment across posted purchases.
- Added supplier balance endpoint derived from `supplier_ledger_entries`.
- Added supplier statement endpoint with purchases, payment states, ledger entries, and payments.
- Added supplier payment list endpoint.
- Added later supplier payment command with:
  - cash-only method using existing extensible enum storage;
  - idempotency key protection;
  - overpayment rejection while supplier credit remains unapproved;
  - optional posted-purchase allocations;
  - supplier payment record creation;
  - supplier payable ledger reduction;
  - audit event creation;
  - no stock effect.
- Added backend route tests for balance, statement, payment list, idempotency-key, and allowed payment creation paths.
- Added service tests for ledger-derived payment behavior, idempotent retry, overpayment rejection, allocation validation, and absence of stock effects.
- Added French frontend tabs for supplier balances, statements, payment history, and later supplier payment creation.

## Out of Scope

- Supplier opening balances remain disabled because `SUP-019` / `OD-005` are open.
- Supplier credit / overpayment support remains disabled because `OD-010` is open.
- Non-cash payment methods remain out of UI scope; storage remains extensible.
- Supplier returns and exchanges remain deferred.
- Full treasury or cash-account management is not introduced.

## Verification

- `npm run prisma:validate`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: passed.
- `npm run build`: passed.
- `npm run format:check`: passed.

## Database and Migration Impact

Adds migration:

- `backend/prisma/migrations/20260921060000_add_supplier_payment_allocations/migration.sql`

New table:

- `supplier_payment_allocations`

The migration is additive and does not rewrite existing procurement data.

## Requirement Coverage

- `SUP-014`
- `SUP-015`
- `SUP-016`
- `SUP-017`
- `SUP-018`
- `SUP-019` kept disabled/open
- `OD-005` respected
- `OD-010` respected
- R2 Sprint 6 release requirements

## Risks and Follow-Up

- Payment allocation UI currently supports a single selected purchase allocation per payment; the backend supports multiple allocations for future UI expansion.
- Supplier statement projections are ledger-derived and should be used as the authority for balances.
- Sprint R3 can now depend on R2 procurement foundations.

## Merge Checklist

- [ ] CI passed on GitHub.
- [ ] Migration reviewed before applying to any shared database.
- [ ] No real `.env` files or secrets committed.
- [ ] Scope remains limited to R2 Sprint 6.
- [ ] Target branch is `dev`.

## GitHub PR Link

Use this compare URL:

```text
https://github.com/BohBOhTN/DEB_ERP/compare/dev...feature/r2-sprint-6-supplier-payments?expand=1
```
