# Fix #66: after the demo, Accueil, product page, customers refresh, stock pickers

## Branches

- Source: `fix/66-post-demo-retouches` (stacked on `fix/65-orders-detail-figures`)
- Target: `dev`

## Scope

Closes issue #66 ([issues/013](../issues/013-retouches-apres-demo.md)): five
retouches noted at the client demo.

## Summary

- **Accueil**: the expenses figure is a `KpiTile` in the KPI row ("Dépenses
  du jour" / "d'hier", the day-before delta with a rise shown as bad, the
  validated count as note); the third-row card is gone; five or six tiles
  lay out as two rows of three.
- **Simulations by product**: `GET /cost-simulations` accepts
  `targetProductId`; the service filters and counts on it; the product
  page's "Dernière simulation" is therefore the latest simulation whose
  target is that product. Issue #48 had sent the parameter without the
  server honouring it.
- **Invalidation**: `customer.payment` also refreshes `pos/sales` and
  `pos/sale`, so "Encaisser le reste" on the Ventes list updates the row's
  `Reste` and `État` and the receipt without a focus.
- **Pickers in dialogs**: the combobox popover is modal, so its own scroll
  lock is the active one and its list scrolls with the wheel and a finger
  inside a modal dialog (the dialog's lock swallowed those events on the
  portaled list).
- **Locked adjustment**: `StockMovementDialog` gains `lockItem`; the
  product page opens it with the product shown as a read-only field and
  the real balance from the inventory query, so the confirmation starts
  from the true quantity instead of 0.

## Out of Scope

- The customers list itself after a payment: every customer query already
  sat under the refreshed root; the stale rows the owner saw were the sales
  ones, covered above.

## Verification

Run locally on macOS, Node 24:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend (generated types
  regenerated for the new list parameter)
- `npm run test --workspace backend`: 364 passed, 10 skipped; new: the
  list route passes `targetProductId` to the service
- `npm run test --workspace frontend`: 223 passed (92 files); new: the
  product page shows the simulation of its product only and adjusts
  without a picker from the real balance; the invalidation map refreshes
  the sales after a customer payment; Accueil shows the expenses tile with
  its delta in both periods
- `npm run build`: passed; 200.8 kB gzip initial against 250 kB
- Playwright on the system Brave browser: the catalogue and stock flow
  now scrolls the picker list inside the opening-stock dialog with the
  wheel at 360, 768 and 1280 px; the shell flow and the axe scans pass

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- A modal popover blocks page scrolling while a picker is open, like a
  native select; closing it restores it.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue #66
- [ ] Target branch is `dev`
