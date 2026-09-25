# 002 · Accueil: "Dépenses du jour" and KPI periods

| Field            | Value                                                                               |
| ---------------- | ----------------------------------------------------------------------------------- |
| Module           | `frontend/src/features/home`, `backend/src/modules/home`                            |
| Type             | Bug + small enhancement                                                             |
| Priority         | Medium                                                                              |
| Suggested branch | `fix/accueil-expenses-period`                                                       |
| Related          | `OD-V2-001` (operational home page only), spec `07_SCREEN_INVENTORY_AND_IA.md` §3.1 |

## Owner's request

> "Dépenses du mois": I need to turn it into "Dépenses du jour".

## Findings

1. **The tile is hard-coded to the calendar month and ignores the period selector.**
   - Label "Dépenses du mois" is a literal in [ExpensesTile.tsx:17](../frontend/src/features/home/widgets/ExpensesTile.tsx#L17), not an i18n key.
   - The backend block `expensesBlock(now)` at [home.service.ts:297-314](../backend/src/modules/home/home.service.ts#L297-L314) sums POSTED expenses from the 1st of the month to `now`. It is called with `now`, not with the selected day, so `?date=` (the "Hier" selector) has no effect on it.
   - The month start is computed from `getUTCFullYear()` / `getUTCMonth()`, i.e. in UTC, while every other block uses `Africa/Tunis` business days. On the 1st of a month between 00:00 and 01:00 Tunis time the tile shows the previous month.
   - API field names are `expenses.monthTnd` / `expenses.monthCount` ([home.api.ts](../frontend/src/features/home/home.api.ts)), asserted in [home.service.test.ts:68](../backend/src/modules/home/home.service.test.ts#L68) and [AccueilPage.test.tsx:84](../frontend/src/features/home/AccueilPage.test.tsx#L84).
2. **Other period inconsistencies on the same page** (not requested, found during the investigation):
   - "Ventes du jour" ([KpiRow.tsx:39](../frontend/src/features/home/widgets/KpiRow.tsx#L39)) keeps its label and its "vs hier" delta when "Hier" is selected; the delta is then really "vs avant-hier".
   - "Encaissé en espèces" is the sum of `Sale.paidAmountTnd` only; customer payments and order advances collected at the till are not included, so it is not the drawer's cash. The V1 formula (source of truth §11.1) counts them.
   - "Reste à encaisser clients" and "À payer fournisseurs" are all-time balances placed in the same row as daily tiles with no period hint.
   - The empty hint "Commencez par ouvrir la caisse…" ([AccueilPage.tsx:51-55](../frontend/src/features/home/AccueilPage.tsx#L51-L55)) fires on any day with zero sales, not only on a fresh database.
   - Quick actions "Nouvelle commande" and "Nouvel achat" go to the list pages although `/commandes/nouvelle` and `/achats/nouveau` exist.
   - The home period control only knows `today | yesterday` ([homePeriod.ts:6](../frontend/src/features/home/homePeriod.ts#L6)); the spec asked for `Aujourd'hui | Hier | 7 jours`.

## Proposed change

### Backend

- Replace `expensesBlock(now)` with `expensesBlock(businessDate)`: sum POSTED expenses whose `expenseDate` falls inside the selected business day (`startOfBusinessDay` / `endOfBusinessDay`, same helpers as `salesBlock`). Rename the response fields to `expenses.dayTnd` / `expenses.dayCount`. Keep the API version; the field rename is inside the `summary` object read only by the home page.
- Optional, same PR: add `previousDay` to the expenses block so the tile can show a delta like the sales tile.
- Fix "Encaissé en espèces" to the V1 formula: sale payments + customer payments with `sessionId` + order advance receipts, all on the selected day.

### Frontend

- Tile title "Dépenses du jour" (and "Dépenses d'hier" when the period is `yesterday`, derived from the same period label helper used by the sales tile).
- Sales tile title follows the period too: "Ventes du jour" / "Ventes d'hier"; delta caption "vs la veille".
- Add a subtle "Soldes actuels" caption on the two balance tiles so the mixed periods are explicit.
- Empty hint only when the whole summary is empty (no sales, no session, no orders, no expenses).
- Quick actions point at the create routes where they exist.
- Move the two literals into `i18n/fr.ts`.
- Once issue 001 lands, replace `homePeriod.ts` with the shared period helper limited to `Aujourd'hui | Hier` (the summary API takes one day).

### Tests to update

- [home.service.test.ts](../backend/src/modules/home/home.service.test.ts) lines 68 and 85 (`monthTnd` → `dayTnd`, and a test proving the block uses the requested date and the Tunis day boundaries).
- [AccueilPage.test.tsx](../frontend/src/features/home/AccueilPage.test.tsx) line 84 (label) and the "Hier" branch labels.
- `frontend/e2e/shell.spec.ts:54` still matches "Ventes du jour" on the default period; leave as is.

## Acceptance criteria

- With `Aujourd'hui` selected, the tile reads "Dépenses du jour" and its amount equals the sum of today's POSTED expenses on `/depenses` filtered to today.
- With `Hier` selected, every daily tile switches to yesterday, including expenses.
- Month boundary test at 00:30 Tunis on the 1st passes.

## Out of scope

- Profitability, forecasts, scheduled reports (`OD-V2-001` keeps the page operational only).
- A 7-day window (needs a range parameter on the summary API; can be scheduled after issue 001).
