# 008 · Produits: approximate cost per product and an approximate margin KPI on Accueil

| Field            | Value                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module           | `backend/src/modules/catalog`, `backend/src/modules/home`, `backend/src/modules/pos`, `frontend/src/features/catalog`, `frontend/src/features/home`                              |
| Type             | Feature                                                                                                                                                                          |
| Priority         | Medium                                                                                                                                                                           |
| Depends on       | 002 (the period control of Accueil), 004 (cancelled sales are excluded from every aggregate)                                                                                     |
| GitHub issue     | #48                                                                                                                                                                              |
| Suggested branch | `feat/48-products-cost-margin`                                                                                                                                                   |
| Related          | source of truth §1 ("profitability" deferred), §16 (`SIM-006` snapshots, `SIM-010` margin needs separate approval), `OD-V2-001` (operational home only), spec §4.9 margin helper |

## Owner's request

> Add the approximate cost of each product on the product page. This way we can calculate the approximate profits based on the products we sell. Add the KPI to the home screen.

## Findings

### Nothing stores a product cost today

- `Product` has a sale price and no cost field ([schema.prisma:174](../backend/prisma/schema.prisma#L174)); the form, the list and the product page show the sale price only ([ProductFormDialog.tsx:145](../frontend/src/features/catalog/components/ProductFormDialog.tsx#L145), [ProductsPage.tsx:77](../frontend/src/features/catalog/pages/ProductsPage.tsx#L77), [ProductDetailPage.tsx:97](../frontend/src/features/catalog/pages/ProductDetailPage.tsx#L97)).
- The only cost figure in the system is a saved cost simulation: `costPerOutputUnitTnd` on `CostSimulation`, optionally tied to a `targetProductId` ([schema.prisma:1171](../backend/prisma/schema.prisma#L1171)), listable by product ([simulation.routes.ts:34](../backend/src/modules/simulation/simulation.routes.ts#L34)). The source of truth keeps it out of operations: a simulation "does not update operational product cost" (§16), and its margin helper is "information only" ([SimulationTotalsCard.tsx:51](../frontend/src/features/simulation/components/SimulationTotalsCard.tsx#L51), `SIM-010`).
- Sale lines snapshot the product name, the unit and the unit price at posting, never a cost ([schema.prisma:628](../backend/prisma/schema.prisma#L628), [pos.service.ts:900](../backend/src/modules/pos/pos.service.ts#L900), order completion at [orders.service.ts:720](../backend/src/modules/orders/orders.service.ts#L720)). The same holds for distributor direct sales and settlements ([schema.prisma:954](../backend/prisma/schema.prisma#L954), [schema.prisma:1058](../backend/prisma/schema.prisma#L1058), [distribution.service.ts:378](../backend/src/modules/distribution/distribution.service.ts#L378), [distribution.service.ts:938](../backend/src/modules/distribution/distribution.service.ts#L938)). A margin computed from the product's current cost would rewrite the past every time the cost is edited; a snapshot per line, like the price, keeps history stable (`SIM-006` spirit).

### Scope and permissions

- The source of truth defers "advanced dashboards, profitability, and scheduled daily reports" (§1) and `OD-V2-001` keeps Accueil "operational only: no profitability" ([11_DECISION_LOG_V2.md](../internal-docs/DAR_EL_BARKA_V2_REDESIGN_AND_HARDENING_PACK/docs/11_DECISION_LOG_V2.md)). The owner's request widens both; the decision must be logged (`DEC-V2-005`) and the source of truth marked for update.
- No permission covers a cost or a margin. `products.view` is held by cashiers to use the till; showing the cost and the margin to everyone who can see the product list is not what a bakery owner expects. A new permission is needed for the cost column, the margin on the product page and the Accueil tile.
- The home summary already hides a block when the caller lacks its permission ([home.service.ts:60](../backend/src/modules/home/home.service.ts#L60)); a margin block fits the same pattern and the same period control as the sales tile ([KpiRow.tsx:41](../frontend/src/features/home/widgets/KpiRow.tsx#L41)).

### Why "approximate"

- The cost is what the owner types per base unit (ingredients, or ingredients plus an allowance), not a computed cost of goods sold: no overhead, packaging, energy or labour (`SIM-010`), no stock valuation, no purchase-price averaging. Every label must say so ("Coût approximatif", "Marge approximative").
- A product with no cost cannot contribute a margin. The KPI must say how much of the day's revenue it could not cost rather than silently treating those lines as free.

## Proposed change

### Backend

1. **Cost on the product.** `products.approximate_cost_tnd DECIMAL(12,3) NULL` (per base unit). `createProductSchema` / `updateProductSchema` accept `approximateCostTnd` (same money pattern as the price, empty clears it); `createProduct` / `updateProduct` store it and the audit before/after shows it. The product read models expose it.
2. **Permission `margin.view`** ("Voir la marge approximative", module "Marge"): the cost and margin fields are stripped from product responses when the caller lacks it, and the Accueil block is `null` without it. Super Admin receives it at boot; the seeded `Gérant` too.
3. **Snapshot at posting.** `unit_cost_tnd DECIMAL(14,3) NULL` on `sale_lines`, `distributor_sale_lines` and `distributor_settlement_lines`, copied from the product's cost at posting (POS sale, order completion, distributor direct sale, settlement). Null when the product had no cost. No backfill of past lines (open decision below).
4. **`margin` block on `GET /home/summary`** (permission `margin.view`, same business day and previous day as `sales`): `{ today: { revenueTnd, costTnd, marginTnd, costedLineShare, uncostedLinesCount }, previousDay: {...} }` over posted POS sales, one SQL aggregate on the sale lines (`SUM(line_total)`, `SUM(quantity × unit_cost)` over costed lines, count of uncosted lines). Distributor documents are left out of the first version (open decision below).
5. Indexes: none needed beyond `sale_lines (sale_id)` and `sales (status, sold_at)` that exist.

### Frontend

- Product form: `Coût approximatif` (MoneyInput, optional, hint "par unité de base, ingrédients seulement"), visible with `margin.view`.
- Product page: `Coût approximatif` and `Marge approximative` (price − cost, and the percentage of the price) in the fiche, with `margin.view`; a line "Dernière simulation : X TND par unité" with a link when a saved simulation targets the product and its output unit is the base unit, and a `Reprendre ce coût` action that fills the form with it (nothing automatic, `SIM-*` stays a planning tool).
- Product list: `Coût` and `Marge` columns with `margin.view`, sortable by cost.
- Accueil: `Marge approximative` tile next to the sales tile, same period, delta vs the previous day, note "sur N % du chiffre d'affaires" when some lines had no cost and "M lignes sans coût" as the tooltip text; absent without `margin.view`.
- Copy in `i18n/fr.ts`; error copy for the new validation codes.

### Tests

- Backend: catalog service accepts, updates and clears the cost with audit; product responses hide the cost without `margin.view`; POS posting and order completion snapshot the cost (null when the product has none); home summary margin arithmetic with a costed and an uncosted line, and the block absent without the permission; route allowed and denied; OpenAPI catalogue.
- Frontend: `ProductsPage.test.tsx` gains the cost in the form and the columns per permission; `AccueilPage.test.tsx` gains the tile with the uncosted share and its absence for a cashier.

## Acceptance criteria

- A product edited with a cost of 0.800 TND and a price of 1.200 TND shows `Marge approximative 0,400 TND (33,3 %)` on its page, and the list sorts by cost.
- A sale posted after the edit stores 0.800 on its line; editing the cost to 0.900 afterwards changes neither that line nor the margin of that day.
- On Accueil with `Aujourd'hui`, `Marge approximative` equals the sum over the day's posted sales of `line_total − quantity × unit_cost` for costed lines, and the note states the share of revenue that had a cost. `Hier` moves it with the other daily tiles.
- A cashier without `margin.view` sees no cost anywhere: not in the product list, not on the product page, not on Accueil, and not in the product API response.
- A cancelled sale contributes nothing.

## Open decisions to surface

- The scope widening: profitability was deferred in the source of truth §1 and refused on Accueil by `OD-V2-001`; the owner's request settles it for an approximate, ingredient-level margin. To be logged as `DEC-V2-005`; the source of truth needs a row for the product cost and the permission table a row for `margin.view`.
- Cost basis: typed by hand per base unit, ingredients only (proposed), or fed from the latest saved simulation automatically (rejected: `SIM-*` keeps simulations out of operations).
- Backfill: leave past sale lines without a cost (proposed, the KPI says what share was costed) or stamp them once with the current cost (rewrites history, "approximate" makes it defensible).
- Distributor documents: POS sales only in the first version (proposed) or include direct distributor sales and settlement sold quantities in the same tile.
- Who sees the margin: a new `margin.view` permission (proposed) or reuse `expenses.view` as "the owner's figures".
