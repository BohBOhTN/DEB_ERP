# Fix #47: Règlements tied to documents

## Branches

- Source: `fix/47-payments-document-state` (stacked on `docs/issue-briefs`, which adds `issues/`)
- Target: `dev`

## Scope

Closes issue #47 ([issues/007](../issues/007-reglements-lies-aux-documents.md)):
every payment settles documents, every receivable document keeps its paid
state in step with the ledger, and a payment recorded by mistake can be
reversed. Customers, suppliers and distributors get the same treatment,
through one shared allocation planner and one shared paid-state projection.

## Problem

The backend already linked a règlement to sales through allocations, but
the `Sale` row was never touched afterwards: `Payé`, `Reste` and `État` on
`/caisse/ventes`, the sale detail, the customer's `Ventes` tab and the home
`crédit` figure kept their posting-time values forever. Distributor sales and
settlements had the same defect. The three payment dialogs let the user
allocate part of the amount while the three services refused any allocation
set that did not equal the amount, and a payment recorded without any
allocation left every document open although the party's balance had
dropped. Two concurrent payments could together overpay a balance; a purchase
cancelled after a later payment reversed only the payment taken at posting;
`Achats` still listed a purchase paid off later under `En retard`; nothing
could undo a wrong payment.

## Summary

- `shared/paymentAllocation.ts`: one planner for the three parties.
  Explicit allocations are honoured first and validated (no duplicate, each
  at most the document balance, together at most the amount:
  `PAYMENT_ALLOCATION_EXCEEDS_AMOUNT`); the remainder is placed on the open
  documents oldest first; only what exceeds every open balance stays
  unallocated. `shared/paymentState.ts`: the paid state rule and the
  projection (`paidAmountTnd`, `remainingDueTnd`, `paymentState`) a document
  stores from its total and its ledger balance (GOV-006). The three local
  copies of `derivePaymentState` are replaced by it.
- Customers, procurement, distribution: the payment command locks the party
  row (`FOR UPDATE`) so two payments serialize, refuses an inactive party
  (`CUSTOMER_INACTIVE`, `SUPPLIER_INACTIVE`, `DISTRIBUTOR_INACTIVE`), plans
  the allocations, writes them and their ledger entries, then rewrites the
  projection of every document touched, in the same transaction. The answer
  carries the final allocations.
- Reversal commands: `POST /customer-payments/:id/reverse`,
  `POST /procurement/supplier-payments/:id/reverse`,
  `POST /distributor-payments/:id/reverse` (idempotency key, reason,
  `*_payments.create`). The payment row stays, marked `reversedAt`,
  `reversedByUserId`, `reversalReason`; `PAYMENT_REVERSAL` entries give the
  amount back to each document; the projections are rewritten; a second
  reversal answers `PAYMENT_ALREADY_REVERSED`. A till règlement can only be
  reversed while a session is open and records `reversedInSessionId`; the
  session's expected cash subtracts it (`customerPaymentReversalsTnd` shown
  on the close dialog and the session page).
- Purchases: `remaining_due_tnd` projection column; `paidAmountTnd` becomes
  the total applied; the `dueState` filter reads the projection instead of
  the entry-time terms; `cancelPurchase` reverses every payment applied to
  the purchase, each against its own payment record.
- Migration `20260924180000_payment_document_state`: the projection column,
  the reversal columns on the three payment tables, `(party, paid_at)`
  indexes, and one-off UPDATEs that rebuild the projections of every posted
  sale, distributor sale, settlement and purchase from the ledger.
