# 007 · Règlements tied to documents: sales, purchases and distributor documents keep their paid state

| Field              | Value                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Module             | `backend/src/modules/customers`, `procurement`, `distribution`, `pos`; frontend payment dialogs in `customers`, `procurement`, `distribution`                                                                                              |
| Type               | Data-integrity fix + UX                                                                                                                                                                                                                    |
| Priority           | Highest: the stored state of every sale and distributor document is wrong after the first later payment                                                                                                                                    |
| Depends on         | nothing; 004 and 006 depend on it                                                                                                                                                                                                          |
| Suggested branches | `fix/payments-document-state` (backend sync + allocation rule, all three parties) then `fix/payments-dialog-ux` (dialogs)                                                                                                                  |
| Related            | source of truth §10.3 (`SUP-015`, `SUP-016`), §11.3 ("Remaining Due = Sale Total − Payments Applied"), §13 (`CUS-009`, `CUS-011`), §14.5 (`DST-026`), `GOV-006` (cached balances are projections rebuilt from entries), `OD-009`, `OD-010` |

## Owner's request

> Fix the payments so the payments are tied to a sale and the sale shows it. Fix "Encaisser un règlement" so the money goes directly into a sale, so that sale can be paid, partial, unpaid. Same fixes for the distributors and fournisseurs: adding payments must be linked directly and affect the sale or the purchase, and reduce the client/supplier/distributor debt. Enhance the logic and the UI/UX.

## Findings

### The backend already links payments to documents, but the documents never learn about it

