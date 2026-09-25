# Changelog

All notable project changes are recorded here.

## [Unreleased]

Release R10 polish, operations and launch, targeting `v2.0.0`.

### Added

- Issue #48, Produits and Accueil: an approximate cost per product (per
  base unit, ingredients only) behind the new `margin.view` permission,
  the margin per product on the list and the page, the cost snapshotted
  on every sold line at posting, and a `Marge approximative` tile on
  Accueil over the day's costed sales.
- Sprint 27 polish: a command palette (`Ctrl+K` / `⌘K`) over the
  navigation, the actions and a search of customers, products and
  suppliers; a print stylesheet with `Imprimer` on the three statements;
  line-art illustrations for empty states and the 404 page; a web manifest;
  a WebP logo; page preload on navigation hover.
- Sprint 27 quality suites: a tablet width for the browser flows, an axe
  audit over every route, a Lighthouse runner with thresholds, and a demo
  replay against the real API on a seeded database, run by a new CI job.
- Sprint 27 demo seed (`npm run demo:seed`): the synthetic French bakery
  of the stakeholder script, built through the services, with a guarded
  reset.

### Changed

- Sprint 28 server-state cache: four named tiers (reference, list,
  document, live) replace the uniform thirty-second staleness; units,
  categories, expense categories, the permission catalogue and roles are
  read once per session and refreshed only after their own change; every
  mutation raises a domain event and one typed map decides which queries
  refresh; reference data is warmed when the session opens.

### Fixed

- Issue #42, Accueil: the expenses tile reads the selected business day
  ("Dépenses du jour" / "Dépenses d'hier") instead of the calendar month
  in UTC; every daily tile follows the `Aujourd'hui` / `Hier` control;
  "Encaissé en espèces" uses the drawer formula with advances and till
  règlements; the balance tiles say they are current; the empty hint shows
  only on a fresh database; quick actions open the creation pages.
- Issue #46, Clients: a customer is deactivated and reactivated under the
  new `customers.deactivate` permission, never deleted, and only once
  settled; the customer page shows orders without the cancelled ones,
  sales, paid and due, and pages the customer's sales with their state;
  the list has an activity filter and row actions; the form captures the
  address and the tax identifier; tabs follow the viewer's permissions.
- Issue #44, Ventes: a KPI row, the period filter, a search and a status
  filter on the sales list; a sale can be cancelled under the new
  `pos.cancel_sale` permission with its stock, receivable and cash
  reversed and a reason kept; the remainder of a credit sale is collected
  from its row through the customer's règlement dialog; the receipt lists
  every movement of money and the order it came from; customer ledger
  labels match the backend's entry types.
- Issue #45, Commandes: a KPI row, the period filter and a search on the
  queue, the detail page's actions on every row, `Avance` and `Reste`
  stated by the API for every state; a completion now always states the
  amount paid (an empty amount was recorded as paid in full); the
  "Aujourd'hui" and "À venir" queues no longer return the same rows; the
  deposit is capped inline, worded as a deposit and gated like its route;
  the order editor shows the catalogue price instead of an ignored field.
- Issue #41, one period filter: `Aujourd'hui` (default), `Hier`,
  `Cette semaine`, `Ce mois` or a custom date or range, kept in the URL,
  on the sales, session, movement, audit and expense lists.
- Issue #43, Caisse: the whole product card adds the product; the cashier
  stays on the till after a sale with a `Voir` action on the toast; the
  payment method control is gone (cash only); Enter on a focused tile
  activates that tile; emptying a cart of several lines asks first; a
  cashier without `pos.credit_sale` can post a fully paid sale.
- Issue #47, règlements tied to documents: a payment settles the party's
  open documents (explicit allocations first, the remainder oldest first),
  sales, distributor sales, settlements and purchases keep `Payé`, `Reste`
  and `État` in step with the ledger, two concurrent payments can no longer
  overpay a balance, an inactive party is refused, a purchase cancelled
  after a later payment reverses every payment applied to it, and a
  customer, supplier or distributor payment can be reversed with a reason
  from its list (a till règlement leaves the drawer of the open session).
  The allocation table splits the amount automatically and the payment
  toast names the documents settled.
- Found by the seeded demo replay: the palette hid server results; a
  cashier without the balances permission could not pick a customer for an
  order; the customer and supplier payment dialogs failed after a successful
  payment; the demo seed priced purchase lines per entered unit and recorded
  order advances without an open till; the reference warm-up requested
  catalogues the user could not read.
- The seeded demo job runs on demand only (`demo.yml`) so it never blocks
  a pull request.
- Placeholder text met the 4.5:1 contrast ratio and the password toggle
  became reachable by assistive technology (axe findings).

## [1.4.0] - 2026-09-24

Release R9 module redesign wave 2 (Sprints 23 to 26), untagged by owner
decision.

### Added

