# 019 · Produits de revente: finished goods bought to be resold, purchased and stocked like raw materials

| Field            | Value                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module           | `backend/src/modules/catalog`, `backend/src/modules/procurement`, `frontend/src/features/catalog`, `frontend/src/features/procurement`                                  |
| Type             | Feature                                                                                                                                                                 |
| Priority         | Highest (020, 021 and 022 build on it)                                                                                                                                  |
| Depends on       | 016 (purchase validation on the fields), 018 (the purchase helpers that run inside a transaction)                                                                       |
| Suggested branch | `feat/019-produits-de-revente`                                                                                                                                          |
| Related          | source of truth §7 (`MST-006`), §9 (`INV-003`, `INV-004`), §10 (`SUP-004`, `SUP-005`, `SUP-009`: a purchase is raw materials only), `DEC-V2-005` (the approximate cost) |

## Owner's request

> We will start buying finished products and selling them back. Today I can add a product, follow its stock, sell it and see its margin, but I cannot record that we bought it: purchases only know raw materials. Add a flag on the product, "resold item". When it is on, the product can be found where we purchase, exactly like a raw material, with its stock movements and adjustments. A resold item is always stock-tracked: the flag turns `isStockable` on. On `Nouvel achat`, the line picker must find both the raw materials and the resold products.

## Findings

### A purchase line is a raw material, by construction

- `PurchaseLine.rawMaterialId` is required and is the only item a line can point to ([schema.prisma:410](../backend/prisma/schema.prisma#L410)); the route schema, the duplicate check, the line builder, the posting and the cancellation all read it ([procurement.routes.ts](../backend/src/modules/procurement/procurement.routes.ts), [procurement.service.ts](../backend/src/modules/procurement/procurement.service.ts): `assertPurchaseInput`, `buildPurchaseLines`, `postPurchaseWith`, `cancelPurchase`).
- Posting writes `PURCHASE_RECEIPT` movements with `itemType: RAW_MATERIAL` only, and the cancellation reverses the same. `InventoryMovement` itself already carries either a `productId` or a `rawMaterialId`, and product stock (opening stock, adjustments, sales) already lives there: the stock side needs no new table.
- The line editor of `Nouvel achat` searches `/catalog/raw-materials` alone and keeps the raw material record on the line for its units ([PurchaseLineEditor.tsx](../frontend/src/features/procurement/components/PurchaseLineEditor.tsx)).

### Nothing says a product is bought rather than made

- `Product` has `isStockable` and nothing else about where it comes from ([schema.prisma:174](../backend/prisma/schema.prisma#L174)). A product has one unit (`baseUnitId`) and no conversions, so a purchase line of a product is entered in that unit.
- The cost used by the margin is `approximateCostTnd`, typed by hand and "never computed" (`DEC-V2-005`). For a resold product the cost is not an estimate: it is what the supplier charged. Left as it is, the owner would retype the price of every purchase on the product to keep the margin right.

### Defects found on the way

- `GET /procurement/purchases?rawMaterialId=` is the only way to find the purchases of an item; a product page cannot show where its stock came from.
- The name of the item on a line is stored in `raw_material_name_snapshot`. The column stays (renaming it would touch every reader for no behaviour); it is documented as the item's name, whichever kind it is.

## Proposed change

### Backend

1. **The flag.** `products.is_resale` (boolean, default false). Create and update take `isResale`; when it is true the product is stored stock-tracked whatever `isStockable` says. The list filters by `isResale`. No backfill: every existing product stays "made here".
2. **Lines of two kinds.** `purchase_lines.product_id` (nullable, restrict) beside `raw_material_id`, which becomes nullable; a check constraint keeps exactly one of the two. A line input carries `rawMaterialId` or `productId`. A product line needs an active product flagged for resale (`ACTIVE_RESALE_PRODUCT_REQUIRED`), is entered in the product's unit (factor 1) and follows the rules of issue 016: one line per item, positive quantity, price and total, every mistake answered on its field.
3. **Posting and cancelling.** A product line receives stock as a `PURCHASE_RECEIPT` movement of the product; a cancellation reverses it. The payable, the payment at posting and the audit are unchanged. The shopping trip of issue 018 inherits all of it through the shared helpers.
4. **The cost follows the purchase.** Posting a purchase sets `approximateCostTnd` of each resold product on it to the unit price just paid (`DEC-V2-010`). Only resold products; a product made here keeps its typed cost. A cancellation does not rewind the cost.
5. **Finding them.** `GET /procurement/purchases` filters by `productId`; the purchase lines answer `productId`.

### Frontend

- **Product form**: a switch `Produit de revente` ("Acheté chez un fournisseur pour être revendu"). When on, `Suivre le stock` is on and locked, and the cost field says it follows the last purchase. The products list shows a `Revente` badge and filters on it; the product page says it and lists its purchases.
- **`Nouvel achat`**: the line picker searches raw materials and resold products together, each option saying which it is; a product line has its single unit; the line header reads `Article`. The posting confirmation lists the stock received for both kinds. The purchase page shows the kind of each line. A user without `products.view` keeps a picker of raw materials only.
- The purchase editor of a draft reloads both kinds.

## Tests

- Backend: the flag forces stock tracking on create and update; the list filter; a product line built in the product's unit; refused when the product is inactive, not for resale, repeated, or carries both ids or none; posting receives product stock and sets the cost, raw-material lines untouched; cancelling reverses it; the purchase filter by product; the routes; the shopping trip with a product line.
- Frontend: the form switch and the locked stock switch; the badge and the filter; the picker offering both kinds without repeats; a mixed purchase posted with its impact; the purchase page; the picker without `products.view`.
- Browser: a mixed purchase at the three widths; axe on the touched pages.

## Acceptance criteria

- A product flagged `Produit de revente` is found on `Nouvel achat`; buying 24 of them posts the purchase, adds 24 to its stock, owes the supplier and sets its cost to the price paid; the next sale shows its margin from that cost.
- A product not flagged is not offered on `Nouvel achat` and is refused by the API.
- Cancelling the purchase takes the 24 back out of stock.

## Decisions surfaced

- `DEC-V2-010` (new): products can be flagged for resale; a purchase line is a raw material or a resold product; a resold product is always stock-tracked; its cost follows its last posted purchase price. Widens `SUP-004`, `SUP-005`, `SUP-009` and `INV-003`, and makes an exception to `DEC-V2-005` ("never computed") for resold products only.
- Left for a later step: purchase units for products (a carton of 24), an average cost instead of the last price, a purchase return document.
