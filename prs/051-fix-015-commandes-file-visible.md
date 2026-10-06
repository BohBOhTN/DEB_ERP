# Fix 015: the orders queue opens on every open order

## Branches

- Source: `fix/commandes-file-visible` (from `main`, which holds the 2.2.0 release cut that `dev` has not received yet)
- Target: `dev`

## Scope

Closes issue 015 ([issues/015](../issues/015-commandes-file-visible.md)).
The client reported that `Commandes` "always shows 0" and does not list its
data. The data was right; the page hid it: it opened on the orders not yet
due, today only, and every other period preset looked backwards.

## Summary

- **`À traiter` is every open order.** The tab asked the server for
  `dueState=UPCOMING`, "due from now on": an order left the tab one minute
  after its pickup time. It now asks for `open=true` (draft to ready,
  whatever the time), a new filter on `GET /orders` and
  `GET /orders/summary`. A late order stays in the tab with an
  `En retard` badge; the `En retard` tab is unchanged.
- **The page opens on every date.** The default period was
  `Aujourd'hui`, so orders for tomorrow or next week were not listed and
  the KPI row, which follows the period, counted nothing. The default is
  now `Toutes`.
- **Periods that fit a pickup date.** `Cette semaine` and `Ce mois` stop
  at today and never reach an order to come. Open tabs offer
  `Toutes | Aujourd'hui | Demain | 7 jours | Personnalisée`; closed tabs
  (`Terminées`, `Annulées`) keep the backward ones with `Toutes`. A window
  the tab does not offer is dropped when the tab changes. `periodRange`
  gains `all`, `tomorrow` and `next7`.
- **A `Toutes` tab**, so a search by reference finds an order whatever
  its state.
- **Editing an order.** The server could update a draft or confirmed
  order (`PATCH /orders/{id}`) but no screen did. `Modifier` is now on the
  row and on the order page (`orders.update`): pickup time, notes and
  lines, with the customer and the deposit shown and not edited. Lines are
  sent only when they change, since the server prices changed lines again
  from the catalogue; the page says so and refuses a total below the
  deposit already held before any request.
- **Around it:** the remaining amount on the phone card; no loading
  skeleton on background refreshes (the rows no longer blink after an
  action); the form summary of the order editors styled as an error
  instead of grey text; the board rules moved to `ordersBoard.ts`.

## Out of Scope

- A calendar view of the pickups; editing an order in preparation (the
  server refuses it, `ORDER_NOT_EDITABLE`).
- Whole-month and whole-week windows on the open tabs (`7 jours` and the
  custom range cover them).

## Verification

Run locally on macOS, Node 24, on 2026-10-05:

- `npm run format:check`, `npm run lint`, `npm run typecheck`: passed
  (contract and API types regenerated)
- `npm run test --workspace backend`: 411 passed, 16 skipped (the six
  database-backed suites). New: every open order without a date bound;
  open orders with a window and a search; the route passing `open` to the
  list and the summary and refusing a malformed value
- `npm run test --workspace frontend`: 279 passed (98 files). New: the
  page opening on the late order, tomorrow's and next week's with three
  open orders counted; `Demain` and `7 jours` sending whole Tunis days;
  the closed tab's presets and its fallback to `Toutes`; the `Toutes`
  tab; the board rules; `Modifier` from the row saving the notes without
  the lines, then the lines once a quantity changes; the refusal on an
  order in preparation; the three new period presets
- `npm run build`: passed; 201.5 kB gzip initial against 250 kB
- Playwright on the system Brave browser, mocked API, 360, 768 and
  1280 px: the orders flow and the shell smoke, 7 passed, 2 skipped by
  design
- Not run here: the database-backed suites (CI)

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- The branch starts from `main` because the 2.2.0 release cut was merged
  into `main` only: merging this pull request also brings those four
  commits into `dev`.
- `open=true` on the summary is accepted and not used by the page: the
  KPI row describes the whole scope, not the tab.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue 015
- [ ] Target branch is `dev`
