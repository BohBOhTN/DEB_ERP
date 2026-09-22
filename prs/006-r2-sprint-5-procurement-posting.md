# R2 Sprint 5 Suppliers and Purchase Posting

## Branches

- Source: `feature/r2-sprint-5-procurement-posting`
- Target: `dev`

## Scope

Implements Release R2, Sprint 5 procurement foundation.

This PR adds supplier management, multi-line purchase drafts, purchase-unit conversion snapshots, backend-calculated TND totals, paid/partial/unpaid payment terms, idempotent purchase posting, stock receipt effects, supplier payable ledger effects, immediate supplier payment records, cancellation reversal effects, and a French procurement workspace.

## Summary

- Added supplier, purchase, purchase-line, supplier-payment, and supplier-ledger Prisma models.
- Added additive procurement migration with decimal columns, indexes, foreign keys, and critical check constraints.
- Added supplier list, create, update, activate, and deactivate endpoints with exact permission checks.
- Added purchase list and draft creation endpoints.
- Calculates normalized purchase quantities and line totals on the backend using raw-material unit conversions.
- Preserves purchase-line snapshots for material names, entered units, base units, conversion factors, quantities, and prices.
- Enforces paid, partial, and unpaid purchase rules, including due date requirement when a balance remains.
- Posts purchases idempotently in one transaction across purchase status, stock receipt movements, supplier payable ledger entries, immediate cash payment records, payment ledger entries, audit, and idempotency response storage.
- Adds cancellation command with stock and supplier-ledger reversal entries.
- Adds a French procurement workspace for suppliers, purchase drafts, posting, and cancellation.
- Adds route tests for anonymous, denied, supplier, and purchase command paths.

## Out of Scope

- Later supplier payments not tied to initial purchase posting.
- Supplier statement screens and due/overdue filters.
- Optional payment allocation across purchases.
- Supplier opening balances.
- Supplier returns and supplier exchanges.
- Formal treasury, expenses, legal invoices, or tax workflows.

## Verification

- `npm run prisma:validate`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: passed.
- `npm run build`: passed.
- `npm run format:check`: passed.

## Database and Migration Impact

Adds migration:

- `backend/prisma/migrations/20260921050000_add_procurement_foundation/migration.sql`

New tables:

- `suppliers`
- `purchases`
- `purchase_lines`
- `supplier_payments`
- `supplier_ledger_entries`

New enums:

- `PurchaseStatus`
- `PurchasePaymentTerms`
- `SupplierPaymentMethod`
- `SupplierLedgerEntryType`

The migration is additive. It does not drop or rewrite existing tables.

## Requirement Coverage

- `SUP-001` through `SUP-012`
- AS-004 partial supplier purchase foundation
- AS-005 purchase-unit conversion snapshot foundation

## Risks and Follow-Up

- Transaction fault-injection tests after each internal posting step are still needed to fully prove the documented Sprint 5 transaction gate.
- Supplier balances and later supplier payments belong to Sprint 6 and are not included here.
- The frontend displays an estimated review total, but backend calculations remain authoritative.

## Merge Checklist

- [ ] CI passed on GitHub.
- [ ] Migration reviewed before applying to any shared database.
- [ ] No real `.env` files or secrets committed.
- [ ] Scope remains limited to R2 Sprint 5.
- [ ] Target branch is `dev`.

## GitHub PR Link

Use this compare URL:

```text
https://github.com/BohBOhTN/DEB_ERP/compare/dev...feature/r2-sprint-5-procurement-posting?expand=1
```
