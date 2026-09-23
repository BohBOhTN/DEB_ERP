# R8 Sprint 22: Customers and orders

## Branches

- Source: `feature/r8-sprint-22-customers-orders`
- Target: `dev`

## Scope

Release R8 (module redesign wave 1), Sprint 22. Closes `UI-13` and `UI-14`:
the customer directory and detail, the customer payment dialog, the order
queue, the order editor and the order detail with its action bar, all
rebuilt on the kit following the seven-step recipe of the release file.
`AllocationTable` is generalised into the pattern kit and reused by the
supplier and customer payments. The two V1 screens are deleted; the two V1
API files survive as short shims for the V1 POS screen until Sprint 23
replaces it. Two additive backend changes give the lists the counts the
spec names.

## Summary

- Screens rebuilt (07 sections 4.4 and 4.5): `Clients` (`/clients`),
  `Client` detail (`/clients/:id`, tabs Ventes, Commandes, Relevé,
  Règlements), `Commandes` (`/commandes`, status board), `Nouvelle
commande` (`/commandes/nouvelle`, full page), `Commande` detail
  (`/commandes/:id`).
- Components added: `features/customers/{customers.api,customers.queries,customers.schemas}.ts`,
  `pages/*` (two pages), `components/CustomerCombobox` (search by name or
  phone over the balances endpoint, each option shows what is owed and the
  advance), `CustomerFormDialog`, `CustomerPaymentDialog` (on `FormDialog`
  - `PaymentBox` + the kit `AllocationTable`; the `Encaissé à la caisse`
    switch appears only while `GET /pos/sessions/current` returns a session
    and explains that the money joins the open till), `CustomerStatement` (on
    `StatementTable`, receivable running balance, advances listed but kept
    out of the balance, "Charger plus" by cursor);
    `features/orders/{orders.api,orders.queries,orders.schemas}.ts`, `pages/*`
    (three pages), `components/OrderLineEditor` (product search on
    `/pos/products?q`, sale price filled and editable), `AdvanceDialog`
    (`PaymentBox` capped by the remainder), `CompleteOrderDialog` (on
    `ConfirmPostingDialog` with a `PaymentBox` for the remainder and the
    impact: stock, advance applied, receivable, revenue once),
    `CancelOrderDialog` (reason required, `Rembourser` / `Conserver en avoir`
    control when an advance exists), `orderLabels` (French statuses and the
    action bar computed from status and permissions);
    `features/pos/{pos.api,pos.queries}.ts` (current session, product search)
    ahead of the POS sprint; `components/patterns/AllocationTable` with its
    kit example and unit test.
- Order board: `À venir | Aujourd'hui | En retard | Prêtes | Terminées |
Annulées` mapped onto the API's `dueState`, `dueAfter`, `dueBefore` and
  `status`; a table on desktop with the relative label ("dans 2 h"), day
  grouped cards with a sticky day header on phones; soonest due first.
- API endpoints consumed (all under `/api/v1`): `GET
/customers/customer-balances`, `GET/POST/PATCH /customers/customers`,
  `GET .../{id}`, `GET .../{id}/statement` (cursor), `GET/POST
/customers/customer-payments`; `GET/POST /orders/orders`, `GET .../{id}`,
  `POST .../{id}/status`, `POST .../{id}/advances`, `POST .../{id}/complete`,
  `POST .../{id}/cancel`; `GET /pos/sessions/current`, `GET
/pos/products?q`.
- V1 files deleted: `features/customers/CustomerManagement.tsx`,
  `features/orders/OrderManagement.tsx`. `customersApi.ts` (a type
  re-export) and `ordersApi.ts` (one function delegating to the V2 client
  with a fresh idempotency key) remain as shims because the V1 POS screen
  imports them; both go with `PosManagement.tsx` in Sprint 23.
- Backend (additive, no migration): customer balance rows carry
  `openOrderCount` (one `groupBy` on orders awaiting fulfilment for the
  page's customers); order list rows carry `_count.lines`.

### Deliverables by requirement

| ID    | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-13 | Customer list with phone, `Solde dû` in danger tone above zero, `Avance` only when positive, open orders and status; search by name or phone; name or balance sort; creation and edition dialog (nom, téléphone, notes) with `version`; detail with the two big numbers, `Encaisser un règlement`, `Nouvelle commande` (customer preselected), `Modifier`, and the four tabs; payment dialog with the amount against the receivable (overpayment refused inline and by the server), the till switch only while a session is open, one allocation input per open sale with the unallocated remainder live                                                                                |
| UI-14 | Status board with six tabs, table on desktop and day grouped cards on phone, customer and period filters in the URL; full-page editor with customer, future fulfilment time, product lines with the sale price, notes, `TotalsCard` and the `Acompte` input only while a session is open (else "Ouvrez la caisse pour encaisser un acompte"), the advance recorded in the same flow with its own key; detail with summary, lines, advances, linked sale after completion and one action bar showing only the permitted transitions: Confirmer, En préparation, Prête, Encaisser un acompte, Terminer with the remainder and the impact, Annuler with reason and the advance disposition |

## Out of Scope

- Editing a draft order after creation: the API supports `PATCH` but the
  spec names no editor for it; the detail offers cancellation and a new
  order.
- A lines popover on the board's `Lignes` column: the count is shown; the
  lines are one click away on the detail.
- The `Ventes` tab is fed by the statement's sales section (capped at the
  statement limit); a dedicated sales list arrives with the POS sprint.
- A popover calendar on the date inputs (native inputs, as in Sprint 18).

## Verification

