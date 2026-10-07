# Release v2.4.0 Promotion of `dev` to `main`

## Branches

- Source: `release/v2.4.0` (`dev` plus the release cut)
- Target: `main`

## Scope

Promotes release 2.4.0 to the releasable branch: issues 019 to 023
(PRs #84 to #89), tried on the test environment through PRs #88 and #90,
plus the release cut (version, changelog, `RELEASE_v2.4.0.md`).

## Behaviour added since `main`

| Area     | Capability                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Produits | `Produit de revente`: a product bought from a supplier to be resold, always stock-tracked, with a `Revente` badge, a filter and an `Achats` tab   |
| Produits | A `Prix` tab: the prices paid purchase after purchase beside the sale prices the product had; the same tab on a raw material for the prices paid  |
| Achats   | `Nouvel achat` finds raw materials and resold products together; posting receives the product's stock; the purchase page marks the resold lines   |
| Achats   | `Nouvelle course` gains a card `Produits de revente`; raw materials and resold products of a trip are one purchase                                |
| Analyses | `Achats`: purchases by kind against the period before, what is still owed, the suppliers, the raw materials with their prices, bought beside sold |
| Analyses | `Distributeurs`: the channel's revenue and split, the return rate, each distributor with its balance, the products sold through distributors      |
| Analyses | `Vue d'ensemble`: revenue with the sales count, `Total charges`, approximate margin, raw-material purchases, resold-product purchases             |
| Accueil  | `Total charges` (expenses plus raw materials bought) in place of `Encaissé en espèces`; the cash stays on the session card and pages              |
| Règle    | A purchase never changes a product's cost (`DEC-V2-013`)                                                                                          |

## Database and migration impact

Two additive migrations, applied on the CI database and on staging:
the resale flag and product lines on purchases; the sale price history,
backfilled with one row per product. The deploy applies both to the
production database before the new API starts.

## Environment impact

None: no new setting, secret, dependency, volume or permission.

## Verification

CI passed on every pull request of the batch and on the push to
`staging` (run 37558195757): the migrations on the CI database, the
drift check, the PostgreSQL suites (the analytics cases on purchases and
distributors among them), the performance suite with two new reads,
both builds, the browser suite and the container images. The owner tried
the release on `testing.darelbarka.work`. Local results are in
`RELEASE_v2.4.0.md`. The push to `main` runs CI again and pauses the
deploy job on `production` for the owner's approval: **merging this pull
request and approving that job applies the two migrations and deploys
2.4.0 on the production database.**

## Rollback considerations

- **Code**: a manual deploy run with the previous image tag
  (`afc5989…`, the build `main` runs today) puts 2.3.0 back.
- **Data**: the new columns and table can stay; 2.3.0 ignores them. One
  exception: a purchase line that bought a resold product has no raw
  material, which 2.3.0 does not expect. Roll forward rather than back
  once such a purchase exists.

## Tagging

Per DEC-V2-001, `v2.4.0` is tagged on `dev` after the deploy is checked.
This pull request does not tag.

## Merge Checklist

- [ ] CI passed on this pull request
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches release 2.4.0
- [ ] Target branch is `main`
- [ ] Deploy approved and `/api/health/ready` reports `2.4.0` with the merged commit
- [ ] A resold product bought, sold and read on its `Prix` tab by the owner on production
