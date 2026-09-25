# 003 · Caisse: card selection, stay on the till after a sale, drop the payment mode

| Field            | Value                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- |
| Module           | `frontend/src/features/pos`, `backend/src/modules/pos` (one route guard)                |
| Type             | UX change + 2 bugs                                                                      |
| Priority         | High (daily cashier flow)                                                               |
| Suggested branch | `fix/caisse-tile-selection-flow`                                                        |
| Related          | `UX-013`, `OD-014` / `OD-V2-012` (cash only), spec `07_SCREEN_INVENTORY_AND_IA.md` §4.6 |

## Owner's request

> While I pick up the product I have to click on the name of the product so it's selected. What I want is selecting the product card, that way the product is selected; after the product is selected the + and − buttons work well.
> After validating the sale I do not want to take the user to the validated sale page, instead I want to stay on the Caisse page so the user can make other sales.
> Remove the "Mode de paiement" from the UI since we only use cash.

## Findings

### 1. Only the product name is clickable

- [ProductGrid.tsx:37-55](../frontend/src/features/pos/components/ProductGrid.tsx#L37-L55): the card is a `div role="listitem"` with no handler; the only interactive element is `<button className={styles.tileName} onClick={() => onAdd(product)} aria-label="Ajouter {name}">`. The price line and the empty space are dead.
- [PosComponents.module.css:48-61](../frontend/src/features/pos/components/PosComponents.module.css#L48-L61): `.tile` has `cursor: pointer` on the whole card, so it looks clickable but is not. `.tile:focus-visible` (84-87) can never apply because a `div` is not focusable.
- The stepper (62-82) only renders once the product is in the cart and works correctly through `cart.increment(productId, ±1)` ([cart.store.ts:84-96](../frontend/src/features/pos/cart.store.ts#L84-L96)). Nothing to change there.
- The spec already says "tile tap adds one; `+`/`−` on the tile adjusts" (§4.6).

### 2. Success navigates to the receipt page

- [CaissePage.tsx:310-320](../frontend/src/features/pos/pages/CaissePage.tsx#L310-L320): after `postSale` succeeds the page toasts "Vente enregistrée", clears the cart and calls `navigate("/caisse/ventes/" + sale.id)`. The receipt page ([SaleDetailPage.tsx](../frontend/src/features/pos/pages/SaleDetailPage.tsx)) then needs a "Nouvelle vente" click to come back.
- The order branch navigates to `/commandes/:id` (line 325). The owner's request concerns the sale; the order navigation is reasonable to keep since an order is a document the cashier may need to check, but it should be confirmed.

### 3. "Mode de paiement" is a disabled one-option select

- Rendered only by the shared [PaymentBox.tsx:74-81](../frontend/src/components/patterns/PaymentBox/PaymentBox.tsx#L74-L81) (`FormField "Mode de paiement"` + `Select` with the single option "Espèces", `disabled` because the till never passes `onMethodChange`). Used by the till through [CheckoutPanel.tsx:168-173](../frontend/src/features/pos/components/CheckoutPanel.tsx#L168-L173) and by every payment dialog (customers, suppliers, distributors, order advance, order completion).
- The backend does not accept a method on `POST /pos/sales` ([pos.routes.ts:70-84](../backend/src/modules/pos/pos.routes.ts#L70-L84)); `SalePayment.method` defaults to `CASH` from the enum `PaymentMethod { CASH }` ([schema.prisma:424-427](../backend/prisma/schema.prisma#L424-L427)). Removing the control is purely frontend and consistent with `OD-V2-012`.

### 4. Bugs found alongside (not requested)

- **Fully paid sales rejected without `pos.credit_sale`.** `assertCreditSalePermission` at [pos.routes.ts:293-312](../backend/src/modules/pos/pos.routes.ts#L293-L312) returns 403 whenever `paidAmountTnd` is present, whatever its value. The till always sends it ([SaleConfirmDialog.tsx:145-147](../frontend/src/features/pos/components/SaleConfirmDialog.tsx#L145-L147)), so a cashier with `pos.sell` only cannot post any sale. Hidden because the seeded "Caissier" role and every test grant `pos.credit_sale`. The check must compare `paidAmountTnd` with the computed total and require the permission only when a remainder exists (the service already computes `remainingDueTnd`; move the check there or compute the total in the route).
- **Enter hijacks focused buttons.** The Enter hotkey at [CaissePage.tsx:106-110](../frontend/src/features/pos/pages/CaissePage.tsx#L106-L110) adds the first visible product and calls `preventDefault` on every keydown while no dialog is open ([useHotkeys.ts:20-40](../frontend/src/lib/hooks/useHotkeys.ts#L20-L40)). Pressing Enter on a focused tile, `+`, `−`, "Encaisser" or "Vider le panier" adds the first product instead of activating the button. Limit the Enter shortcut to the search input.
- **Escape empties the cart without confirmation** (line 121) even while typing in the amount field; "Vider le panier" has no confirmation either.
- **Product grid limited to one page of 60 products** ([CaissePage.tsx:58-67](../frontend/src/features/pos/pages/CaissePage.tsx#L58-L67)); category chips are built from those 60 only. Fine today, will break silently once the catalogue grows. Log as a follow-up, not in this branch.
- Cart lines snapshot `unitPriceTnd` when added while the backend prices from the current product; a price change with items in the cart makes the preview total differ from the posted total. The confirm dialog shows the server total, so this is cosmetic. Follow-up.
- `customerRef` in `CheckoutPanel.tsx:128` is unused; F2 uses `document.querySelector`. Cosmetic.

## Proposed change

### Frontend

1. `ProductGrid`: make the whole tile the add target.
   - Render the tile as a `<button type="button" className={styles.tile} aria-label="Ajouter {name}">` containing the name and price, with the stepper rendered as a sibling inside a wrapper `div` (a button cannot contain buttons). Stepper clicks call `stopPropagation` so `+`/`−` never also add.
   - Keep the `role="list"` / `listitem` container semantics on the wrapper.
   - `.tile:focus-visible` now applies; keep the 44 px minimum height; remove `cursor: pointer` from the wrapper.
   - Keep the aria-labels "Ajouter {name}", "Ajouter un {name}", "Retirer un {name}" unchanged so the existing tests and the seeded demo keep working.
2. Success handling: no navigation after a sale. Keep the toast (reference · total · reste), clear the cart, refocus the search input. Add a "Voir" action on the toast that opens `/caisse/ventes/:id` for the rare case the cashier wants the receipt. The credit and cash flows both stay on `/caisse`.
3. `PaymentBox`: remove the method `FormField` and the `method` / `onMethodChange` props; delete `fr.paymentMethod` only if no other screen uses it (the receipt "en espèces" text stays). The data model keeps `PaymentMethod`.
4. Hotkeys: Enter adds the first product only when the search input has focus; Escape clears the cart only when the cart is empty or after a `ConfirmDialog`; "Vider le panier" asks for confirmation when the cart has more than one line.

### Backend

- Fix `assertCreditSalePermission` so that only a sale with a remaining balance needs `pos.credit_sale`. Add a route test: `pos.sell` alone posts a fully paid sale (201) and is refused for a partial one (403).

### Tests to update

- [CaissePage.test.tsx](../frontend/src/features/pos/CaissePage.test.tsx): the `addProduct` helper still clicks "Ajouter {name}" (now the tile button); the assertions at 134-138, 174-196 and 285-289 that expect the receipt `h1` after a sale become "the toast is shown, the cart is empty, the page is still the till"; the close-session flow is unchanged.
- [frontend/e2e/caisse.spec.ts](../frontend/e2e/caisse.spec.ts) lines 61-65 and 85-92: same change.
- `e2e-seeded/demo.spec.ts` 123-133: parked by owner decision; update the labels only if the seeded run is executed again.
- New test: Enter on a focused tile activates that tile, not the first product.
- Backend: `pos.routes.test.ts` new cases for the permission fix.

## Acceptance criteria

- Tapping anywhere on a product card adds one unit; the stepper appears and `+`/`−` adjust without adding; keyboard users can Tab to a card and press Enter or Space.
- After "Valider", the cashier is still on `/caisse` with an empty cart, the search focused and the toast visible; a second sale can start immediately.
- No "Mode de paiement" control anywhere in the till or the payment dialogs; every posted payment still stores `CASH`.
- A user with `pos.sell` but without `pos.credit_sale` can post a fully paid sale and is refused a partial one with the existing French message.
- Phone flow (360 px) and desktop flow both covered by the updated tests.

## Open decisions to respect

- `OD-014` / `OD-V2-012`: cash only in the UI; the enum stays extensible.
- `OD-013`: no printed receipt; the receipt page remains reachable from `/caisse/ventes` and from the toast action.