- Customer payments accept `allocations: [{ saleId, amountTnd }]` ([customers.routes.ts:74-89](../backend/src/modules/customers/customers.routes.ts#L74-L89)); the service validates ownership, POSTED status and the per-sale ledger balance, then writes one `CustomerPaymentAllocation` and one `PAYMENT` ledger entry with `saleId` per allocation ([customers.service.ts:605-662](../backend/src/modules/customers/customers.service.ts#L605-L662)). Supplier payments do the same with `purchaseId` ([procurement.service.ts:1050-1189](../backend/src/modules/procurement/procurement.service.ts#L1050-L1189)); distributor payments with `saleId` or `settlementId` ([distribution.service.ts:1046-1181](../backend/src/modules/distribution/distribution.service.ts#L1046-L1181)).
- **`Sale.paymentState`, `paidAmountTnd` and `remainingDueTnd` are written once at posting and never again.** There is no `sale.update` anywhere in `backend/src`. The same holds for `DistributorSale` and `DistributorSettlement` ([distribution.service.ts:357-361, 820-822](../backend/src/modules/distribution/distribution.service.ts#L357-L361)). Consequences, all visible today:
  - `/caisse/ventes` "Payé / Reste / État" and the `paymentState` filter show posting-time values.
  - Customer detail "Ventes" tab: pill from the stale `paymentState` beside a ledger-computed "Reste" (can read "Non payé" with Reste 0,000).
  - Home "crédit" and session "crédit accordé" sum the stale `remainingDueTnd`.
  - Distributor detail shows the stale pill beside a ledger "Reste" ([DistributorDetailPage.tsx:247-253](../frontend/src/features/distribution/pages/DistributorDetailPage.tsx#L247-L253)).
- Purchases are the exception: `derivePaymentState` recomputes `PAID / PARTIALLY_PAID / UNPAID / OVERDUE / CANCELLED` from the ledger at read time ([procurement.service.ts:1734-1758](../backend/src/modules/procurement/procurement.service.ts#L1734-L1758)). But the `dueState` filter in `listPurchases` still uses the stored `paymentTerms` + `dueDate` ([procurement.service.ts:302-311](../backend/src/modules/procurement/procurement.service.ts#L302-L311)), so a purchase paid off later still appears under "En retard".

### The allocation rule differs between the dialogs and the server

- All three frontend schemas allow a partial allocation ("le reste restera non affecté"): [customers.schemas.ts:59-76](../frontend/src/features/customers/customers.schemas.ts#L59-L76), `procurement.schemas.ts:148-178`, `distribution.schemas.ts:222-250`.
- All three services reject any allocation set whose sum differs from the amount with `PAYMENT_ALLOCATION_TOTAL_MISMATCH` ([customers.service.ts:738-744](../backend/src/modules/customers/customers.service.ts#L738-L744), `procurement.service.ts:1580`, `distribution.service.ts:1955-1964`). A user who allocates part of a payment gets a server error banner. The msw mocks do not enforce the rule, so the frontend tests pass.
- With no allocation at all, the payment reduces only the party's global balance; the per-document balances stay open, so those documents keep showing "Reste > 0" forever and can later be over-allocated: the sum of per-document balances can exceed the global balance, and the global cap blocks the payment the user is trying to make.

### Other integrity gaps

- Overpayment race: balance read then insert under ReadCommitted with no row lock ([idempotency.ts:13](../backend/src/shared/idempotency.ts#L13)); two concurrent payments with different keys can both pass (`OD-009` / `OD-010` say reject). Orders and dispatches lock with `FOR UPDATE`; payments do not.
- `cancelPurchase` reverses the initial payment only, not later allocated supplier payments, and takes `payments[0]` for the reversal reference ([procurement.service.ts:741-767](../backend/src/modules/procurement/procurement.service.ts#L741-L767)); cancelling a purchase paid later leaves a negative purchase balance.
- Distributor `validateAllocations` does not check that the target sale/settlement exists and is POSTED; it relies on a positive ledger balance only ([distribution.service.ts:1910-2020](../backend/src/modules/distribution/distribution.service.ts#L1910-L2020)).
- No reversal command for any payment (customer, supplier, distributor); `PAYMENT_REVERSAL` is only written by purchase cancellation.
- The dialogs only offer the first 50 open documents (statement page or `pageSize: 50`).
- `SupplierPayment.purchaseId` is set only when there is exactly one allocation (redundant with the allocation table; harmless).
- Wording differs: "Encaisser un règlement" (clients), "Payer" / "Nouveau paiement" (fournisseurs), "Nouveau paiement" (distributeurs).

## Proposed change

### PR 1 · `fix/payments-document-state` (backend, one migration for indexes only)

Design principle (`GOV-006`): the ledger is authoritative; the document's `paidAmountTnd` / `remainingDueTnd` / `paymentState` are projections and must be updated in the same transaction as every ledger write that carries the document id. One shared helper per party module, `refreshDocumentPaymentProjection(tx, documentId)`, recomputes `paidApplied = total − ledgerBalance(documentId)` and stores the three fields; it is called after a payment allocation, after a payment reversal, and after cancellation (issue 004). Read paths keep reading the stored fields, which are now correct, so lists stay fast.

1. **Allocation rule, all three parties:** the server auto-allocates. When the client sends no allocation, or a partial one, the remainder is applied oldest-first (FIFO by `soldAt` / `postedAt`) to that party's open POSTED documents, until the amount is exhausted; only an amount that exceeds every open document balance is stored unallocated (and only when explicit credit is enabled, otherwise it is an overpayment already rejected). Explicit allocations from the dialog are honoured first. `PAYMENT_ALLOCATION_TOTAL_MISMATCH` disappears; a new `PAYMENT_ALLOCATION_EXCEEDS_AMOUNT` covers the case where allocations exceed the amount. Response returns the final allocations so the dialog can show "Affecté à VT-000012 (15,000), VT-000015 (5,000)".
2. **Projection sync:** customer payment → refresh each allocated `Sale`; distributor payment → refresh each `DistributorSale` / `DistributorSettlement`; supplier payment → keep the derived state but fix `listPurchases` `dueState` to use the ledger balance (or store the projection on `Purchase` too, for one consistent pattern; proposed: store it, and keep `derivePaymentState` only for `OVERDUE` which depends on the date).
3. **Lock the party balance:** `SELECT … FOR UPDATE` on the party row (Customer / Supplier / Distributor) at the start of the payment transaction so two payments serialize; PostgreSQL concurrency test in CI (two concurrent payments that together exceed the balance: exactly one succeeds).
4. **Refuse payments on inactive parties** and on non-POSTED documents (explicit check in distribution).
5. **Payment reversal command** for the three parties: `POST /customer-payments/:id/reverse` (and supplier, distributor), permission `*_payments.create` for now (or a new `*_payments.reverse`, owner decision), reason required, writes `PAYMENT_REVERSAL` entries per allocation, marks the payment `reversedAt`, refreshes the projections, and when the payment was collected at the till requires an open session and records the cash leaving (reuses the REFUND mechanism from issue 004 or a `reversedInSessionId`). This is what lets issue 004 cancel a sale that already received règlements, and what fixes `cancelPurchase` (reverse every allocated payment, not `payments[0]`).
6. Indexes: `CustomerPaymentAllocation (saleId)`, `SupplierPaymentAllocation (purchaseId)`, `DistributorPaymentAllocation (saleId)`, `(settlementId)`, `CustomerPayment (customerId, paidAt)`.
7. Backfill script (`backend/src/scripts/`) that runs the projection refresh over every existing POSTED sale and distributor document once, logged, idempotent, run against the shared development database through the controlled command after review.

### PR 2 · `fix/payments-dialog-ux` (frontend)

One shared `PartyPaymentDialog` pattern for the three parties (same title scheme "Encaisser un règlement" for money received, "Régler un fournisseur" for money paid):

- Amount with `PaymentBox` (no payment mode, per issue 003), ceiling = party balance.
- Allocation table (`AllocationTable`) listing **all** open documents (server-paginated combobox or "Afficher plus"), oldest first, each with reference, date, total, reste, and an amount input; a "Répartir automatiquement" button fills FIFO from the amount; the footer shows "Affecté X / Montant Y" and a red "Non affecté" only when Y > X, with the hint changed to "Le reste sera affecté automatiquement aux documents les plus anciens".
- When opened from a document (sale row action "Encaisser le reste", purchase row "Payer", distributor document row), the dialog is pre-filled with that single allocation, amount = its reste, amount capped at min(document reste, party balance).
- After success: toast with the allocations, the document rows update in place (`customer.payment`, `procurement.payment`, `distribution.payment` invalidation events already exist).
- Same labels in the three modules; ledger label maps fixed (issue 006 item).

### Tests

- Backend, per party: allocation FIFO; explicit + auto mix; projection fields after one and two payments (UNPAID → PARTIALLY_PAID → PAID); reversal restores the state; overpayment; inactive party; concurrency (CI); `listPurchases` due filter after a late payment; `cancelPurchase` with a later payment.
- Frontend: the three dialogs against updated msw handlers that enforce the server rules (auto-allocation, exceeds-amount) so the mock cannot hide a rule mismatch again; pre-filled single-document flow; the e2e `procurement.spec.ts` and `distribution.spec.ts` allocation steps updated.

## Acceptance criteria

- After any règlement, the paid document(s) show the new `Payé`, `Reste` and `État` everywhere they are listed (Ventes list, sale detail, customer Ventes tab, home crédit, distributor detail, purchases list), and the party balance drops by exactly the amount.
- A payment can never leave a document's reste negative, never exceed the party balance, and two concurrent payments cannot together exceed it.
- Sum of per-document restes for a party equals the party's balance at all times (invariant test on the seeded data).
- Reversing a payment restores the documents and the balance to their previous state and leaves a visible audit trail; nothing is deleted.

## Open decisions to surface

- Auto-allocation FIFO for unallocated remainders (proposed) versus keeping unallocated payments as a customer credit line (`OD-009` / `OD-010` currently reject credit; FIFO is consistent with them).
- Payment reversal permission: reuse `*_payments.create` or add `*_payments.reverse`.
- Whether to store the projection on `Purchase` (proposed) or keep deriving it.
