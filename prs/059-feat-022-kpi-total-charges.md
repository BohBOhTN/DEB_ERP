# Change 022: `Total charges` on Accueil and the five figures of `Vue d'ensemble`

## Branches

- Source: `feat/022-kpi-total-charges` (from `feat/021-analyses-achats-distributeurs`)
- Target: `dev`, after pull requests 019, 020 and 021

## Scope

Closes issue 022 ([issues/022](../issues/022-kpi-total-charges-et-vue-d-ensemble.md)):
on the home page `Total charges` takes the place of `Encaissé en espèces`;
on `Vue d'ensemble` the tiles become revenue (with the number of sales),
total charges, approximate margin, raw-material purchases and
resold-product purchases. Decision `DEC-V2-012`. Last of four stacked
branches. No migration.

## Summary

- **Definition** (`DEC-V2-012`). The charges of a day or a period are its
  posted expenses plus the raw-material lines of its posted purchases,
  each on its own date and for its full amount whether paid or not.
  Purchases of products bought to be resold are stock, not a charge. The
  other goods of a shopping trip are expenses, counted once.
- **`GET /home/summary`** gains `charges` (`expenses.view` and
  `purchases.view`): the day's total, its two parts and the day before.
  It reuses the expenses of the block beside it and adds two reads of the
  purchases by kind.
- **`GET /analytics/overview`** gains `purchases` (`purchases.view`: raw
  materials and resold products, each with the previous period) and
  `charges` (`expenses.view` and `purchases.view`).
- **Accueil.** The tile `Total charges` ("Total charges d'hier" on the
  day before) replaces `Encaissé en espèces`, with "Dépenses X · matières
  premières Y" under it and the comparison with the day before, an
  increase read as bad news. `Dépenses du jour` stays. The cash of the
  day remains on the session card and the session pages; `cashTnd`
  remains in the API.
- **Vue d'ensemble.** Five tiles against the previous period: `Chiffre
d'affaires` (with "N ventes en caisse · N jours"), `Total charges`,
  `Marge approximative`, `Achats matières premières`, `Achats produits de
revente` ("stock à revendre, hors charges"). A tile whose block the
  caller may not see is absent. The trend, the channels and the expenses
  by category are unchanged. A period counts as empty only when it holds
  no sale, expense or purchase.

## Out of Scope

- A cash-out view of the day (what was actually paid): the charges are
  what the day cost, paid or not.
- The average basket and the still-due figure as tiles: both stay in the
  API and on `Sessions de caisse`.

## Verification

Run locally on macOS, Node 24, on 2026-10-06:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 490 passed, 19 skipped (64 files, the six database-backed suites skipped here). New: the charges of a
  day on a double (85 of expenses and 120 of flour make 205, the 60 of
  goods to resell stay out, the day before, the Tunis windows, no figure
  without either permission); the overview blocks and their permissions
- `npm run test --workspace frontend`: 314 passed (100 files). New and updated: the
  tile on `Accueil` with its parts and its comparison, `Encaissé en
espèces` gone, the tile on the day before, hidden for a cashier; the
  five tiles of the overview with their deltas, the tiles gone, the tiles
  hidden without their block, the empty period
- `npm run build`: passed; 201.9 kB gzip initial against 250 kB; POS route 14.3 kB against 120 kB
- Playwright on the system Brave browser, mocked API, 360, 768 and
  1280 px, the whole suite over the four stacked branches: 158 passed, 3 skipped by design. One desktop run of the distribution spec timed out on a page load at the end of the run and passed at the three widths when run again on its own
- Not run here (no local PostgreSQL): one new case of
  `analytics.service.database.test.ts` (March 2001: charges 28.500 from
  12.500 of expenses and 16.000 of flour, 19.200 of croissants to resell
  apart). It runs in CI

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- `Total charges` is not the cash that left the till: an unpaid purchase
  counts in full on its date. The tile's note names its two parts.
- A user with `expenses.view` alone no longer sees a spending tile on the
  overview (the `Dépenses` tile is gone); the expenses by category card
  stays.
- Stacked on 019, 020 and 021.
- UX checklist screenshots: waived (owner's decision).

## Merge Checklist

- [ ] CI passed, including the database-backed analytics suite
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue 022
- [ ] Pull requests 019, 020 and 021 merged first; target branch is `dev`
