# Fix #41: Shared period filter

## Branches

- Source: `fix/41-shared-period-filter` (stacked on `fix/43-caisse-tile-selection-flow`)
- Target: `dev`

## Scope

Closes issue #41 ([issues/001](../issues/001-shared-period-filter-and-kpis.md)):
one period control for every list with a date dimension, with the five
presets the owner asked for (`Aujourd'hui` by default, `Hier`,
`Cette semaine`, `Ce mois`, `Personnalisée` for one date or a range), the
state in the URL, and the same control on `Ventes`, `Sessions de caisse`,
`Mouvements`, `Journal d'audit` and `Dépenses`. `Commandes` adopts it with
its own issue (#45) because of the status board; `Accueil` keeps its
one-day control until #42.

## Summary

- `lib/dates/periodRange.ts`: presets, their labels, `periodRange` (Tunis
  business days: today, yesterday, Monday to today, the 1st to today, or
  the custom dates, one date meaning a single day, none meaning every
  date), `periodCaption` ("Le 24/09/2026", "Du 21/09/2026 au 24/09/2026",
  "Toutes les dates"), `periodFromParams` / `periodToParams` for the URL
  (`period`, `from`, `to`; dates stored for a custom period only so a
  preset link keeps resolving to the current day).
- `components/patterns/PeriodFilter`: the `SegmentedControl` with the five
  presets (small and full width on phones), "Du" and "Au" for a custom
  period (bounded by each other), the caption under it. Rendered above the
  `FilterBar`, so it stays visible on phones instead of moving into the
  filter sheet. Registered in the kit.
- The five pages replace their "Du" / "Au" inputs with it. `Ventes`,
  `Sessions`, `Mouvements` and `Audit` default to today; `Dépenses` to
  `Ce mois` (its report is monthly; `Mois dernier` is reachable through a
  custom range). The active-filter count treats any preset other than the
  default as one filter; `Réinitialiser` returns to it. The session detail's
  "Ventes de la session" link now opens the list with `period=custom` and no
  dates, meaning every date.
- Backend untouched: `from` / `to` already read business days.

## Out of Scope

- The list KPI rows (added per list by #44, #45 and #46 with their summary
  endpoints).
- `Commandes` (#45) and `Accueil` (#42).

## Verification

Run locally on macOS, Node 24, on the stacked branch:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: unchanged from #43, backend untouched
- `npm run test --workspace frontend`: 209 passed (89 files); new:
  `periodRange.test.ts` (presets on the Tunis day at 23:30 UTC, Monday and
  1st-of-month boundaries, custom single day, inverted range, no dates,
  captions, URL round-trip), `PeriodFilter.test.tsx` (five presets, caption,
  custom range revealed and started from the days shown), and an expenses
  page test driving the report and the list through the control (`Ce mois`
  default, `Hier` empties both, a custom range narrows them)
- `npm run build`: passed; initial JavaScript 200.1 kB gzip against the
  250 kB budget; POS chunk 11.7 kB
- Playwright on the system Brave browser (`E2E_BROWSER`), the specs that
  visit the changed pages (`access`, `catalogueStock`, `expensesSimulation`,
  `shell`, `caisse`) plus the axe scans, at three widths: 106 passed,
  2 skipped by design, 3 failed at 360 px on the first run because the five
  presets sat on one line and pushed the page 9 px sideways (the control's
  own full-width rule outranked the wrap); after the specificity fix the
  three specs pass at 360 px (5 passed), the other widths were unaffected

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- Lists that used to open on every date (`Sessions`, `Mouvements`,
  `Audit`) now open on today; one tap on `Cette semaine` or `Ce mois`
  widens them. If a journal should open wider by default, the page's
  default preset is one constant.
- The page tests and the expenses fixtures depend on the real clock being
  in September 2026, as the existing expenses test already did.
- `Achats` still has its own filters; it takes the control with the tables
  sprint or its own issue.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue #41
- [ ] Target branch is `dev`
