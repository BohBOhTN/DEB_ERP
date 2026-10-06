# Feature 021: Analyses, the purchases by kind and the distributor channel

## Branches

- Source: `feat/021-analyses-achats-distributeurs` (from `feat/020-course-produits-de-revente`)
- Target: `dev`, after pull requests 019 and 020

## Scope

Closes issue 021 ([issues/021](../issues/021-analyses-achats-et-distributeurs.md)):
an analysis of what is bought, in raw materials and in resold products,
and one of the distributor channel, of which the module showed a single
total. Decision `DEC-V2-011`. Third of four stacked branches. Read-only,
no migration.

## Summary

- **`GET /analytics/purchases`** (`analytics.view` and `purchases.view`).
  Posted purchases of the window by purchase date, for their full amount
  whether paid or not; a cancelled purchase is left out. Totals against
  the previous window (all, raw materials, resold products, number of
  purchases), what is still owed on them, a zero-filled trend by kind,
  the suppliers with their split, the raw materials (quantity in base
  unit, amount, average, first and last price, the change between the
  two) and the resold products (bought beside what was sold of them over
  the same window on the three channels, last purchase price, sale price,
  and the unit margin with `margin.view`).
- **`GET /analytics/distributors`** (`analytics.view` and
  `distributors.view`). The channel as the overview counts it: direct
  sales posted plus consignment settlements. Revenue against the previous
  window and its split, the documents, a trend by kind, each distributor
  (revenue, split, documents, quantities sold and returned, return rate,
  last activity, current balance with `distribution.balances.view`), the
  products sold through distributors (quantity, revenue, returns, return
  rate, approximate margin on costed lines with `margin.view`). The
  return rate is what came back over everything settled.
- **Code.** Each analysis is its own file beside the service
  (`purchases.analysis.ts`, `distributors.analysis.ts`); the totals by
  kind live in `shared/purchaseFigures.ts`, which issue 022 reuses.
- **`Analyses`.** Two tabs after `Clients`, each offered with its module's
  permission and kept in the address: `Achats` (four tiles, the trend
  with two series, suppliers as bars, two tables) and `Distributeurs`
  (four tiles, the trend with two series, distributors as bars and a
  table, the products table). The fourth distributor tile is the balance,
  or the return rate when the balances are withheld. Loading, empty and
  error states are the module's.

## Out of Scope

- The KPIs of `Accueil` and `Vue d'ensemble` (issue 022).
- Custody in stock at each distributor today, forecasting, exports.

## Verification

Run locally on macOS, Node 24, on 2026-10-06:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend (contract and API
  types regenerated)
- `npm run test --workspace backend`: 488 passed, 18 skipped (64 files, the six database-backed suites skipped here). New: the shaping of
  both analyses on doubles (kinds, comparison window, zero-filled
  buckets, supplier split, average price and price change, bought beside
  sold, return rates, the figures left out without their permission, an
  empty window); the routes (403 without either permission, the period
  and permissions passed, 400 on a reversed period)
- Raw SQL: the twenty-two statements the two analyses issue, at both
  granularities, were captured and parsed with the PostgreSQL grammar
  (`libpg-query`): no error
- `npm run test --workspace frontend`: 314 passed (100 files). New: each tab with
  MSW (figures, deltas, shares, tables, links, the column hidden without
  its figure, the empty period, the tile that replaces the balances), the
  tabs not offered without their permission
- `npm run build`: passed; 201.9 kB gzip initial against 250 kB (the page stays its own lazy chunk); POS route 14.3 kB against 120 kB
- Playwright on the system Brave browser, mocked API, 360, 768 and
  1280 px: the analyses spec through the six tabs without horizontal page scroll, and axe on the six tabs: 29 passed, 1 skipped by design
- Not run here (no local PostgreSQL): two new cases of
  `analytics.service.database.test.ts` on the March 2001 history (flour
  bought twice at two prices, croissants bought to be resold and sold on
  three channels, a cancelled and an earlier purchase left out; the
  channel with its direct sale and its settlement) and the performance
  suite with the two reads in the 150 ms p95 budget. Both run in CI

## Database and Migration Impact

None.

## Environment Impact

None: no new setting, dependency or permission.

## Risks and Follow-Up

- The SQL is proven by CI only; the first run of this branch is the
  evidence to read, with the two timings printed in its log.
- The tables list every row the server sends: bounded by the suppliers,
  the raw materials, the distributors and the catalogue.
- Stacked on 019 and 020.
- UX checklist screenshots: waived (owner's decision): overflow
  assertions on both tabs at the three widths and axe on both.

## Merge Checklist

- [ ] CI passed, including the database-backed analytics suite and the
      performance suite
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue 021
- [ ] Pull requests 019 and 020 merged first; target branch is `dev`