- Frontend: the allocation table gains `Répartir automatiquement`, the
  remainder reads `Reste à répartir` with the sentence that it goes to the
  oldest documents, the three dialogs list documents oldest first, accept a
  document id to prefill the amount and its allocation (for the sale and
  purchase row actions of issues #44 and #46), and their toast names the
  documents settled. The three payment lists show `Encaissé` / `Réglé` or
  `Annulé` and offer `Annuler le règlement` / `Annuler le paiement` through
  the shared `ReversePaymentDialog` (reason required, impact stated).
- Mocks: the msw and Playwright handlers now enforce the server rules
  (excess refused, remainder auto-allocated, reversal endpoints, reversed
  payments excluded from balances) so a rule mismatch can no longer hide
  behind a permissive mock.

## Out of Scope

- Cancelling a sale (#44) and the customer, order and sales KPIs (#44, #45,
  #46); they build on the projections landed here.
- A dedicated `*_payments.reverse` permission: reversal reuses
  `*_payments.create` (DEC-V2-002); the owner may split it later.
- Storing unallocated remainders as party credit (`OD-009`, `OD-010` still
  reject overpayment; the planner never needs credit because the amount is
  capped by the party balance).

## Verification

Run locally on macOS, Node 24:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 336 passed, 10 skipped (48 files);
  new: `paymentAllocation.test.ts` (5), `paymentState.test.ts` (2),
  customers (auto-allocation oldest first, partial completion, excess
  refused, inactive customer, reversal restores the sale, till reversal
  needs an open session and records it), procurement (same set plus cancel
  reversing the posting payment and a later one), distribution (same set,
  custody untouched by a reversal), POS (expected cash minus reversed
  règlements), route tests for the three reversal endpoints (allowed and
  denied), OpenAPI catalogue covering the three new operations,
  `operationalViews` aligned with the projection predicate
- `npm run test --workspace frontend`: 202 passed (87 files); new:
  `AllocationTable` auto-fill, customers (a règlement with no allocation
  typed settles VT-000001 by itself, the toast names it, the reversal from
  the `Règlements` tab restores `Reste à payer`), procurement and
  distribution (reversal from the payment lists with a reason, row marked
  `Annulé`), error copy covering every new backend code
- `npm run build`: passed; initial JavaScript 200.1 kB gzip against the
  250 kB budget; POS chunk 11.3 kB
- `npm run e2e --workspace frontend` (Playwright on the system Brave
  browser through `E2E_BROWSER`, mocked API, three widths): 117 passed,
  2 skipped by design, 1 failed: the axe scan of `/roles` at 360 px hit the
  30 s timeout under the parallel load and passed alone in 3.7 s on a
  re-run; unrelated to this change
- PostgreSQL suites (`*.concurrency.test.ts`, integration) run in CI only;
  the development machine has no PostgreSQL. The migration SQL was reviewed
  by hand and validated by `prisma validate`; it has not been applied to a
  database here.

## Database and Migration Impact

One additive migration, `20260924180000_payment_document_state`:
`purchases.remaining_due_tnd`; `reversed_at`, `reversed_by_user_id`,
`reversal_reason` on `customer_payments`, `supplier_payments`,
`distributor_payments`; `customer_payments.reversed_in_session_id` with its
foreign key; three `(party_id, paid_at)` indexes; UPDATE statements that
rebuild the stored paid state of posted sales, distributor sales,
settlements and purchases from their ledger entries. Apply to the shared
development database with the controlled deploy command after review; the
UPDATEs are idempotent.

## Environment Impact

None.

## Risks and Follow-Up

- Historical payments recorded without an allocation stay unallocated in
  the ledger; the documents they paid keep a positive projection until a
  new payment or a reversal touches them. Rewriting history was ruled out
  (rule 04 section 12).
- `Purchase.paidAmountTnd` changes meaning from "paid at posting" to "total
  applied"; the purchase list and detail already labelled it `Payé`.
- The concurrency guarantee (two payments cannot overpay) is proven only by
  the row lock reasoning and the CI PostgreSQL suites; add a dedicated
  concurrency test with the next PostgreSQL run.
- The reversal dialog lists document references when the list endpoint
  provides them (all three now do) and falls back to a generic sentence.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue #47
- [ ] Target branch is `dev`
