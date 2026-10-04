# Feature 014: Analyses, an analytics module on the recorded history, and the till sessions made findable

## Branches

- Source: `feat/analytics-module`
- Target: `dev`

## Scope

Closes issue 014 ([issues/014](../issues/014-analyses-et-sessions.md)): the
owner asked for charts and insights on the data the application already
collects, "like the frequency of sales and orders" seen on Aegis, and for a
section that lists the till sessions with the details of each one.

The source of truth deferred "advanced dashboards" and `OD-V2-001` keeps
`Accueil` operational. The request lifts that deferral for a read-only
module of its own; it is recorded as `DEC-V2-006` in the decision log.
`Accueil` is unchanged.

## Summary

- **Permission.** `analytics.view` ("Voir les analyses") guards the module.
  The Super Admin receives it at boot; any other role gets it from the
  role editor. A block that belongs to another permission needs that one
  too: expenses (`expenses.view`), approximate margin (`margin.view`),
  order pickups (`orders.view`), the customer analysis (`customers.view`).
- **API** (`backend/src/modules/analytics`, read-only, no new table, no
  migration). Every endpoint takes `from` and `to` as business days in
  Tunis, defaults to the last thirty days, refuses a reversed period and
  more than 366 days with a French field error, and reads posted documents
  only. Every figure is a SQL aggregate; days and hours are read in
  `Africa/Tunis`.
  - `GET /analytics/overview`: revenue by channel (comptoir, commandes,
    distributeurs), till sales, average basket, still due, expenses with
    their categories and the approximate margin, each with the previous
    period of equal length; a trend per day with the previous period
    aligned by rank (per month above 92 days); the best day.
  - `GET /analytics/frequency`: sales by weekday and hour, the seven
    weekdays with their average per occurrence in the period, the
    twenty-four hours, the busiest slot; the same for order pickups by
    requested time.
  - `GET /analytics/products`: per product over the three channels, the
    quantity, the number of documents (how often it sells), the revenue,
    the last sale and the approximate margin on costed till lines
    (`DEC-V2-005`); revenue by category; the active products that did not
    sell.
  - `GET /analytics/customers`: identified against anonymous sales,
    active, new (first purchase ever in the period) and returning
    customers, the ten best, and the customers to win back (no purchase
    for 60 days, ranked by lifetime revenue).
  - The approximate-margin query of `Accueil` moved to
    `shared/marginFigures.ts`; both services use it.
