# 005 · Commandes: KPIs, period filters, row actions, deposit and completion fixes

| Field              | Value                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Module             | `frontend/src/features/orders`, `backend/src/modules/orders`                                                   |
| Type               | Feature + 3 bugs                                                                                               |
| Priority           | High (one bug records unpaid amounts as paid)                                                                  |
| Depends on         | 001 (period filter)                                                                                            |
| Suggested branches | `fix/commandes-completion-and-filters` (bugs, no migration, ship first) then `feat/commandes-kpis-row-actions` |
| Related            | source of truth §12 (`ORD-008` to `ORD-018`), `OD-007`, `OD-008`, spec §4.5                                    |

## Owner's request

> Add useful KPIs for the commandes; add filters just like the Ventes page; add actions to cancel, add payments using modals, change the status; inside the page fix the one thing on "Encaisser un acompte".

## Findings

### Bugs (not requested, found during the investigation, all verified in code)

1. **Completing an order with an empty amount records it as fully paid.** [CompleteOrderDialog.tsx:84](../frontend/src/features/orders/components/CompleteOrderDialog.tsx#L84) omits `paidAmountTnd` when the field is 0 or empty, and the backend treats a missing value as "pay the whole remainder" ([orders.service.ts:591-594](../backend/src/modules/orders/orders.service.ts#L591-L594)). The dialog text promises "Reste à payer porté au compte client : X" but the sale is posted PAID with a cash `SalePayment` of X that never entered the drawer. Cash session totals and the customer balance are both wrong after this. Fix: the frontend always sends `paidAmountTnd` ("0.000" when nothing is paid) and the backend makes the field required so the ambiguity disappears from the contract.
2. **"Aujourd'hui" and "À venir" tabs show the same orders on the real backend.** In [orders.service.ts:112-131](../backend/src/modules/orders/orders.service.ts#L112-L131) the `dueState` spread comes after the `dueBefore`/`dueAfter` spread and overwrites `requestedFulfillmentAt`, so the date bounds are dropped whenever `dueState` is set. The msw mock applies both ([customersOrders.ts:361-397](../frontend/src/test/msw/handlers/customersOrders.ts#L361-L397)), which is why no test fails. On the frontend the "Du/Au" filter also overrides the tab's own bounds ([OrdersPage.tsx:112-118](../frontend/src/features/orders/pages/OrdersPage.tsx#L112-L118)).
3. **"Reste" and "Avance" are wrong for completed and cancelled orders.** `advanceBalanceTnd` is reset to 0 on completion and on cancellation, and the list computes `remainingOf = total − advanceBalance` ([OrdersPage.tsx:164-175](../frontend/src/features/orders/pages/OrdersPage.tsx#L164-L175)), so a completed order shows Avance 0 and Reste = total. The detail page shows the full total as remaining for a cancelled order ([OrderDetailPage.tsx:295-303](../frontend/src/features/orders/pages/OrderDetailPage.tsx#L295-L303)).

### "Encaisser un acompte" (the owner's "one thing")

The dialog ([AdvanceDialog.tsx](../frontend/src/features/orders/components/AdvanceDialog.tsx)) closes, refreshes and reduces the remaining balance correctly. What is wrong around it:

- **Permission mismatch:** the button is gated by `orders.update` only ([orderLabels.ts:52-55](../frontend/src/features/orders/components/orderLabels.ts#L52-L55)) but the route needs `orders.update` **and** `customer_payments.create` ([orders.routes.ts:185-188](../backend/src/modules/orders/orders.routes.ts#L185-L188)). A user with only `orders.update` sees the button and gets a 403 banner.
- **No cap in the form:** `advanceSchema` ([orders.schemas.ts:85-89](../frontend/src/features/orders/orders.schemas.ts#L85-L89)) only requires a positive amount; `PaymentBox` shows "Le montant dépasse le montant dû." but does not block; the server answers `ORDER_ADVANCE_EXCEEDS_TOTAL` (400 on the backend, 409 in the mock) which lands in the banner instead of on the field.
- **Labels are the payment ones:** ceiling "Montant dû", "Tout régler", 5/10/20/50 presets. For a deposit the ceiling is "Reste à verser" and the button "Verser le reste".
- **Date:** `paidAt` is sent as `YYYY-MM-DD`, read as UTC midnight, then displayed as 01:00 ([OrderDetailPage.tsx:250](../frontend/src/features/orders/pages/OrderDetailPage.tsx#L250)); the editor sends a full ISO timestamp.
- Requires an open session (money enters the drawer): the button should say why it is disabled when no session is open, as the editor already does ("Ouvrez la caisse pour encaisser un acompte").
- No frontend test opens the dialog.

### List, filters, KPIs, actions

- Filters today: status tabs (`À venir | Aujourd'hui | En retard | Prêtes | Terminées | Annulées`), customer combobox, "Du/Au". No search, no row actions; row click opens the detail. Backend `GET /orders` ([orders.routes.ts:33-41](../backend/src/modules/orders/orders.routes.ts#L33-L41)) has no `q`.
- No summary endpoint. The only counts are on the home page (`dueTodayCount`, `overdueCount`, `readyCount`).
- All commands exist on the detail page only: next-status button, `Encaisser un acompte`, `Terminer`, `Annuler` (with Rembourser / Conserver en avoir per `OD-008`). `READY → PREPARING` is allowed by the backend but never offered.
- Editor: the unit price field is editable but `OrderInput` sends only `productId` and `quantity`; the backend always prices from the catalogue ([orders.service.ts:1032](../backend/src/modules/orders/orders.service.ts#L1032)). The edited price is silently lost. Either send it (snapshot, `ORD-002` allows "commercial payment parameters") or make the field read-only.
- Backend messages without accents: "n'est pas autorise", "credit client", "aucune avance a traiter" (lines 385, 820, 828).
- Indexes: none on `createdAt` / `totalTnd` (both sortable); no `(customerId, requestedFulfillmentAt)`; `CustomerOrderAdvance` has no `(orderId, paidAt)`.
- `DataTable` `loading` includes `isFetching`, so every background refetch flashes the loading state.

## Proposed change

### PR 1 · `fix/commandes-completion-and-filters` (no migration)

- Completion: frontend always sends `paidAmountTnd`; backend schema makes it required (`z.string()`, non-negative money); service drops the `?? total − advance` fallback. Test: completing with `"0.000"` leaves the remainder as receivable and creates no `SalePayment`.
- `listOrders`: compose `requestedFulfillmentAt` bounds from `dueState` **and** `dueBefore`/`dueAfter` (intersection). Frontend: the "Du/Au" range narrows the tab instead of replacing it. Add a backend unit test for `dueState + dueBefore` and make the msw handler mirror the real composition.
- Remaining amount: the API returns `remainingDueTnd` per order computed server-side (`total − advances received` while open; `sale.remainingDueTnd` when completed; `0` when cancelled) and `advanceReceivedTnd` (sum of RECEIPT advances, unaffected by the reset). The list and the detail read those instead of `remainingOf`.
- Deposit dialog: gate the button on both permissions; cap the amount at `total − advanceBalance` in `advanceSchema` with the inline message; deposit wording ("Reste à verser", "Verser le reste", no presets); send `paidAt` as an ISO instant; explain the disabled state without a session; align the mock status code (400).
- Accents in the three backend messages; add the `READY → PREPARING` action as a secondary "Reprendre la préparation".
- Editor price: decide (owner) between sending the price or locking the field; default proposal: lock the field and show the catalogue price, since the backend snapshots the catalogue price today.

### PR 2 · `feat/commandes-kpis-row-actions`

Backend

- `GET /orders/summary` with the list's filters: `{ count, byStatus: { DRAFT, CONFIRMED, PREPARING, READY, COMPLETED, CANCELLED }, totalTnd, advanceReceivedTnd, remainingTnd, overdueCount, dueTodayCount }` from `groupBy(status)` + `aggregate`; permission `orders.view`. Add `q` on `GET /orders` (reference prefix, customer name). Indexes `(customerId, requestedFulfillmentAt)` and `CustomerOrderAdvance (orderId, paidAt)`.

Frontend

- Period control from issue 001 applied to `requestedFulfillmentAt` (default `Aujourd'hui`), kept together with the status tabs: the tab is the status dimension, the period is the date dimension, both in the URL.
- KPI row: `Commandes` (count), `À livrer aujourd'hui`, `En retard`, `Montant` (totalTnd), `Acomptes reçus`, `Reste à encaisser`.
- Row actions in the table and the phone card, permission-gated, using the same dialogs as the detail page (they already exist: `AdvanceDialog`, `CompleteOrderDialog`, `CancelOrderDialog`): `Voir`, `Modifier` (DRAFT/CONFIRMED), `Statut suivant` (Confirmer / En préparation / Prête), `Encaisser un acompte`, `Terminer`, `Annuler`. Completed and cancelled rows keep only `Voir`.
- After a row action the row updates in place (`useInvalidateAfter("order")` already covers the list).

### Tests

- Backend: the three bug tests above; summary endpoint; search; `READY → PREPARING` route.
- Frontend: `OrdersPage.test.tsx` gains the row-action flows at 360 and 1280 px, the KPI/filters consistency, and an `AdvanceDialog` test (cap, wording, permission gating). Existing tests at lines 59, 115, 185, 230 are updated for the new `remainingDueTnd` fields.

## Acceptance criteria

- Completing an order with nothing paid leaves `total − advance` on the customer's account and adds nothing to the till.
- The "Aujourd'hui" tab shows only orders due today; "À venir" only after today; a "Du/Au" range narrows the tab.
- A completed order shows Reste = the linked sale's remaining due; a cancelled order shows Reste 0.
- KPI count equals the number of rows for the same filters; KPI `remainingTnd` equals the sum of the "Reste" column.
- Every action available on the detail page is available from the list row with the same dialog and the same permission.
- The deposit form refuses an amount above the remaining total inline, in French, before any request.

## Open decisions to respect

- `OD-007`: no hard stock reservation on orders.
- `OD-008`: cancellation with an advance keeps the explicit Rembourser / Conserver en avoir choice.
- `ORD-016`: total advances never exceed the order total (already enforced server-side, now also in the form).
