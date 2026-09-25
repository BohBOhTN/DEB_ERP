# 006 · Clients: KPIs on the customer page, delete/deactivate action, detail gaps

| Field            | Value                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Module           | `frontend/src/features/customers`, `backend/src/modules/customers`                                                                     |
| Type             | Feature + fixes                                                                                                                        |
| Priority         | Medium (payment linking, the bigger part of the owner's request, is issue 007)                                                         |
| Depends on       | 007 for correct "paid / due" figures per sale                                                                                          |
| Suggested branch | `feat/clients-kpis-and-actions`                                                                                                        |
| Related          | source of truth §13 (`CUS-004` deactivation, `CUS-005`, `CUS-011`), §1 rule "posted records are not hard-deleted", `OD-004`, spec §4.4 |

## Owner's request

> Add an action for deleting the client. Inside the clients page add KPIs: number of orders (without the cancelled ones), sales, amount paid, amount due.

## Findings

### Delete

- There is no delete or deactivate endpoint and no `customers.delete` permission ([customers.routes.ts](../backend/src/modules/customers/customers.routes.ts), [permissions.ts:139-141](../backend/src/modules/access/permissions.ts#L139-L141)). `PATCH /customers/:id` accepts `isActive: false` ([customers.service.ts:204](../backend/src/modules/customers/customers.service.ts#L204)) but no UI sends it; `CustomerFormDialog` has no active switch.
- `Customer` has `isActive` and `version` but no `archivedAt` / `deletedAt` ([schema.prisma:520-545](../backend/prisma/schema.prisma#L520-L545)). Sales, orders, payments and ledger entries reference the customer, so a hard delete would either fail on the foreign keys or destroy posted history, which the source of truth forbids (§1 rule 10, `CUS-004` "deactivation prevents new credit operations while preserving history").
- The backend does not stop a payment or a credit sale for an inactive customer ([customers.service.ts:566-578](../backend/src/modules/customers/customers.service.ts#L566-L578) has no `isActive` check).

### KPIs

- The detail page shows two numbers only: "Reste à payer" (receivable ledger sum) and "Avance disponible" ([CustomerDetailPage.tsx:124-156](../frontend/src/features/customers/pages/CustomerDetailPage.tsx#L124-L156)). No order count, sales count, total sold or total paid.
- `GET /customers/:id/statement` ([customers.service.ts:389-502](../backend/src/modules/customers/customers.service.ts#L389-L502)) already loads the customer's posted sales (latest 50), orders, payments and ledger with per-sale ledger balances; `listCustomerBalances` computes `openSaleCount` and `openOrderCount`. Nothing aggregates across all history in SQL.
- The "Ventes" tab is a fake single page (`hasMoreSales` ignored), so customers with more than 50 sales cannot see or allocate to older ones.
- The "Paiement" pill in the Ventes tab reads the stored `sale.paymentState`, which is never updated, so it can show "Non payé" next to "Reste 0,000" (root cause in issue 007).

### Other gaps

- Permission guards: the list page and the detail tabs call `/customer-balances`, the statement and `/customer-payments`, which need `customer_balances.view` / `customer_payments.view`, while the route is guarded by `customers.view` only ([router.tsx:361-368](../frontend/src/app/router.tsx#L361-L368)). A user with `customers.view` alone gets a permission error inside the page instead of a hidden tab.
- Form omits `address` and `taxIdentifier` although the schema and API accept them ([CustomerFormDialog.tsx:76-89](../frontend/src/features/customers/components/CustomerFormDialog.tsx#L76-L89)); the detail shows "Adresse" but never the tax identifier.
- Ledger labels: the frontend maps `CUSTOMER_PAYMENT` / `CUSTOMER_CREDIT` but the backend writes `PAYMENT` and `ORDER_ADVANCE_CREDITED`, so a règlement renders as the raw text "payment" in the Relevé ([customerLabels.ts:19-27](../frontend/src/features/customers/components/customerLabels.ts#L19-L27), [customers.api.ts:72-80](../frontend/src/features/customers/customers.api.ts#L72-L80)).
- `createCustomerPayment` in the API client returns `.payment` only and drops the sibling `allocations` array ([customers.api.ts:225-236](../frontend/src/features/customers/customers.api.ts#L225-L236)).
- `listCustomerBalances` with `sort=balance` groups the whole ledger and pages in memory ([customers.service.ts:244-262](../backend/src/modules/customers/customers.service.ts#L244-L262)); acceptable now, to be watched.
- Missing indexes: `CustomerPayment (customerId, paidAt)`, `Sale (customerId, status, soldAt)`, `CustomerLedgerEntry (customerId, occurredAt)`.

## Proposed change

### Backend

1. **Deactivate instead of delete** (`CUS-004`): `POST /customers/:id/deactivate` and `/reactivate` with a new permission `customers.deactivate` ("Désactiver un client"; decision-log entry + permission migration, default to the manager roles), reason optional, audit event with before/after, version bump. Inactive customers are refused for new credit sales, new orders and new payments with `CUSTOMER_INACTIVE` ("Ce client est désactivé."), and hidden from the POS combobox. A customer with a non-zero receivable or advance cannot be deactivated (`CUSTOMER_HAS_BALANCE`). No hard delete endpoint: a customer with no document at all is rare enough that deactivation covers it; if the owner insists on deletion, allow `DELETE /customers/:id` only when the customer has zero sales, orders, payments and ledger entries, and say so in the confirmation.
2. **`GET /customers/:id/summary`** (permission `customer_balances.view`, optional `from`/`to` from issue 001, default all time): `{ ordersCount (status ≠ CANCELLED), openOrdersCount, salesCount (POSTED), salesTotalTnd, paidTnd, dueTnd, advanceTnd, lastSaleAt, lastPaymentAt }`. `paidTnd` = sale payments + allocated and unallocated règlements + applied advances, from the ledger and payment tables by SQL aggregate; `dueTnd` = receivable ledger sum (must equal the existing "Reste à payer").
3. Ventes tab: a real paginated `GET /customers/:id/sales` (reuse `listSales` with `customerId`, plus the ledger balance per sale) instead of the statement's first 50.
4. Indexes above.

### Frontend

- Detail header: `KpiGrid` with `Commandes` (non-cancelled, with "dont N ouvertes"), `Ventes` (count + total), `Payé`, `Reste à payer` (featured), `Avance disponible`. Bound to the optional period control (issue 001) with "Depuis toujours" as default.
- Row actions on `/clients` and the detail header: `Voir`, `Modifier`, `Encaisser un règlement`, `Désactiver` / `Réactiver` (`ConfirmDialog` explaining that history is kept and no new credit is possible). Inactive customers shown with the existing "Inactif" pill and a filter chip "Actifs" by default.
- Form gains Adresse and Identifiant fiscal; detail shows both.
- Tabs hidden per permission (`Relevé`, `Ventes` need `customer_balances.view`; `Règlements` needs `customer_payments.view`).
- Fix the ledger label map and the `CustomerLedgerEntryType` union to the backend values; add labels for `SALE_REVERSAL` and `PAYMENT_REVERSAL` (issues 004 and 007 will start writing them).
- API client returns `{ payment, allocations }`.

### Tests

- Backend: deactivate/reactivate allowed and denied; refusal with balance; inactive customer refused on payment, order and credit sale; summary equals the ledger for a seeded customer (orders cancelled excluded).
- Frontend: `CustomersPage.test.tsx` gains the deactivate flow, the KPI tiles and the hidden tabs per permission; ledger label test.

## Acceptance criteria

- On a customer page: `Reste à payer` in the KPI row equals the closing balance of the Relevé; `Payé + Reste à payer = Ventes total + advances applied` for the same period.
- Cancelled orders are excluded from the order count; cancelled sales (issue 004) excluded from the sales count.
- Deactivating a customer keeps every sale, order and payment visible and blocks any new credit operation with a French message; a customer with a balance cannot be deactivated.
- No customer record is hard-deleted when it has any document.

## Open decisions to surface

- `customers.deactivate` permission (new, source-of-truth change) and whether a true delete is wanted for document-free customers.
- `OD-004`: opening balances remain out of scope.
