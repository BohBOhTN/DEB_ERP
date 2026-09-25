# Fix #46: Clients, page figures, deactivation, paged sales, form and list actions

## Branches

- Source: `fix/46-clients-kpis-deactivate-detail` (stacked on `fix/44-ventes-kpis-filters-cancel-payment`)
- Target: `dev`

## Scope

Closes issue #46 ([issues/006](../issues/006-clients-kpis-delete-detail.md)):
a customer is deactivated rather than deleted, under a new permission and
only once settled; the customer page carries the four figures the owner
asked for (orders without the cancelled ones, sales, paid, due); the
`Ventes` tab is a real paged list with the state of each sale; the list
gains row actions and an activity filter; the form captures the address
and the tax identifier. Decision `DEC-V2-004` (local decision log) records
the permission and the no-delete choice.

## Summary

- Permission `customers.deactivate` ("Désactiver un client") in the
  catalogue; the Super Admin bootstrap and the seeded `Gérant` receive it.
- `POST /customers/:id/deactivate` and `/reactivate` (optional reason),
  one transaction under the customer's row: refuses a customer already in
  the asked state (`CUSTOMER_ALREADY_ACTIVE`, `CUSTOMER_ALREADY_INACTIVE`)
  and a deactivation while the ledger still carries a receivable or an
  advance (`CUSTOMER_HAS_BALANCE`); bumps the version; audits
  `customer.deactivate` / `customer.reactivate` with before and after. No
  hard delete: posted history stays attached to the customer, and the
  existing refusals keep an inactive customer out of credit sales, orders
  (`ACTIVE_CUSTOMER_REQUIRED`) and règlements (`CUSTOMER_INACTIVE`, #47).
- `GET /customers/:id/summary` (`customer_balances.view`): orders without
  the cancelled ones and how many are open, posted sales with their total
  and the cash they carry, the cancelled sales count, the receivable and
  the advance from the ledger, the last sale and the last règlement.
- `GET /customers/:id/sales` (`customer_balances.view`): every sale of
  the customer, newest first, paged, with the balance the ledger still
  carries per sale, replacing the statement's first fifty.
- `GET /customer-balances` accepts `isActive`; inactive customers sort
  last when no filter is given.
- Indexes `sales (customer_id, status, sold_at)` and
  `customer_ledger_entries (customer_id, occurred_at)`.
- Frontend list: `Statut` select (`Actifs` by default, `Inactifs`,
  `Tous`), an `Inactif` pill, row actions `Voir`, `Modifier`,
  `Encaisser un règlement` (active customers with a balance) and
  `Désactiver` / `Réactiver` behind a confirmation that says history is
  kept and no new credit is possible.
- Frontend detail: `Désactiver` / `Réactiver` in the header with the same
  confirmation, a KPI row `Commandes` (with the open count, "sans les
  annulées"), `Ventes` (count, total, cancelled count), `Payé` (last
  règlement), `Dû` (featured, last sale); the `Ventes` tab reads the paged
  route and shows the state pill of each sale; the `Ventes` and `Relevé`
  tabs need `customer_balances.view` and `Règlements` needs
  `customer_payments.view`, so a user with `customers.view` alone sees the
  orders tab instead of a permission error; the detail shows the tax
  identifier next to the address.
- Form: `Adresse` and `Identifiant fiscal` fields.
- One `salePill` helper shared by the sales list, the receipt and the
  customer page for the feminine state labels.
- Regenerated `types.gen.ts` and `permissionKeys.gen.ts`, as CI checks.

## Out of Scope

- A true delete for document-free customers (`DEC-V2-004` leaves it to the
  owner); the period control on the figures (all time for now, the
  shared filter of #41 can be bound later).
- `OD-004` opening balances.

## Verification

Run locally on macOS, Node 24, on the stacked branch:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 358 passed, 10 skipped (49 files);
  new: deactivate a settled customer, refuse one with a balance, reactivate
  and refuse the repeat; the figures exclude cancelled orders and count
  posted sales with what is due; the sales page carries the ledger balance;
  routes allowed with `customers.deactivate` and refused with
  `customers.update` alone; figures and sales under
  `customer_balances.view`; the activity filter on the balances; OpenAPI
  catalogue covering the four new operations
- `npm run test --workspace frontend`: 213 passed (90 files); new in
  `CustomersPage.test.tsx`: the four tiles with the cancelled order left
  out and the `Ventes` tab with the state, the refused deactivation of a
  debtor ("Solde en cours", customer still active); from the list, a
  settled customer deactivated behind the confirmation, gone from
  `Actifs`, found as `Inactif` under `Inactifs` with `Réactiver` and no
  `Encaisser` action; the address saved from the form
- `npm run build`: passed; initial JavaScript 200.4 kB gzip against the
  250 kB budget; POS chunk 13.1 kB
- Playwright on the system Brave browser (`E2E_BROWSER`), the customers
  and orders flow, the shell flow and the axe scans at three widths: 97
  passed, 2 skipped by design

## Database and Migration Impact

One additive migration, `20260925110000_customer_queries_indexes`: two
indexes. The permission row is inserted by the catalogue sync at boot.

## Environment Impact

None.

## Risks and Follow-Up

- The new permission must be granted to the roles that should deactivate
  customers on the shared development database (the Super Admin and the
  demo `Gérant` get it automatically).
- `paidTnd` on the figures is the sum of `paidAmountTnd` on posted sales,
  which #47 keeps in step with the ledger; a customer whose sales were
  posted before the #47 backfill shows the backfilled value.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue #46
- [ ] Target branch is `dev`
