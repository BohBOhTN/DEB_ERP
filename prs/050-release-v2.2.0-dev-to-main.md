# Release v2.2.0 Promotion of `dev` to `main`

## Branches

- Source: `dev`
- Target: `main`

## Scope

Promotes release 2.2.0 to the releasable branch: the analytics module and
the till session history of issue 014 (PR #75), plus the release cut
(version, changelog, `RELEASE_v2.2.0.md`).

## Behaviour added since `main`

| Area     | Capability                                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analyses | A new page behind `analytics.view`, with a period control (this month, 30 days, 90 days, this year, custom up to 366 days)                                      |
| Analyses | `Vue d'ensemble`: revenue by channel, till sales, average basket, expenses, approximate margin and what is still due, against the previous period, with a trend |
| Analyses | `Fréquence`: sales and order pickups by weekday and hour in Tunis as a heat map; the busiest slot, the strongest weekday, the rush hour                         |
| Analyses | `Produits`: what sells, how often, its share and approximate margin; the active products that did not sell                                                      |
| Analyses | `Clients`: active, new and returning customers, the best ones and the ones to win back                                                                          |
| Caisse   | `Sessions de caisse` in the navigation; the history on the month with totals; a session page with duration, average basket, activity by hour and best products  |
| Kit      | `Heatmap` and `TrendChart`; vertical bar charts drawn without a hover and readable by touch                                                                     |

## Database and migration impact

No migration. The API inserts the permission `analytics.view` and grants
it to the Super Admin role at boot; nothing else is written.

## Environment impact

None: no new setting, secret, dependency or volume.

## Verification

CI ran on pull request #75 and on the push of its merge to `dev`:
both runs passed every step, including the PostgreSQL suites (the
analytics SQL among them), the performance suite with the four analytics
reads in its budget, both builds, the browser smoke and the container
images. Local results are in `RELEASE_v2.2.0.md`. The push
to `main` runs CI again and pauses the deploy job on `production` for the
owner's approval: **merging this pull request and approving that job
deploys 2.2.0 on the production database.**

## Rollback considerations

- **Code**: a manual deploy run with the previous image tag
  (`57e21653…`, the build `main` runs today) puts the previous release
  back. Nothing in the database depends on 2.2.0.
- **Data**: the release only reads. The one row it adds, the permission
  `analytics.view`, is ignored by the previous release.

## Tagging

Per DEC-V2-001, `v2.2.0` is tagged on `dev` after the deploy is checked.
This pull request does not tag.

## Merge Checklist

- [ ] CI passed on this pull request
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches release 2.2.0
- [ ] Target branch is `main`
- [ ] Deploy approved and `/api/health/ready` reports `2.2.0` with the merged commit
- [ ] `Analyses` and `Sessions de caisse` open for the owner on production