- The till rebuilt on the kit (Sprint 23): session open and close with the
  counted-cash dialog and the live difference, a product grid with search
  and category chips, an in-memory cart with a sticky total and a bottom
  sheet on phones, the customer picker, the direct sale or order toggle,
  the payment box with change and the credit rule, one confirmation with
  one idempotency key per cart intent, the receipt view, the sales list
  and the session history with totals; desktop keyboard shortcuts.
- Distribution rebuilt on the kit (Sprint 24): distributor directory with
  custody and balance, distributor detail with five tabs, the custody board
  by distributor with discrepancy badges, a dispatch editor, a settlement
  workspace whose four quantities per line must reconcile before posting,
  a direct sale dialog and distributor payments with allocations; an
  `Accordion` pattern and a price-less mode of the line editor.
- Expenses and cost simulation rebuilt on the kit (Sprint 25): a monthly
  expenses report with the total, the top categories and the day by day
  line, the table with its dialogs, immediate posting and cancellation
  with a reason, the categories page; simulations with a line editor of
  catalogue or free ingredients, live line and unit costs, an indicative
  margin, duplication, edition and deletion, and the statement that
  nothing touches stock or accounting.
- Users, roles, audit and settings rebuilt on the kit (Sprint 26): a
  users table with role chips, creation with a generated temporary
  password, role assignment, password reset and activation with the
  last-Super-Admin refusal explained; a roles master-detail with the
  permission matrix grouped by module in French, search, select-all per
  group, a sticky save bar and an unsaved-changes guard; the audit journal
  with French labels, URL filters, target links and an event sheet with
  the before / after diff and a copyable correlation id; a settings page
  with the profile, the application identity and the build.
- Backend: expense categories carry their expense count.
- Backend: distributor rows carry their balance and held lines; balance
  rows carry the last payment date.
- Backend: POS sessions and sales carry the actors' display names; session
  rows carry their sales count and total.

### Removed

- The V1 POS screen and its API client.
- The V1 distribution screen and its API client.
- The V1 expenses and simulation screens and their API clients.
- The last V1 frontend files (Sprint 26): the access and audit screens and
  their API clients, the V1 stylesheet, the legacy screen wrapper and its
  "Ancienne interface" badge, the health service, the V1 auth and catalogue
  API shims, and the CSS prefixing build step.

## [1.3.0] - 2026-09-23

Release R8 module redesign wave 1 (Sprints 20 to 22), untagged by owner
decision.

### Added

- Catalogue and stock rebuilt on the kit (Sprint 20): product, raw
  material, category and unit lists with search, filters and sort in the
  URL, creation and edition dialogs with version conflict handling,
  activation with impact, product and raw material detail pages with stock,
  movements, history and purchases tabs; stock balances with the negative
  banner and filter, movements with French labels and document references,
  opening stock and adjustments through an item picker with an impact
  confirmation.
- Procurement rebuilt on the kit (Sprint 21): supplier directory with the
  amount owed and open purchases, supplier detail with the balance, the
  Achats, Relevé and Paiements tabs and a cursor-paged statement; purchase
  list with paid, remaining and overdue columns and filters in the URL; a
  full-page purchase editor with unit conversions, payment terms, the due
  date rule and a posting confirmation stating the stock, payable and
  payment impact; purchase detail with cancellation by reason; supplier
  payments with allocations across open purchases and the unallocated
  remainder live.
- Customers and orders rebuilt on the kit (Sprint 22): customer directory
  with receivable, advance and open orders, customer detail with two big
  numbers and the Ventes, Commandes, Relevé and Règlements tabs, a payment
  dialog with the till switch and allocations across open sales; an order
  board with six queues, a full-page editor with an advance taken at the
  open till, and an order detail whose action bar shows only the permitted
  transitions, with completion and cancellation dialogs stating their
  impact; `AllocationTable` generalised into the pattern kit.
- Backend: customer balance rows carry the open order count; order rows
  carry the line count.
- Backend: a draft purchase can be replaced before posting
  (`PATCH /procurement/purchases/{id}`); purchase rows carry their ledger
  balance and payment state; supplier balance rows carry the reference and
  total of each open purchase.
- Backend: balances report the unit symbol and the last movement date;
  movements report the actor and the source document reference; the product
  list filters by category and stockability and sorts by price and status;
  the purchase list filters by raw material.

### Removed

- The V1 catalogue and inventory screens and the inventory API client.
- The V1 procurement screen and its API client.
- The V1 customer and order screens (their API files remain as shims for
  the V1 POS screen until Sprint 23).

## [1.2.0] - 2026-09-23

Release R7 design system and application shell (Sprints 18 and 19),
untagged by owner decision.

### Added

- New application shell (Sprint 19): router with French paths and lazy
  route groups, permission guards, session bootstrap with a brand splash,
  401 and 403 handling, an expiry warning ten minutes before the fixed
  session end, the brand login page, the sidebar with a collapsible rail,
  the top bar with breadcrumbs and user menu, the phone bottom navigation
  with a `Plus` sheet, and the `Accueil` home page with live figures,
  alerts, quick actions, recent activity and the month's expenses.
