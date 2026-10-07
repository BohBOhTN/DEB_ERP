# Change 023: a `Prix` tab with the prices paid and the sale prices; a purchase never sets the cost

## Branches

- Source: `feat/023-historique-des-prix` (from `feat/022-kpi-total-charges`)
- Target: `dev`, after pull requests 019 to 022

## Scope

Closes issue 023 ([issues/023](../issues/023-historique-des-prix.md)):
the owner refused the rule of issue 019 that set a resold product's cost
to its last purchase price. The cost is the owner's figure again; the
prices paid and the sale prices are kept and read over time on a `Prix`
tab. Decision `DEC-V2-013`, superseding point 3 of `DEC-V2-010`. Fifth of
the stacked branches.

## Summary

- **No automatic cost.** Posting a purchase no longer touches the product;
  the audit action `product.cost_from_purchase` is gone. The cost field's
  hint no longer claims to follow purchases.
- **Sale price history.** One additive migration creates
  `product_sale_price_history` and backfills one row per existing product
  with its current price, dated by its last update. A product is created
  with its first price; a change of its sale price adds a row; an update
  that keeps the price adds none.
- **Two reads.** `GET /catalog/products/{id}/price-history`
  (`products.view`): the current sale price, every sale price it had and,
  with `purchases.view`, every posted purchase line of the product
  (date, supplier, purchase, quantity, price per base unit), oldest
  first, `null` without it. `GET /catalog/raw-materials/{id}/price-history`
  (`raw_materials.view` and `purchases.view`): the purchase points of a
  raw material.
- **`Prix` tab.** On a resold product: the current sale price with the gap
  to the last price paid (`margin.view`), the last price paid and its
  change since the first, a chart of the price paid at each purchase with
  the sale price in force that day, the table of sale prices, the table
  of purchases linked to each purchase. On a raw material, with
  `purchases.view`: the last price paid, its change, the chart, the table.

## Out of Scope

- An average or weighted cost; the cost stays typed by the owner.
- A price history for products made here (the API serves it; the tab is
  shown on resold products, as asked).

## Verification

Run locally on macOS, Node 24, on 2026-10-07:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend (contract and API
  types regenerated)
- `npm run test --workspace backend`: 495 passed, 19 skipped (65 files, the six database-backed suites skipped here). New and updated:
  posting leaves the cost and the product untouched; the first price
  recorded with the product; a point added when the price changes and
  none when it does not; the two reads with and without the purchases;
  the routes and their permissions
- `npm run test --workspace frontend`: 318 passed (100 files). New: the tab on a
  resold product (tiles, the gap, the chart with both series, both tables
  and their links), the sale prices alone when the purchases are
  withheld, the tab on a raw material, no tab without `purchases.view`
- `npm run build`: passed; 202.0 kB gzip initial against 250 kB; POS route 14.3 kB against 120 kB
- Playwright on the system Brave browser, mocked API, 360, 768 and
  1280 px: the catalogue and stock, purchase and trip specs: 18 passed
- The migration matches the SQL Prisma derives from the schema change,
  plus the backfill
- Not run here (no local PostgreSQL): the database-backed suites and the
  migration with its backfill against a real database. Both run in CI

## Database and Migration Impact

One additive migration: a new table with its index and foreign key, and
a backfill of one row per product. No existing row is changed.

## Environment Impact

None.

## Risks and Follow-Up

- The backfilled point of an existing product is dated by its last
  update, not by the day its price was really set: the history is exact
  from this release on.
- Stacked on 019 to 022; the brief of 019 (`prs/056`) notes the
  withdrawn rule.

## Merge Checklist

- [ ] CI passed, including the migration on the CI database
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue 023
- [ ] Pull requests 019 to 022 merged first; target branch is `dev`