- **Sessions API.** `GET /pos/sessions/summary` (the list's filters):
  sessions by state, their sales, shortages and surpluses apart.
  `GET /pos/sessions/{id}` gains `insights`: average basket, cancelled
  sales, sales by Tunis hour, the five best products.
- **Patterns.** `Heatmap` (a grid on five heat tokens; one tab stop and the
  arrow keys; every cell labelled with its figures; a readout line) and
  `TrendChart` (line and area with a dashed comparison series; a readout
  on hover and through a hidden range input for the keyboard). Both
  hand-rolled SVG and CSS on the tokens, no chart library. `PeriodFilter`
  takes a preset list; `periodRange` gains `last30`, `last90` and `year`.
- **`/analyses`.** Period and tab in the URL. `Vue d'ensemble` (six KPI
  tiles against the previous period, the trend, channels, expenses by
  category), `Fréquence` (sales or order pickups, count or amount: three
  insight tiles, the weekday by hour heat map turned on phones, bars per
  weekday and per hour), `Produits` (best sellers, categories, approximate
  margins, the detail per product, the products without a sale), `Clients`
  (segments, best customers, customers to win back). Each tab has its
  loading, empty and error states.
- **Sessions de caisse.** A navigation item of its own (the page existed
  but nothing led to it). The history opens on the month with a KPI row
  and a duration column; a session page shows duration, average basket,
  activity by hour and best products, and says "Reste à encaisser" where
  it said "Crédit accordé" (the figure is what is still due today).
- **Cache.** A new `analytics` root on the `list` tier, refreshed by the
  writes that change its figures; a sale or an order completion now also
  refreshes the session history, which prints each session's sales.

## Out of Scope

- Forecasting, scheduled or e-mailed reports, exports.
- Distributor sell-through and returns per distributor and product, and
  raw-material purchase prices over time: next steps of issue 014 on the
  owner's word.
- A margin on distributor documents (`DEC-V2-005` keeps it on till lines).
- A separate permission for the session history (still `pos.access`).

## Verification

Run locally on macOS, Node 24, on 2026-10-04:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings (stylelint included)
- `npm run typecheck`: passed, backend and frontend (contract, API types
  and permission keys regenerated; `openapi:check` up to date)
- `npm run test --workspace backend`: 408 passed, 16 skipped (57 files,
  the six database-backed suites skipped here). New: the period rules
  (default window, single bound, Tunis bounds, month buckets, reversed and
  too long periods); the service shaping on doubles (channels, comparison
  window aligned by rank, zero-filled buckets, monthly trend, blocks left
  out without their permission, weekday averages over occurrences,
  busiest slot, product margins hidden without `margin.view`, customer
  segments); the routes (401, 403 on each endpoint without
  `analytics.view`, 403 on customers without `customers.view`, 400 on a
  malformed, reversed or too long period); the session totals and
  insights; the authorization matrix and the OpenAPI coverage with the new
  routes
- `npm run test --workspace frontend`: 269 passed (98 files). New:
  `Heatmap` (grid roles, heat levels, one tab stop, arrow keys, readout),
  `TrendChart` (legend, scale, readout through the scrubber, no
  comparison), the period presets, the formatting helpers, the page on
  each tab with MSW (figures and deltas, hidden blocks, empty period, too
  long period without a request, retryable error, refusal without the
  permission, orders and amounts in the URL, the grid turned at 360 px,
  browser paging of the product table, the customers tab not offered
  without `customers.view`), the navigation manifest, the invalidation
  map, the session history totals and the session insights
- `npm run build`: passed; 201.4 kB gzip initial against 250 kB (the page
  is its own lazy chunk); POS route 14.3 kB against 120 kB
- Playwright on the system Brave browser (`E2E_BROWSER`), mocked API,
  360, 768 and 1280 px: 141 tests, 138 passed, 3 skipped by design. New:
  `e2e/analytics.spec.ts` (each tab without horizontal page scroll, period
  and tab from the address, the heat map crossed with the arrow keys),
  axe on the four tabs, `Analyses` and `Sessions de caisse` in the shell
  smoke. Two axe runs (`/depenses`, `/distribution/reglements`, phone)
  timed out during the full run while a typecheck ran beside it, and
  passed when run again on their own
- Raw SQL: the fourteen statements the new code issues were captured and
  parsed with the PostgreSQL grammar (`libpg-query`): no error
- Not run here (no local PostgreSQL): the database-backed
  `analytics.service.database.test.ts` (six tests on a history dated March
  2001: Tunis day and hour of a sale posted at 23:30 UTC, cancelled
  documents excluded, channels, distinct documents per product, new and
  returning customers, session totals and insights) and the performance
  suite with the four analytics reads in the 150 ms p95 budget. Both run
  in CI

Fixed on the way, unrelated to the feature: `ExpensesPage.test.tsx`
expected its September fixtures under "Ce mois" and has failed since
1 October; its clock is now pinned like the other dated tests.

## Database and Migration Impact

No migration. One permission row, `analytics.view`, inserted by the
catalogue seed at boot and granted to the Super Admin role at boot.

## Environment Impact

None: no new setting, no new dependency.

## Risks and Follow-Up

- The raw SQL cannot run on this machine (no local PostgreSQL). It was
  parsed here with the PostgreSQL grammar (`libpg-query`, fourteen
  statements, no error) and its columns checked against the migrations;
  its results are proven by `analytics.service.database.test.ts` in CI
  only. The first CI run of this branch is the evidence to read.
- The four reads joined the 150 ms p95 budget of the performance suite on
  its large fixture; the timings are printed in the CI log.
- The product table pages in the browser over the ranked rows the server
  sends: one row per product sold, bounded by the catalogue, not by the
  history.
- A role other than the Super Admin sees `Analyses` only after the
  permission is ticked in `Rôles et autorisations`.
- UX checklist screenshots: waived (owner's decision, automated checks
  replace screenshots): overflow assertions at 360, 768 and 1280 px, axe
  on the four tabs, keyboard flow on the heat map.

## Merge Checklist

- [ ] CI passed, including the database-backed analytics suite and the
      performance suite
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue 014
- [ ] Target branch is `dev`