- Every V1 screen is mounted unchanged inside the new shell at its new path,
  flagged "Ancienne interface"; its stylesheet is scoped to that wrapper by
  the build.
- `GET /api/v1/auth/me` and the login response now carry the user's role
  names and the session expiry.
- Playwright smoke at 360 px and 1280 px (login, every module, logout)
  against the dev server with the API mocked in the browser, run in CI.
- Frontend design system as code: brand and semantic tokens in
  `src/styles/tokens.css`, reset and base styles, Inter and Fraunces
  fonts, favicons and theme colour.
- Thirty-four primitives under `src/components/ui` and twenty-one patterns
  under `src/components/patterns`, each with a CSS module, tests and a
  gallery example; the gallery is served at `/_kit` in development only.
- Frontend libraries: `/api/v1` client with envelope unwrapping and
  French error copy, pagination helpers, permission-key union generated from
  the backend catalogue (`npm run api:permissions`), shared zod form
  helpers, hooks (debounce, media query, breakpoint, URL state, confirm), the
  French dictionary and money, quantity and date formatters.
- Test infrastructure: msw server with auth and catalogue handlers, fixture
  factories, and a viewport helper.
- Lint and build gates: `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`,
  `stylelint` with `color-no-hex` outside `tokens.css`, vendor chunking, a
  bundle report and a bundle-size budget check in the frontend build.

## [1.1.0] - 2026-09-22

Release R6 platform hardening and API contract (Sprints 15 to 17). Backend
only; the V1 frontend keeps working on the `/api` prefix. See
`RELEASE_v1.1.0.md` for the evidence and the gate status.

### Added

- `/api/v1` prefix for every route, with a version-aware envelope: on
  `/api/v1` a collection is `data: { items, page, pageSize, total, pageCount }`;
  the legacy `/api` prefix keeps its shapes and answers with
  `Deprecation: true`.
- One list contract: `q` (alias of `search`), `sort=field:asc|desc` from a
  per-list whitelist, and `from`/`to` read as business days in
  `Africa/Tunis`.
- Detail endpoints for customers, suppliers, purchases, distributors,
  expenses, products, raw materials, users, roles and POS sales; POS session
  history with per-session totals.
- `GET /api/v1/home/summary`: an operational summary computed by the database
  with one block per permission held.
- Document references: sales are numbered `VT-000001` and posted purchases
  `AC-000001` from database sequences.
- Stock movement filters by item, movement type, source and date range.
- French labels and target module on audit events and labelled filter options.
- Access API: permission catalogue grouped by module with French labels,
  paginated and filterable users, role permission and user counts, user
  display-name and e-mail update under optimistic concurrency, and an
  administrator password reset that ends the sessions of the target.
- OpenAPI 3.0 document generated from the Zod route schemas, committed as
  `backend/openapi.json`, served at `/api/v1/openapi.json` outside
  production, and checked for staleness in CI; generated frontend types in
  `frontend/src/lib/api/types.gen.ts`.
- Query and trigram indexes for the predicates the lists actually use, with a
  CI drift guard for the database objects Prisma cannot express.
- Balance lists accept `search`, `sort=name|balance` and `minBalance`;
  statements page ledger entries by cursor and report opening and closing
  balances for a date range.
- A performance integration suite with a synthetic large history and a
  latency budget.
- Slow-query logging and documented pool settings.
- Structured request and error logging (pino) keyed by correlation id.
- Liveness and readiness probes under `/api/v1/health` with build version,
  git sha and latest applied migration; `/api/health` remains as an alias.
- `Idempotency-Replayed: true` header on replayed posting commands.
- Cleanup job for expired idempotency records and sessions.
- Global per-client rate limit, gzip compression, request timeouts, graceful
  shutdown with forced exit, and `trust proxy` configuration.

### Removed

- The V1 shell (`ProtectedShell.tsx`) and login form, replaced by the new
  shell and login page.

### Changed

- The stock movement source is the closed enum `InventorySourceType`, and
  the five payment-method enums are one `PaymentMethod`.
- The permission catalogue carries accented module names and short French
  labels; `users.reset_password` is a new key held by the Super Admin.
- Customer, supplier and distributor balances, statements, custody, POS
  session close and expense totals are aggregated by the database instead of
  summing ledger rows in JavaScript.
- Expense totals default to the last thirty days and bucket days in the
  `Africa/Tunis` time zone.
- POS product search matches the accent-stripped name, like the back office.
- Effective permissions are cached per process for one minute and invalidated
  on every role, permission and user-role change; a session's last-used
  timestamp is written at most every five minutes; reading the permission
  catalogue no longer re-seeds it.
- List endpoints return document headers only: sales and orders lists no
  longer embed lines and payments, purchases lists no longer embed payments,
  stock movements no longer join item and unit rows.
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
