# Fix #45: Commandes, figures, period filter, row actions, deposit and completion fixes

## Branches

- Source: `fix/45-commandes-kpis-filters-actions` (stacked on `fix/41-shared-period-filter`)
- Target: `dev`

## Scope

Closes issue #45 ([issues/005](../issues/005-commandes-kpis-filters-actions.md)):
the queue gets a KPI row, the shared period filter, a search, and the
actions of the detail page on each row; three defects are fixed (a
completion with the amount left empty was recorded as paid in full, the
"Aujourd'hui" and "À venir" tabs returned the same rows on the real backend,
and "Reste" was wrong for completed and cancelled orders); the deposit
dialog is gated, capped and worded for a deposit.

## Summary

- Backend `listOrders`: a due state and a date window now combine (the
  window used to be dropped whenever a due state was set); `q` searches the
  reference and the customer name; each row carries `advanceReceivedTnd`
  (receipts less refunds, summed by the database for the page) and
  `remainingDueTnd` (total less the advance while open, the linked sale's
  remaining due once completed, nothing once cancelled). `getOrder` and the
  command answers carry the same figures.
- `GET /orders/summary` with the list's filters: open, ready, completed and
  cancelled counts, overdue and due-today counts, open total, advances
  held, remaining to collect, completed total; one `groupBy`, one
  `aggregate` and two counts.
- `POST /orders/:id/complete` requires `paidAmountTnd`; "0.000" leaves the
  remainder on the customer's account and nothing is inferred from an
  absent field. The dialog always sends it.
- Deposit: the button and the row action need `orders.update` and
  `customer_payments.create` like the route; the form refuses an amount
  above the remainder inline ("L'acompte dépasse le reste à verser sur la
  commande."); the payment box reads `Reste à verser` / `Verser le reste`
  without the cash presets; the date is sent as an instant (now for today,
  midday in Tunis otherwise) so advances no longer show at 01:00; without
  an open till the dialog says so and disables the amount.
- Queue page: tabs `À traiter | En retard | Prêtes | Terminées | Annulées`
  (the status dimension), the shared `PeriodFilter` on the fulfilment time
  (`Aujourd'hui` by default, hidden on `En retard` which is dated by
  definition), a search box, and a KPI row (`Commandes ouvertes` with the
  due-today note, `En retard` with the ready count, `Acomptes reçus` over
  the open total, `Reste à encaisser` with the completed figures) that
  follows the customer, the search and the period. `Avance` and `Reste`
  read the API figures. `OrderRowActions` on every row and phone card:
  `Voir`, the next status, `Reprendre la préparation` on a ready order,
  `Encaisser un acompte`, `Terminer`, `Annuler`, each behind the same
  permission and the same dialog as the detail page (the detail is read
  when a dialog opens, so the lines and advances are there).
- Detail page: `Reprendre la préparation` on a ready order; the totals card
  reads the API figures, so a cancelled order shows nothing due.
- Editor: the unit price is shown from the catalogue and no longer
  editable, since the server always prices lines from it.
- Three backend messages get their accents.
- Migration: `(customer_id, requested_fulfillment_at)` on orders and
  `(order_id, paid_at)` on advances.

## Out of Scope

- `Modifier` on a queue row: there is no order edit route yet (Sprint 29).
- Cancelling a completed order's sale (#44).

## Verification

Run locally on macOS, Node 24, on the stacked branch:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 342 passed, 10 skipped (48 files);
  new: due state combined with a date window, search predicate, summary
  route allowed and denied, completion refused without the amount, every
  completion test states its amount
- `npm run test --workspace frontend`: 210 passed (89 files); new: a queue
  row's actions (figures shown, KPI row, a deposit above the remainder
  refused inline with the deposit wording and no presets, then a completion
  stating nothing paid leaves the remainder on the account), the editor's
  price shown as text
- `npm run build`: passed; initial JavaScript 200.1 kB gzip against the
  250 kB budget; POS chunk 11.7 kB
- Playwright on the system Brave browser (`E2E_BROWSER`), the customers
  and orders flow, the shell flow and the axe scans at three widths: 94
  passed, 2 skipped by design, and the orders flow failed at the three
  widths on its unit-price textbox assertion, updated to the read-only
  price; after the update the orders flow passes at the three widths

## Database and Migration Impact

One additive migration, `20260924190000_order_queue_indexes`, two indexes.

## Environment Impact

None.

## Risks and Follow-Up

- The tabs changed meaning: `À traiter` is the old `Aujourd'hui` and
  `À venir` together, narrowed by the period. A link to `/commandes?board=today`
  falls back to `À traiter`.
- The queue page test pins the clock to 23 September 2026 like the board
  test before it.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue #45
- [ ] Target branch is `dev`
