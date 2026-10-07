# Feature 019: Produits de revente, finished goods bought to be resold, purchased and stocked like raw materials

## Branches

- Source: `feat/019-produits-de-revente` (from `main`)
- Target: `dev`

## Scope

Closes issue 019 ([issues/019](../issues/019-produits-de-revente-et-leurs-achats.md)):
the bakery starts buying finished products and reselling them. A product
could already be stocked, sold and costed, but never bought: a purchase
line was a raw material by construction. Decision `DEC-V2-010`. First of
four stacked branches (019 → 020 → 021 → 022); this one also carries the
four issue briefs.

## Summary

- **Schema** (one additive migration,
  `20261007100000_resale_products_on_purchases`): `products.is_resale`;
  `purchase_lines.product_id` beside `raw_material_id`, which becomes
  nullable; two check constraints: a line buys exactly one item, a resold
  product is stock-tracked. Nothing is backfilled.
- **Catalogue.** `isResale` on create, update and the list filter. A
  product flagged for resale is stored stock-tracked whatever the stock
  switch says, on create and on every update.
- **Purchases.** A line carries `rawMaterialId` or `productId`. A product
  line needs an active product flagged for resale
  (`ACTIVE_RESALE_PRODUCT_REQUIRED`), is entered in the product's own
  unit, and follows the rules of issue 016 (one line per item, positive
  quantity, price and total, every mistake on its field). Posting receives
  its stock as a `PURCHASE_RECEIPT` movement of the product; a
  cancellation reverses it. `GET /procurement/purchases` filters by
  `productId`. The shopping trip inherits it through the shared helpers;
  its page keeps raw materials only until issue 020.
- **The cost follows the purchase.** Posting sets `approximateCostTnd` of
  each resold product on the purchase to the unit price just paid.
  **Withdrawn by issue 023 (pull request 060), which the owner asked for
  before this shipped: a purchase never changes the cost.**
- **Product form and pages.** A switch `Produit de revente` that locks
  `Stockable` on and says the cost follows the last purchase; a `Revente`
  badge and an `Origine` filter in the list; the origin and an `Achats`
  tab on the product page.
- **`Nouvel achat`.** The picker searches raw materials and resold
  products together, each option saying which it is, without repeats; a
  product line has its one unit; the column reads `Article`. A user
  without `products.view` keeps the picker of raw materials. A draft
  reloads both kinds. The purchase page marks the resold lines.
- **A unit on every line.** A line that has an item never keeps an empty
  unit: a unit select emptied while its options change falls back to the
  item's base unit.
- **Tests.** The purchasing test double moved to
  `procurement.testDouble.ts`, shared by the trip tests and the new ones.

## Out of Scope

- The third card of `Nouvelle course` (issue 020), the analyses of
  purchases and distributors (021), the KPIs (022).
- Purchase units for products (a carton of 24), an average cost, a
  purchase return document.
- A rename of `raw_material_name_snapshot`: it now holds the item's name,
  whichever kind, and is documented so.

## Verification

Run locally on macOS, Node 24, on 2026-10-06:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings (stylelint included)
- `npm run typecheck`: passed, backend and frontend (contract and API
  types regenerated; `openapi:check` up to date)
- `npm run test --workspace backend`: 474 passed, 16 skipped (63 files, the six database-backed suites skipped here). New: the flag forcing
  stock tracking on create and update and the list filter; a draft mixing
  both kinds; a product refused when made here, inactive or unknown, or
  in another unit; a line with two items, none, or a repeated product
  answered on its field; posting receiving both stocks and setting the
  cost, the product made here untouched; the cost left alone when the
  flag was removed since the draft; cancelling reversing the product
  stock; the purchase filter by product; the routes
- `npm run test --workspace frontend`: 305 passed (100 files). New: the form
  switch locking the stock switch, the badge and the filter; a mixed
  purchase posted with its lines and its page; the picker without
  `products.view` asking nothing of the product list; a refusal of the
  server about a product on its line
- `npm run build`: passed; 201.9 kB gzip initial against 250 kB; POS route 14.3 kB against 120 kB
- Playwright on the system Brave browser (`E2E_BROWSER`), mocked API, 360,
  768 and 1280 px: the purchase specs (a mixed purchase from the picker to the purchase page, the unit of the product shown and sent, the line fitting its card), the trip specs, the catalogue and stock specs and axe on the touched pages: 42 passed
- The migration matches the SQL Prisma derives from the schema change,
  plus the two check constraints
- Not run here (no local PostgreSQL): the database-backed suites and the
  migration against a real database. Both run in CI

## Database and Migration Impact

One additive migration: one boolean column with a default, one nullable
column with its index and foreign key, one column made nullable, two
check constraints. No data change. The previous release keeps working on
the migrated database as long as no product line exists; once one does,
the previous release would read a line without a raw material.

## Environment Impact

None: no new setting, no new dependency, no new permission.

## Risks and Follow-Up

- Rolling the code back after a purchase of a resold product has been
  recorded leaves lines the previous release does not expect
  (`raw_material_id` null). Roll forward instead.
- The cost of a resold product is its last purchase price, not an
  average: two purchases at different prices change the margin of the
  stock bought earlier.
- Issues 020, 021 and 022 are stacked on this branch.
- UX checklist screenshots: waived (owner's decision): the line editor's
  fit is asserted at the three widths and axe runs on the touched pages.

## Merge Checklist

- [ ] CI passed, including the migration on the CI database
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue 019
- [ ] Target branch is `dev`
