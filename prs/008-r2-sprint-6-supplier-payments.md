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

## API and Permission Surface

- `GET /api/procurement/supplier-balances`
  - Requires `supplier_balances.view`.
  - Returns ledger-derived supplier balances with open and overdue purchase projections.
- `GET /api/procurement/suppliers/:supplierId/statement`
  - Requires `supplier_balances.view`.
  - Returns supplier, balance, purchases with payment state, ledger entries, and payments.
- `GET /api/procurement/supplier-payments`
  - Requires `supplier_payments.view`.
  - Supports optional `supplierId`, pagination, and stable newest-first ordering.
- `POST /api/procurement/supplier-payments`
  - Requires `supplier_payments.create`.
  - Requires `Idempotency-Key`.
  - Creates a cash supplier payment, optional purchase allocations, payable ledger reduction, and audit event in one transaction.

## Requirement Coverage

| Requirement | Coverage                                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SUP-014`   | Supplier payment status and remaining balances are exposed through supplier balances and statements. Purchase states are derived as unpaid, partially paid, paid, overdue, or cancelled from posted purchases and supplier ledger entries. |
| `SUP-015`   | Supplier balances are calculated from `supplier_ledger_entries` in `listSupplierBalances` and `getSupplierStatement`; no editable payable balance field is introduced.                                                                     |
| `SUP-016`   | Later supplier payments support optional allocations across one or more posted purchases through `SupplierPaymentAllocation`; allocation totals must equal the payment amount.                                                             |
| `SUP-017`   | `SupplierPayment` stores supplier, date, amount, method, optional reference, optional notes, responsible user, correlation ID, and optional allocation rows.                                                                               |
| `SUP-018`   | The UI posts cash-only supplier payments, while the persisted `SupplierPaymentMethod` enum remains extensible for later approved methods.                                                                                                  |
| `SUP-019`   | Supplier opening balances remain unimplemented because the decision is still open; no migration or UI flow imports opening balances.                                                                                                       |
| `OD-005`    | Opening balances are not migrated or seeded without explicit approval and cutover values.                                                                                                                                                  |
| `OD-010`    | Supplier overpayment is rejected with `SUPPLIER_OVERPAYMENT_REJECTED` until explicit supplier credit support is approved.                                                                                                                  |
| R2 Sprint 6 | Ledger-derived statements, later payments, optional allocations, due/overdue projection, duplicate retry protection, cash-only UI, and disabled opening balances are all included.                                                         |

## Acceptance Evidence

- Ledger-derived balance and statement behavior:
  - `backend/src/modules/procurement/procurement.service.ts`
  - `backend/src/modules/procurement/procurement.routes.test.ts`
- Later supplier payments, duplicate retry protection, allocation validation, overpayment rejection, and no stock effect:
  - `backend/src/modules/procurement/procurement.service.payments.test.ts`
- Permission-denied and allowed API paths:
  - `backend/src/modules/procurement/procurement.routes.test.ts`
- French supplier balance, statement, payment history, and payment creation UI:
  - `frontend/src/features/procurement/ProcurementManagement.tsx`
  - `frontend/src/features/procurement/procurementApi.ts`

## R2 Release Gate Notes

- Stock receipts and supplier statements reconcile because purchase posting writes inventory movements and supplier payable ledger entries, while Sprint 6 reads supplier statements from the same ledger.
- Partial and later payments reduce payable through supplier ledger entries and retain exact three-decimal TND strings.
- Supplier payments do not create inventory movements and do not classify purchases as operating expenses.
- The Sprint 6 migration is additive and can be applied with `prisma migrate deploy`.
- Rollback should use application rollback when schema compatibility allows; otherwise prefer a forward fix because supplier payment rows and ledger entries are business records.
- Changelog and API documentation are updated for the R2 procurement surface before tagging `v0.3.0`.

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
