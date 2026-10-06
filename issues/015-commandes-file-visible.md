# 015 · Commandes: the queue shows nothing by default; periods that look forward; edit from the row

| Field            | Value                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| Module           | `frontend/src/features/orders`, `backend/src/modules/orders`, `frontend/src/lib/dates` |
| Type             | Fix                                                                                    |
| Priority         | High (the client reads the page as broken)                                             |
| Depends on       | 005 (KPIs, filters and row actions), 001 (period filter)                               |
| Suggested branch | `fix/commandes-file-visible`                                                           |
| Related          | source of truth §12 (`ORD-004`, `ORD-013`), spec 07 §4.5, issue 005 PR 2               |

## Client's report

> The Commandes page always shows 0 and the data is not properly listed. The page must map the data correctly, show it for the filters selected, and offer the proper actions on the orders.

## Findings

The data is mapped correctly; the page hides it. Three choices of issue 005 combine so that an ordinary queue reads as empty.

1. **"À traiter" means "not yet due".** The default tab sends `dueState=UPCOMING`, which the service turns into `requestedFulfillmentAt >= now` ([orders.service.ts:1172](../backend/src/modules/orders/orders.service.ts#L1172)). An order due at 10:00 leaves the tab at 10:01 although nobody has handed it over; it only shows under "En retard". An order still to treat is an order still to treat, late or not.
2. **The default period is "Aujourd'hui"** ([OrdersPage.tsx:55](../frontend/src/features/orders/pages/OrdersPage.tsx#L55)), applied to the pickup date. A bakery takes orders for tomorrow, for Friday, for the wedding next month: none of them is listed, and the KPI row, which follows the same period, shows `0` open orders, `0` deposits and `0` remaining. This is the "always 0".
3. **The other presets look backwards.** `periodRange` resolves "Cette semaine" to Monday → today and "Ce mois" to the 1st → today ([periodRange.ts](../frontend/src/lib/dates/periodRange.ts)): right for sales and expenses, wrong for a pickup date in the future. No preset ever reaches tomorrow; only a custom range does.

Around it:

- No tab lists every order, so a search by reference finds nothing unless the right tab and period are already selected.
- "Modifier" is offered on the order page only; issue 005 planned it on the row for draft and confirmed orders and it was not delivered ([OrderRowActions.tsx](../frontend/src/features/orders/components/OrderRowActions.tsx)).
- The table shows its loading skeleton on every background refresh (`loading={isPending || isFetching}`), so the rows blink after each action.
- The phone card shows the total but not what remains to pay.
- The mock used by the tests filters like the server, so no test noticed: every test picks a tab and a date on purpose.

## Proposed change

### Backend

- `open=true` on `GET /orders` and `GET /orders/summary`: the orders awaiting fulfilment (draft to ready), whatever their due time. `dueState` keeps its meaning for "En retard".

### Frontend

- **Tabs**: `À traiter` (every open order, soonest first, the late ones flagged `En retard` in the row), `En retard`, `Prêtes`, `Terminées`, `Annulées`, `Toutes`.
- **Period**: default `Toutes` (no date bound). Presets that fit a pickup date: `Toutes | Aujourd'hui | Demain | 7 jours | Personnalisée` on the open tabs, `Toutes | Aujourd'hui | Cette semaine | Ce mois | Personnalisée` on the closed ones; a preset the tab does not offer falls back to `Toutes`. `periodRange` gains `all`, `tomorrow` and `next7`.
- **KPI row**: same figures, now over the whole queue by default, still following the period, the customer and the search.
- **Row**: `Modifier` for draft and confirmed orders (`orders.update`); the remaining amount on the phone card; no skeleton on background refreshes.

## Tests

- Backend: `open` composes with a window and with the search; the route accepts it; the summary counts the same rows.
- Frontend: the page opens on every open order with real KPIs; an overdue order stays in `À traiter` with its flag; `Demain` and `7 jours` send the right window; a closed tab offers the backward presets and falls back to `Toutes`; `Toutes` lists every status; `Modifier` from the row; `periodRange` for the three presets.
- Browser: the orders flow at the three widths.

## Acceptance criteria

- With three orders due tomorrow and one due an hour ago, opening `Commandes` lists the four and the KPI row counts four open orders, one late.
- `Demain` lists the three; `7 jours` lists the three and not the late one's day unless it is today.
- A search by reference from `Toutes` finds a completed or cancelled order.
- `Modifier` opens the editor of a draft or confirmed order from its row.
