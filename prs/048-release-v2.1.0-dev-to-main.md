# Release v2.1.0 Promotion of `dev` to `main`

## Branches

- Source: `dev`
- Target: `main`

## Scope

Promotes release 2.1.0 to the releasable branch: the three issues of the
client demo (#64 photos, #65 order deposits, #66 retouches) and the fixes
that followed the first deployment (balances round trips, performance
fixture, demo workflow, plain-HTTP ids), plus the release cut (version,
changelog, `RELEASE_v2.1.0.md`) and the issue briefs 011 to 013.

## Behaviour added since `main`

| Area      | Capability                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| Produits  | A photo per product, chosen in the form, re-encoded server-side, stored in a persistent volume, shown on the till   |
| Commandes | The order page and every command carry the deposit figures; dialogs show the real remainder; day-only deposit dates |
| Accueil   | Expenses figure in the KPI row                                                                                      |
| Produits  | The last simulation of the product on its page                                                                      |
| Ventes    | Rows and receipt refreshed after a règlement                                                                        |
| Kit       | Pickers scroll inside modal dialogs; the product page's adjustment keeps its product fixed with the real balance    |
| Platform  | Balances page in three database rounds; the app works over plain HTTP; the demo workflow no longer fails every push |

## Database and migration impact

One additive migration since `v2.0.0`, `product_image`. The production
database was emptied by the owner on 2026-09-28; the deploy of this merge
rebuilds it from all 25 migrations, the API seeds the permissions at boot,
and the first admin is created again with `createUser`.

## Environment impact

`MEDIA_ROOT` and the `deb-media` volume, both set by the compose file; no
new secret. `multer` and `sharp` in the API image.

## Verification

CI ran on every pull request into `dev` and on each push to `dev`; the last
run on `dev` (PR #69) passed every step including the PostgreSQL suites,
the performance suite, both builds, the browser smoke and the container
images. Local results are in `RELEASE_v2.1.0.md`. The push to `main` runs
CI again and pauses the deploy job on `production` for the owner's
approval: **merging this pull request and approving that job deploys
2.1.0 on the emptied production database.**

## Rollback considerations

- **Code**: a manual deploy run with the previous image tag
  (`78bab8c6…`, the 2.0.0 build) puts the previous release back; the
  photo migration is additive and harmless to it.
- **Data**: the database is new; nothing to preserve from before this
  release.

## Tagging

Per DEC-V2-001, `v2.1.0` is tagged on `dev` after the deploy is checked.
This pull request does not tag.

## Merge Checklist

- [ ] CI passed on this pull request
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches release 2.1.0
- [ ] Target branch is `main`
- [ ] Deploy approved and `/api/health/ready` reports `2.1.0` with the merged commit
- [ ] First admin recreated on the new database
