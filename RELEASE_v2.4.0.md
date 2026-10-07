# Release v2.4.0 Evidence

After `v2.3.0` the owner asked to buy finished goods and resell them, for
analyses of the purchases and of the distributor channel, for a
`Total charges` figure in place of the cash collected, and then refused
the automatic cost that came with the first of these, asking for a price
history instead. Five stacked branches (issues 019 to 023, PRs #84 to
#89) were merged to `dev`, then `dev` to `staging` (PRs #88 and #90),
where the owner tried the release on a copy of production. Written from
what was verified, and plain about what was not.

## Quality suite

Locally on the last branch (macOS, Node 24) and in the CI runs of pull
request #89 (run 37556814559) and of the push to `staging` (run
37558195757; Ubuntu, Node 24, PostgreSQL 16 service):

| Command                       | Result                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`        | passed                                                                                                                                   |
| `npm run lint`                | passed, zero warnings                                                                                                                    |
| `npm run typecheck`           | passed, backend and frontend                                                                                                             |
| `npm run test`                | backend 495 passed, 19 skipped locally; frontend 318 passed (100 files)                                                                  |
| `npm run test:integration`    | CI only: the two migrations applied to the CI database, the analytics suite with its new cases, the performance suite with the two reads |
| `npm run db:check-drift`      | CI only: no drift beyond the protected objects                                                                                           |
| `npm run openapi:check`       | passed                                                                                                                                   |
| `npm run api:types` then diff | passed                                                                                                                                   |
| `npm run build`               | passed; 202.0 kB gzip initial against 250 kB; POS route 14.3 kB against 120 kB                                                           |
| `npm run e2e`                 | CI at 360, 768 and 1280 px; locally the whole suite on the 022 branch (158 passed, 3 skipped by design) and the touched specs after it   |
| Container images              | CI `containers` job                                                                                                                      |
| Staging                       | deployed from `077c55e` with both migrations applied; tried by the owner                                                                 |

The nineteen tests skipped locally are the PostgreSQL-backed suites,
proven by CI; no database is installed on the development machine by the
owner's decision.

## Issues closed since v2.3.0

| Issue | Brief     | Behaviour                                                                                                                                                    |
| ----- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 019   | `prs/056` | `Produit de revente`: a product bought to be resold, always stock-tracked, found on `Nouvel achat` beside the raw materials; its stock follows the purchases |
| 020   | `prs/057` | `Nouvelle course`: a card for the resold products, one purchase with the raw materials                                                                       |
| 021   | `prs/058` | `Analyses`: `Achats` (purchases by kind, suppliers, prices, bought beside sold) and `Distributeurs` (revenue, returns, balances, products)                   |
| 022   | `prs/059` | `Total charges` on Accueil in place of `Encaissé en espèces`; five figures on `Vue d'ensemble`                                                               |
| 023   | `prs/060` | A `Prix` tab on a resold product (prices paid and sale prices) and on a raw material (prices paid); a purchase never changes a product's cost                |

## Migrations

Two since `v2.3.0`, both additive:

- `20261007100000_resale_products_on_purchases`: `products.is_resale`,
  `purchase_lines.product_id`, `raw_material_id` made nullable, two check
  constraints. Nothing backfilled.
- `20261007120000_product_sale_price_history`: the table, backfilled with
  one row per existing product at its current price.

| Environment                                     | `migrate deploy` result | Date       | Operator |
| ----------------------------------------------- | ----------------------- | ---------- | -------- |
| CI database                                     | applied, no drift       | 2026-10-07 | pipeline |
| Staging (`dar_el_baraka_staging`)               | applied                 | 2026-10-07 | pipeline |
| Production (`dar_el_baraka` on `postgres-prod`) | two migrations to apply | pending    | pipeline |

## Environment

- No new setting, no new dependency, no new volume, no new permission.
- Existing permissions decide what shows: the resold products on the
  purchase picker need `products.view`; the `Achats` and `Distributeurs`
  analyses need `purchases.view` and `distributors.view`; `Total
charges` needs `expenses.view` and `purchases.view`.

## Release gate

| Gate item                              | Status                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Issues 019 to 023 merged with CI green | met: PRs #84 to #89 on `dev`, CI green on each and on the push to `staging` |
| Tried on the test environment          | met: `staging` deployed from `077c55e`, checked by the owner                |
| Owner's review                         | met on staging                                                              |
| Backups                                | **not scheduled**; the last manual dump is the one taken to seed staging    |
| UAT signed                             | **not signed**                                                              |
| Deployment of this release             | **pending**: the promotion to `main` deploys it after the approval          |
| `v2.4.0` tag                           | **pending**: on `dev` once the deploy is checked (DEC-V2-001)               |

## Known and left open

- `fix/staging-copy-admin-user` (staging tooling) is still on neither
  `dev` nor `main`; it does not touch the production deploy.
- `.github/workflows/demo.yml` records a failed run with no job on every
  push. It blocks nothing.
- Neither `v2.2.0` nor `v2.3.0` was tagged; only `v2.1.0` exists.

## Tagging

Once the deploy is green and the owner has recorded a purchase of a
resold product on production:

```
git checkout dev && git pull
git tag -a v2.4.0 -m "v2.4.0 - Dar El Barka V2, resold products, purchase and distributor analyses"
git push origin v2.4.0
```
