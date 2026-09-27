# 013 · After the demo: Accueil, product page, customers refresh, stock pickers

| Field            | Value                                                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module           | `frontend/src/features/home`, `frontend/src/features/catalog`, `backend/src/modules/simulation`, `frontend/src/lib/query`, `frontend/src/components/ui/Combobox`, `frontend/src/features/inventory` |
| Type             | Fixes                                                                                                                                                                                               |
| Priority         | Medium                                                                                                                                                                                              |
| Depends on       | —                                                                                                                                                                                                   |
| Suggested branch | `fix/post-demo-retouches`                                                                                                                                                                           |
| Related          | issues 002 (#42), 008 (#48), 007 (#47), `07` §4.2 (stock dialogs)                                                                                                                                   |

## Owner's request

> Put the expenses KPI next to the other KPIs on the home page. The product page shows the last simulation created; it must show the last simulation linked to this product. The customer table is not refreshed after a payment. On the stock page and in the opening-stock and adjustment dialogs the product dropdown cannot scroll; and inside the product page the adjustment dialog lets me pick another product, which makes no sense: disable that dropdown.

## Findings

### Accueil

- The expenses figure is a `Card` in the third row next to the recent activity ([AccueilPage.tsx](../frontend/src/features/home/AccueilPage.tsx), `ExpensesTile`), while the four money figures are `KpiTile`s in `KpiRow`. Same period, same shape of data (`dayTnd`, `previousDayTnd`), different place.

### Product page

- The "Dernière simulation" line reads `useSimulations({ targetProductId, sort: updatedAt desc, pageSize: 1 })` ([ProductDetailPage.tsx](../frontend/src/features/catalog/pages/ProductDetailPage.tsx)), but the API's list query accepts no `targetProductId`: `pageQuerySchema` has page, size and sort only ([simulation.routes.ts:49](../backend/src/modules/simulation/simulation.routes.ts#L49)) and `listSimulations` filters nothing ([simulation.service.ts:46](../backend/src/modules/simulation/simulation.service.ts#L46)). The frontend sends a parameter the server ignores, so the line shows the latest simulation of the whole bakery. Issue #48 shipped this without a test on the filter.

### Customers refresh

- A règlement raises `customer.payment`, whose roots are `customers`, `posSession` and `home` ([invalidation.ts](../frontend/src/lib/query/invalidation.ts)). Every customer query sits under `customers`, so the list and the page refresh; what does not is the **sales** list: a règlement settles sales (issue #47), but `posSales` and `posSale` are not in the event's roots, so "Encaisser le reste" from the Ventes list leaves the row at its old `Reste` until the next focus. The same gap exists for `procurement.payment` (purchases) and `distribution.payment` (distributor sales and settlements are under `distribution`, which is refreshed; purchases are under `procurement`, refreshed). To confirm on the customers list itself: the list's `staleTime` of thirty seconds does not block an invalidation; if the owner saw a stale customer row, the dialog was opened from a page whose list is not mounted (the payment dialog on the Ventes list), which the fix above covers. To be reproduced during the fix with the browser flow.

### Stock pickers

- The item picker is a Radix `Popover` in a `Portal` inside a modal `Dialog` ([Combobox.tsx](../frontend/src/components/ui/Combobox/Combobox.tsx), [Dialog.tsx](../frontend/src/components/ui/Dialog/Dialog.tsx)). The dialog's scroll lock (`react-remove-scroll`, installed by Radix for a modal dialog) swallows wheel and touch scrolling on everything outside the dialog's content node, and the portaled list is outside it. The list has `max-height: 280px; overflow-y: auto` and scrolls fine on pages without a dialog. Every picker inside a dialog is affected (stock opening and adjustment, direct sale, règlements with a party picker), not only the stock ones.
- The adjustment dialog opened from a product page receives the product as `item` but keeps the picker enabled ([ProductDetailPage.tsx:209](../frontend/src/features/catalog/pages/ProductDetailPage.tsx#L209), [StockMovementDialog.tsx](../frontend/src/features/inventory/components/StockMovementDialog.tsx)); it also passes `currentQuantity: "0"`, so the confirmation says the stock "passera de 0 à …" whatever the real balance.

## Proposed change

1. **Accueil**: the expenses figure becomes a `KpiTile` in `KpiRow` ("Dépenses du jour" / "d'hier", the day-before delta, the count as note), placed after the sales tiles; the third-row card is removed; the grid takes five tiles on desktop (three plus two on tablets).
2. **Simulations by product**: `targetProductId` in the list query (route schema and service `where`), a route test, and the product page line reads the filtered list; the `sort` by `updatedAt desc` is already the default.
3. **Invalidation roots**: `customer.payment` gains `posSales` and `posSale`; a test in `invalidation.test.ts`; the Ventes flow test asserts the row's `Reste` after "Encaisser le reste".
4. **Pickers in dialogs**: the combobox content scrolls inside a modal dialog. Preferred fix: render the popover content without a portal when the combobox sits inside a dialog (Radix `Popover.Portal` with `container` set to the dialog's content node, exposed through a small context by `Dialog`), so the scroll lock treats it as part of the dialog; fallback: `onWheel` / `onTouchMove` stop-propagation on the list plus `data-scroll-lock-scrollable`. Verified by a browser test that scrolls the list inside the opening-stock dialog on the phone project.
5. **Locked item**: `StockMovementDialog` gets `lockItem` (the picker rendered read-only as a labelled value when the item is preset from a detail page) and the product page passes the real balance from `useBalances` instead of `"0"`.

## Acceptance criteria

- Accueil shows five tiles in one row on desktop, the expenses one following the period control like the others.
- A product page shows the latest simulation whose target is that product, or nothing; another product's simulation never appears.
- After "Encaisser le reste" on the Ventes list, the row's `Reste` and `État` update without a focus or a reload.
- In the opening-stock dialog on a phone and on a desktop, the product list scrolls with the wheel and with a finger.
- The adjustment dialog on a product page shows the product as fixed text, no picker, and its impact line starts from the real balance.
