# 001 · Shared period filter and list KPIs (cross-cutting)

| Field            | Value                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Module           | `components/patterns` (frontend), `shared/listQuery.ts` (backend)                                                                 |
| Type             | Enhancement, prerequisite for 004 and 005                                                                                         |
| Priority         | High (blocks the Ventes and Commandes filters)                                                                                    |
| Suggested branch | `fix/shared-period-filter`                                                                                                        |
| Related spec     | V2 pack `07_SCREEN_INVENTORY_AND_IA.md` §3 (list anatomy: `FilterBar` with filters in the URL), R10 Sprint 29 (one table anatomy) |

## Owner's request

> I want to properly work on the filters: by default it's today, he can select yesterday, this week, this month, and he can pick just one date or a date interval, and we need to properly handle that. I want the same style of table filters across all the app for consistency.

## What exists today

- There is no period or date-range component. Every list builds its range from two `ui/DateInput` fields labelled "Du" / "Au": `SalesPage`, `SessionsPage`, `PurchasesPage`, `OrdersPage`, `MovementsPage`, `AuditPage`, `ExpensesPage`.
- Three different period idioms coexist:
  - `Accueil`: `SegmentedControl` "Aujourd'hui | Hier" ([homePeriod.ts](../frontend/src/features/home/homePeriod.ts), single-day API parameter).
  - `Dépenses`: "Ce mois | Mois dernier | Personnalisée" with a local `periodRange()` helper ([ExpensesPage.tsx:48-90](../frontend/src/features/expenses/pages/ExpensesPage.tsx#L48-L90)).
  - `Commandes`: a status board plus a "Du/Au" range that overrides the board's own dates ([OrdersPage.tsx:112-118](../frontend/src/features/orders/pages/OrdersPage.tsx#L112-L118)).
- `FilterBar` ([FilterBar.tsx](../frontend/src/components/patterns/FilterBar/FilterBar.tsx)) already supports search, a filters slot, active count, reset and a phone bottom sheet. It is used by 16 pages, so the container is consistent; only the period control is not.
- Backend: `dateRangeFields` in [listQuery.ts:62-99](../backend/src/shared/listQuery.ts#L62-L99) already reads `from`/`to` as Tunis business days (`YYYY-MM-DD`) or ISO instants. The API side needs no change for presets; presets are a frontend concern that resolves to `from`/`to`.
- `KpiGrid` / `KpiTile` exist and are used by `Accueil`, `Dépenses` and the session detail. `Dépenses` is the closest existing "KPIs + period + table" page and should be the visual reference.

## Proposed change

### Frontend

1. New pattern `components/patterns/PeriodFilter`:
   - `SegmentedControl` presets: `Aujourd'hui` (default) · `Hier` · `Cette semaine` · `Ce mois` · `Personnalisée`.
   - `Personnalisée` reveals "Du" and "Au" `DateInput`s. A single date is expressed by leaving "Au" empty or equal to "Du" (both mean one business day).
   - Value is `{ preset, from, to }` and is stored in the URL through `useUrlState` as `period`, `from`, `to`, so a link or a refresh restores it. When `preset !== "custom"`, `from`/`to` are derived, not stored.
   - Resolution to business days happens in one helper (`lib/dates/periodRange.ts`) using the `Africa/Tunis` calendar (week starts Monday). Move the `Dépenses` `periodRange()` and the home `periodDate()` into it.
   - Below 900 px the presets stay visible above the table (they are the primary filter); the rest of the filters go into the existing `FilterBar` sheet.
   - A muted "Du 21/09/2026 au 24/09/2026" caption under the control, as `Dépenses` does today.
2. New pattern `components/patterns/ListSummary` (or reuse `KpiGrid` with a `compact` variant): a row of 3 to 5 `KpiTile`s bound to a summary query that takes the same filters as the list, shown above the `FilterBar`. Loading and error states shared with the table.
3. Adopt it in this order: `Ventes` (issue 004) and `Commandes` (issue 005) in their own branches; then `Achats`, `Dépenses`, `Mouvements`, `Sessions`, `Audit` in one follow-up branch so the whole app matches.

### Backend

- No change for the filter. Summary endpoints are per module (see 004 and 005); each takes the list's filter schema and returns aggregates computed by SQL `groupBy`/`aggregate`, never by loading rows.

## Acceptance criteria

- Every list that has a date dimension shows the same control, in the same place, with the same five presets and the same default (`Aujourd'hui`).
- The URL fully describes the filter state; opening the URL in a new tab reproduces the list and the KPIs.
- `Cette semaine` runs Monday to today; `Ce mois` runs the 1st to today; `Hier` is one business day in `Africa/Tunis`.
- No horizontal scroll at 360, 430, 768 and 1280 px (existing automated assertion pattern).
- Unit tests for `periodRange` (all presets, month boundaries, single date, range with `to < from` rejected inline with French copy).

## Out of scope

- Server-side saved filters, export.
- Changing `dateRangeFields` semantics.