Run locally on macOS, Node 24.15.0:

- `npm run format:check`: passed
- `npm run lint` (ESLint with hooks and a11y rules, stylelint): passed,
  zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 307 passed, 10 skipped; the V1
  customer and order route tests remain green with the added counts
- `npm run test --workspace frontend`: 160 passed (74 files), including
  `CustomersPage.test.tsx` (directory without identifiers and creation; the
  AS-013 payment at 360 px allocated to the open sale and taken at the
  till, receivable 30,000 to 15,000; inline and server overpayment refusal),
  `OrdersPage.test.tsx` (AS-009 order for tomorrow with a 20,000 TND advance
  at 360 px; the transitions and AS-010 completion with the remainder,
  linked sale paid in full; AS-012 cancellation with the advance kept as
  credit; the board with the relative label and hidden actions without
  permission) and `AllocationTable.test.tsx`
- `npm run build`: passed; initial JavaScript 195.0 kB gzip against the
  250 kB budget (the customer and order pages are lazy chunks)
- `npm run openapi:check` and `npm run api:types`: in sync (response
  shapes are not described by the schemas, so the document is unchanged)
- `npm run e2e --workspace frontend` (Playwright on the system Brave
  browser): 11 passed, 1 skipped by design, at 360 and 1280 px: the shell
  smoke (`Commandes` and `Clients` now checked by heading, the login
  round-trip moved to `/caisse`), the catalogue and stock, procurement and
  customers and orders flows
- `npm run screen:review --workspace frontend`: login, home, the twelve
  rebuilt routes and one V1 route at 360, 430, 768 and 1280 px, no
  horizontal overflow

Acceptance scenarios:

| ID       | Where                                                                                                                                                                                                                                                                         | Result |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AS-009   | `OrdersPage.test.tsx` and `e2e/customersOrders.spec.ts`: an order for tomorrow with an advance creates no sale; the advance is recorded on the order                                                                                                                          | pass   |
| AS-010   | `OrdersPage.test.tsx` and `e2e/customersOrders.spec.ts`: completion creates one linked sale, applies the advance, the remainder paid leaves nothing due                                                                                                                       | pass   |
| AS-011   | Backend `orders.service.concurrency.test.ts` (unchanged); the UI posts completion once per intent with one idempotency key through `ConfirmPostingDialog`                                                                                                                     | pass   |
| AS-012   | `OrdersPage.test.tsx`: cancellation requires a reason and the explicit refund or credit choice; the store records the disposition                                                                                                                                             | pass   |
| AS-013   | `CustomersPage.test.tsx`: a 15,000 TND payment reduces a 30,000 TND receivable to 15,000 with no revenue; overpayment refused                                                                                                                                                 | pass   |
| AS-V2-17 | `e2e/customersOrders.spec.ts` at 360 and 1280 px: order for tomorrow with a 20,000 TND advance while a session is open, confirmed, then completed paying the remainder; completion dialog states the advance applied; linked sale visible; customer balance unchanged at zero | pass   |

## UX acceptance checklist

Executed for the five screens against `09_UX_ACCEPTANCE_CHECKLIST.md`.
Owner decision: no screenshot images; the automated checks are the
evidence.

| Section                        | Result                                                                                                                                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Layout and responsiveness    | pass: `screen:review` at four widths on the list, board and editor routes; card mode below 600 px on every list; the order board switches to day grouped cards with a sticky header on phones; the editor's totals column stacks under the lines   |
| B Brand and visual consistency | pass: tokens only, `PageHeader` + `FilterBar` + `DataTable` on lists, `Tabs` for the board and the detail, `StatusPill` for order and payment states, `TotalsCard`, `PaymentBox` and `AllocationTable` reused unchanged                            |
| C Copy and localisation        | pass: French with accents; statuses, ledger entry types and dispositions through `orderLabels.ts` and `customerLabels.ts`; no enum, id or key as primary content (asserted on both lists)                                                          |
| D Screen states                | pass: skeleton, background refresh, empty with next action, field and server errors mapped onto the form, denied through the route guard, error with retry, success toast after the server, pending posting non-closable                           |
| E Business safety              | pass: completion and cancellation through `ConfirmPostingDialog` with the impact block; advances and payments posted once with a key per dialog open; the order and its advance carry two keys; cancellation reason required; disposition explicit |
| F Accessibility                | pass: labels on every control (numbered line controls, named allocation inputs, the switch), focus trap in dialogs, radio semantics on the disposition control, board tabs keyboard navigable; `axe` still planned for Sprint 27                   |
| G Performance                  | pass: server pagination and sort on every list; open order and line counts computed by the database per page; the customer picker and the statement share one query per customer                                                                   |

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- The order board's "Aujourd'hui" and "À venir" tabs derive the business
  day boundary in the browser (`Africa/Tunis`, UTC+1); a business-day
  parameter on the orders list would move this to the server.
- The `Ventes` tab relies on the statement's capped sales section until a
  customer-filtered sales list exists on the rebuilt POS.
- `customersApi.ts` and `ordersApi.ts` shims and `catalogApi.ts` survive
  until Sprints 23 and 26 delete their last V1 consumers.
- No `v1.3.0` tag by owner decision (releases stay untagged).

## Merge Checklist

- [ ] CI passed
- [x] No real `.env` files or secrets committed
- [x] Scope matches the sprint
- [x] Screen specs delivered in full (07 sections 4.4 and 4.5)
- [x] `12_SPRINT_STATUS_V2.md` and `CHANGELOG.md` updated
- [x] Target branch is `dev`
