# Feature #48: approximate cost per product and an approximate margin on Accueil

## Branches

- Source: `feat/products-cost-margin` (stacked on `fix/42-accueil-kpi-periods`)
- Target: `dev`

## Scope

Closes issue #48 ([issues/008](../issues/008-produits-cout-approximatif-marge.md)):
the owner types an approximate cost per product, sees the margin per
product, and reads an approximate margin of the day on Accueil. Decision
`DEC-V2-005` (local decision log) records the widening of `OD-V2-001` and
the new permission. Commits carry `(#48)`.

## Summary

- `products.approximate_cost_tnd` (nullable, per base unit, checked
  non-negative): accepted by the product creation and update bodies, an
  empty value clears it, audited with the rest of the product, sortable in
  the list.
- Permission `margin.view` ("Voir la marge approximative", module
  "Marge"): the cost is stripped from every product response without it,
  the Accueil block is `null` without it. The Super Admin bootstrap and
  the demo `Gérant` receive it; the seeded `Caissier` does not.
- `unit_cost_tnd` (nullable) on `sale_lines`, `distributor_sale_lines`
  and `distributor_settlement_lines`, copied from the product at posting
  by the till, the order completion, the distributor direct sale and the
  settlement, through one `unitCostSnapshot` helper. A later edit of the
  cost never rewrites a posted line. Nothing is backfilled.
- `margin` block on `GET /home/summary`, same business day and previous
  day as the sales: revenue, costed revenue, cost, margin (costed revenue
  less cost) and the count of lines without a cost, over posted POS sales,
  in one SQL aggregate on the sale lines.
- Frontend: `Coût approximatif` in the product form (hint "par unité de
  base, ingrédients seulement"), `Coût` and `Marge` columns on the list,
  `Coût approximatif`, `Marge approximative` (amount and share of the
  price) and `Dernière simulation` (the latest saved simulation targeting
  the product, as a link, never copied) on the product page, all with
  `margin.view`; a clerk editing a product neither sees nor sends the
  cost. Accueil: `Marge approximative` tile with the delta versus the day
  before and a note giving the share of the revenue that had a cost and
  the number of lines without one.

## Out of Scope

- A computed cost of goods sold: overhead, packaging, energy, labour,
  stock valuation and purchase-price averaging stay out (`SIM-010`).
- Distributor documents in the Accueil tile and a backfill of past lines
  (both open in the issue).
- Filling the product cost from a simulation in one click.

## Verification

Run locally on macOS, Node 24, on the stacked branch:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 362 passed, 10 skipped (49 files);
  new: the product list hides the cost without `margin.view` and shows it
  with; an empty cost is stored as null and "0.8" passes through; a posted
  sale line carries the product's cost; the margin block over costed
  lines (1 250 of revenue, 900 costed at 600 gives 300 on 900, three
  uncosted lines) and its absence without the permission; OpenAPI
  catalogue
- `npm run test --workspace frontend`: 215 passed (90 files); new in
  `ProductsPage.test.tsx`: no `Coût` column with `products.view` alone;
  with `margin.view` the cost typed in the form reaches the store, the
  list shows the margin and the product page shows `0,800`, `0,400 TND
(33,3 %)`; in `AccueilPage.test.tsx`: the tile with its share note and
  delta, absent for a cashier
- `npm run build`: passed; initial JavaScript 200.6 kB gzip against the
  250 kB budget; POS chunk 13.1 kB
- Playwright on the system Brave browser (`E2E_BROWSER`), the catalogue
  and stock flow, the shell flow and the axe scans at three widths: 100
  passed, 2 skipped by design

## Database and Migration Impact

One additive migration, `20260925120000_product_approximate_cost`: the
product column with its check constraint and the three nullable line
columns. The permission row is inserted by the catalogue sync at boot.

## Environment Impact

None.

## Risks and Follow-Up

- Grant `margin.view` to the owner's role on the shared development
  database (the Super Admin gets it automatically).
- The margin covers costed lines only; until every product has a cost the
  tile's note says what share of the revenue it covers.
- The `Dernière simulation` hint needs `simulations.view` as well.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue #48
- [ ] Target branch is `dev`
