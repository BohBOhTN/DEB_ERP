# Fix #42: Accueil, "Dépenses du jour" and the period of every tile

## Branches

- Source: `fix/42-accueil-kpi-periods` (stacked on `fix/46-clients-kpis-deactivate-detail`)
- Target: `dev`

## Scope

Closes issue #42 ([issues/002](../issues/002-accueil-kpi-periods.md)):
the expenses tile reads the selected business day instead of the calendar
month, every daily tile follows the `Aujourd'hui` / `Hier` control, the
cash tile uses the drawer formula, the two balance tiles say they are
current, the empty hint fires only on a fresh database and the quick
actions open the creation pages.

## Summary

- `expenses` in `GET /home/summary` is now `{ dayTnd, dayCount,
previousDayTnd }`: posted expenses whose date falls inside the selected
  business day on the Tunis boundaries, with the day before for the
  comparison. The block used to sum from the first of the month in UTC to
  now, ignoring `?date=`; on the first of a month between 00:00 and 01:00
  Tunis it showed the previous month.
- `sales.today.cashTnd` and `previousDay.cashTnd` follow the V1 drawer
  formula: sale receipts less refunds, order advances received less
  refunded, règlements taken at a till less those reversed at a till, each
  dated by the moment the money moved. The tile used to sum
  `paidAmountTnd` on sales, so a règlement or an advance collected at the
  till was missing from "Encaissé en espèces".
- "Today" is resolved with the shared `businessDateOf` helper (Tunis).
- Frontend: `Ventes du jour` / `Ventes d'hier`, `Dépenses du jour` /
  `Dépenses d'hier` from the period control; delta caption `vs la
veille`; the cash tile notes which day; `Reste à encaisser clients` and
  `À payer fournisseurs` carry `Solde actuel`; the expenses tile shows the
  day's count and the day before's amount; the Accueil strings live in
  `i18n/fr.ts`.
- The "Commencez par ouvrir la caisse…" hint needs no sale, no open till,
  no order in the queue, no expense of the day, nothing owed either way and
  no recent event; a quiet day on a live database no longer shows it.
- `Nouvelle commande` opens `/commandes/nouvelle` and `Nouvel achat`
  opens `/achats/nouveau`.

## Out of Scope

- A seven-day window (the summary takes one business day; a range needs
  an API change) and binding the control to the shared period filter of
  #41, which offers presets the summary cannot serve.
- Profitability, forecasts and scheduled reports (`OD-V2-001`).

## Verification

Run locally on macOS, Node 24, on the stacked branch:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 360 passed, 10 skipped (49 files);
  new in `home.service.test.ts`: the expenses of the first of October are
  summed between 2026-09-30T23:00Z and 2026-10-01T22:59:59.999Z with the
  day before as comparison; the cash of the day equals receipts − refunds
  - advances − advance refunds + till règlements − till reversals
- `npm run test --workspace frontend`: 214 passed (90 files); new in
  `AccueilPage.test.tsx`: `Hier` switches the sales, cash and expenses
  tiles to yesterday and sends yesterday's business date; the day labels,
  the `Solde actuel` captions, the create links; a quiet day with a till
  open or money owed is not a fresh database
- `npm run build`: passed; initial JavaScript 200.5 kB gzip against the
  250 kB budget; POS chunk 13.1 kB
- Playwright on the system Brave browser (`E2E_BROWSER`), the shell flow
  and the axe scans at three widths: 94 passed, 2 skipped by design

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- `expenses.monthTnd` / `monthCount` are gone from the summary; the home
  page is the only reader.
- The till règlements counted in the cash tile are those with a session;
  a règlement recorded outside a session (bank, later) is not drawer cash,
  as in the session's expected-cash formula.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue #42
- [ ] Target branch is `dev`
