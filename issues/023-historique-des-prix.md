# 023 · Prix: the prices paid and the sale prices of an item, read over time; a purchase never sets the cost

| Field            | Value                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Module           | `backend/src/modules/catalog`, `backend/src/modules/procurement`, `frontend/src/features/catalog` |
| Type             | Change                                                                                            |
| Priority         | Highest (corrects a rule of 019 before it ships)                                                  |
| Depends on       | 019 (resold products and their purchases)                                                         |
| Suggested branch | `feat/023-historique-des-prix`                                                                    |
| Related          | `DEC-V2-005` (the cost is the owner's figure), `DEC-V2-010` point 3 (superseded)                  |

## Owner's request

> When we purchase a resold product, its cost is updated with the unit price of the last purchase. That is wrong: never update the cost automatically. Instead keep track of two things, the purchase price of the resold products and of the raw materials, and give a page where the user sees the variation of the purchase price and of the sale price for a resold product, and the variation of the purchase price alone for a raw material.

## Findings

- Issue 019 made posting a purchase set `approximateCostTnd` of each resold product to the price just paid (`postPurchaseWith`, `DEC-V2-010` point 3). The owner refuses it: the cost stays the figure typed on the product, as `DEC-V2-005` said.
- The prices paid already exist: every posted purchase line keeps `unit_price_tnd` per base unit, the quantity and the date of its purchase. Nothing reads them per item over time except the aggregate of the `Achats` analysis (first and last price of a period).
- The sale price of a product is overwritten on each edit; its past values survive only in the audit trail, which is not a series a page can draw.

## Proposed change

### Backend

1. **No automatic cost.** Posting a purchase no longer touches the product; the audit action `product.cost_from_purchase` disappears.
2. **Sale price history.** A table `product_sale_price_history` (product, price, effective at, actor). One row when a product is created, one more each time its sale price changes. Backfilled with the current price of every existing product, dated by its last update.
3. **Two reads.** `GET /catalog/products/{id}/price-history` (`products.view`): the current sale price, every sale price it had, and, with `purchases.view`, every posted purchase line of the product (date, supplier, purchase, quantity, price per base unit), oldest first; `null` without it. `GET /catalog/raw-materials/{id}/price-history` (`raw_materials.view` and `purchases.view`): the same purchase points for a raw material.

### Frontend

- A tab `Prix` on the page of a resold product: the current sale price (with the gap to the last price paid, with `margin.view`), the last price paid and its change since the first, a chart of the price paid at each purchase with the sale price in force that day, the table of sale prices, the table of purchases linked to each purchase.
- The same tab on a raw material (with `purchases.view`): last price paid, its change, the chart, the table.
- The cost field of the product form no longer claims to follow purchases.

## Tests

- Backend: posting leaves the cost and the product untouched; the first price recorded with the product; a point added when the price changes and none when it does not; the two reads with and without the purchases; the routes and their permissions.
- Frontend: the tab on a resold product (tiles, gap, chart with both series, both tables, links), the sale prices alone when the purchases are withheld, the tab on a raw material, no tab without `purchases.view`.

## Acceptance criteria

- Buying 24 bottles at 0,850 leaves the product's cost as it was; the `Prix` tab of the product shows 0,850 as the last price paid, the change since the first purchase, and the sale price beside it.
- Changing the sale price adds a line to the tab's sale price table.
- The `Prix` tab of flour shows how its price moved, purchase after purchase.

## Decisions surfaced

- `DEC-V2-013` (new): a purchase never changes a product's cost; sale prices are kept as they change; the prices paid are read from the purchases. Supersedes point 3 of `DEC-V2-010`.
