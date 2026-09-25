# Fix #43: Caisse, card selection, stay on the till, no payment mode

## Branches

- Source: `fix/43-caisse-tile-selection-flow` (stacked on `fix/47-payments-document-state`)
- Target: `dev`

## Scope

Closes issue #43 ([issues/003](../issues/003-caisse-selection-and-flow.md)):
the whole product card adds the product, the cashier stays on the till
after a sale, the "Mode de paiement" control disappears since cash is the
only method (`OD-V2-012`), and two defects found on the way are fixed: a
cashier without `pos.credit_sale` could not post even a fully paid sale, and
Enter on a focused tile or button added the first product of the grid
instead of activating that button.

## Summary

- `ProductGrid`: the name and price are one button filling the tile above
  the stepper, with the accessible name `Ajouter {produit}` unchanged; the
  focus ring outlines the card; the stepper keeps its own `+` and `−`.
- `CaissePage`: after `Valider` the cart is emptied, the search field takes
  focus on desktop and the toast `Vente enregistrée` carries a `Voir`
  action that opens the receipt; no navigation. Orders still open their
  page. `Vider le panier` and the Escape shortcut ask for confirmation when
  the cart has several lines. The Enter shortcut adds the first match only
  from the search field (`useHotkeys` gains a `when` guard).
- `PaymentBox`: the method select and its props are removed from the till
  and from every payment dialog; the receipt still reads `en espèces`; the
  `PaymentMethod` enum stays for a later method.
- Backend: `POST /pos/sales` passes `creditAllowed` (whether the user holds
  `pos.credit_sale`) to the service, which refuses only a sale that leaves a
  remainder; a fully paid sale posts with `pos.sell` alone.

## Out of Scope

- The product grid's single page of sixty products and the category chips
  built from it; the price snapshot kept in the cart while the server prices
  from the catalogue (both noted in the issue as follow-ups).
- The receipt page and its `Nouvelle vente` button, kept as they are.

## Verification

Run locally on macOS, Node 24, on the stacked branch (so the #47 changes are
included):

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 337 passed, 10 skipped (48 files);
  new: a cashier without the credit permission posts a paid sale and is
  refused a partial one; the route passes `creditAllowed` to the service
- `npm run test --workspace frontend`: 203 passed (87 files); the phone
  flow now checks that the till stays open with an empty cart and a `Voir`
  action; the retry test opens the receipt from the toast; new test: the
  tile is the add button, Enter on a focused tile adds that product, Enter
  in the search adds the first match, no `Mode de paiement` control,
  `Vider le panier` asks first
- `npm run build`: passed; initial JavaScript 200.1 kB gzip against the
  250 kB budget; POS chunk 11.7 kB
- `npx playwright test e2e/caisse.spec.ts` on the system Brave browser
  (`E2E_BROWSER`): 3 passed (360, 820 and 1280 px)
- `e2e-seeded/demo.spec.ts` updated for the new flow but not run (parked by
  owner decision)

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- The demo seed's cashier role and every test grant `pos.credit_sale`, so
  the permission fix is proven by unit tests only.
- Radix toasts stay mounted a few seconds; the tests target the newest
  `Voir` action.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue #43
- [ ] Target branch is `dev`
