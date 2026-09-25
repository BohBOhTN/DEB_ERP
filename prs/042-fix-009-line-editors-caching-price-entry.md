# Fix #49: cached pickers, editable and total-based prices, a direct-sale quick action

## Branches

- Source: `fix/line-editors-caching-price-entry` (stacked on `feat/48-products-cost-margin`)
- Target: `dev`

## Scope

Closes issue #49 ([issues/009](../issues/009-lignes-cache-et-saisie-des-prix.md)):
the product and raw-material pickers stop calling the API on every
opening, the direct distributor sale takes an edited unit price that can
never fall below the product's approximate cost, every editable line
accepts a typed line total, and Accueil gains a `Vente directe
distributeur` quick action. Commits carry `(#49)`.

## Summary

- **One cached picker loader.** `useCachedSearch(root, fetch)` reads a
  picker's page for a query through the query client at the `reference`
  tier (30 minutes, kept for the session, never refreshed on focus) under
  a root the invalidation map already refreshes: `catalog/products`,
  `catalog/rawMaterials`, `pos/products`. A second opening, a second line
  or another screen reads memory; a product or raw-material write
  refreshes it. The empty query is prefetched when the editor mounts, so
  the first opening is instant. Adopted by the order and direct-sale
  lines, the purchase lines, the stock and simulation item picker and the
  simulation's target product picker. The stock balance shown next to an
  item is applied after the read, so it stays live.
- **Direct sale.** `OrderLineEditor` gains `priceEditable`, a `catalog`
  source and an `onProductChange` callback. The direct-sale dialog reads
  the catalogue list (which carries the cost for callers with
  `margin.view`), lets the price be edited, and refuses a line priced
  below its product's cost inline before the confirmation. The server
  refuses it too: `DISTRIBUTOR_PRICE_BELOW_COST` in `buildSaleLines`, so
  a caller who cannot see the cost is still stopped.
- **Total-based entry.** When the price is editable, the line total is an
  input: a typed total sets the unit price to total ÷ quantity (÷ the
  unit's factor to base on purchases, where the price is per base unit),
  three decimals; a typed price or quantity recomputes the total; leaving
  the total field shows the stored total. The price cell now prints its
  validation message under the input.
- **Layout.** The line editor lays itself out by its container, not the
  viewport: a wide container (a page next to the sidebar, the direct-sale
  dialog on a desktop) shows one row per line under a header row with
  fraction-based columns that always fit; a narrow one shows one card per
  line with a visible label on every field, quantity and unit on one row,
  unit price and line total on the next, and the remove button in the
  card's corner. One guidance line under the lines says that the unit
  price or the line total can be typed and the other is derived. The four
  editor pages (purchase, order, dispatch, simulation) give their grid an
  explicit column and the totals card wraps its rows, so a wide amount no
  longer widens the page by a pixel on a 360 px phone.
- **Accueil.** `Vente directe distributeur` (`distribution.direct_sale`)
  opens `/distributeurs?vente=directe`; the distributors page opens the
  dialog for that parameter and gains a `Vente directe` header button.

## Out of Scope

- An edited price at the POS till (`POS-*` prices from the catalogue).
- Preloading whole catalogues; the cache is per query, one page of eight.

## Verification

Run locally on macOS, Node 24, on the stacked branch:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 364 passed, 10 skipped (50 files);
  new `distribution.service.pricing.test.ts`: a price below the cost is
  refused and nothing is posted, a price equal to the cost is accepted and
  snapshotted, any price is accepted when the product has no cost
- `npm run test --workspace frontend`: 217 passed (90 files); new:
  `LineEditor` derives 2,000 from a typed total of 100 over 50 and takes
  the total back to quantity × price; a purchase of 4 sacs (200 kg) typed
  at 250,000 gives 1,250 per kg and opening the picker of a second line
  makes no raw-material request; a direct sale from the quick-action URL
  refuses 0,500 against a 0,900 cost inline, then takes a typed total of
  10,000 over 4 as 2,500 and posts; the Accueil action links to the
  distributors page
- `npm run build`: passed; initial JavaScript 200.6 kB gzip against the
  250 kB budget; POS chunk 13.1 kB
- Playwright on the system Brave browser (`E2E_BROWSER`), the
  distribution, procurement, expenses and simulation, catalogue and stock
  and shell flows and the axe scans at three widths: 109 passed, 2
  skipped by design; a new `expectLineEditorFits` assertion runs in the
  purchase flow and in the direct-sale dialog at 360, 768 and 1280 px:
  no overflow of the line or the page, the remove button inside the card,
  field labels only in the card layout and a header row only in the wide
  one

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- A typed total is reproduced only to the millime a three-decimal unit
  price allows (10,000 over 3 stores 9,999); the field shows the stored
  total once left.
- Picker pages are cached for the session; a product renamed by another
  user shows under its old name until this user's own catalogue write or
  a new session. The same trade-off the reference tier already makes for
  units and categories.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue #49
- [ ] Target branch is `dev`
