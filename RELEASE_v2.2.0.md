# Release v2.2.0 Evidence

After `v2.1.0` the owner asked for an analytics module on the data the
application already collects, and for a place to find the till sessions
(issue 014, `DEC-V2-006`). This release is that one feature, merged to
`dev` as PR #75. Written from what was verified, and plain about what was
not.

## Quality suite

Locally on the branch merged by PR #75 (macOS, Node 24) and in the CI runs
of that pull request and of the push to `dev` (Ubuntu, Node 24, PostgreSQL
16 service):

| Command                       | Result                                                                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`        | passed                                                                                                                                                                                                               |
| `npm run lint`                | passed, zero warnings                                                                                                                                                                                                |
| `npm run typecheck`           | passed, backend and frontend                                                                                                                                                                                         |
| `npm run test`                | backend 408 passed, 16 skipped locally; frontend 272 passed (98 files)                                                                                                                                               |
| `npm run test:integration`    | CI only: p95 budget held with the four analytics reads added to it                                                                                                                                                   |
| `npm run db:check-drift`      | CI only: no drift beyond the protected objects                                                                                                                                                                       |
| `npm run openapi:check`       | passed                                                                                                                                                                                                               |
| `npm run api:types` then diff | passed                                                                                                                                                                                                               |
| `npm run build`               | passed; 201.4 kB gzip initial against 250 kB; POS route 14.3 kB against 120 kB                                                                                                                                       |
| `npm run e2e`                 | CI at 360, 768 and 1280 px; locally the whole suite before the bar fix (138 passed, 3 skipped by design), then the analytics spec (11 passed, 1 skipped) and the axe scans of the touched pages (15 passed) after it |
| Container images              | CI `containers` job on the pull request                                                                                                                                                                              |

The sixteen tests skipped locally are the PostgreSQL-backed suites, proven
by CI; no database is installed on the development machine by the owner's
decision. Among them, `analytics.service.database.test.ts` is the proof of
the module's raw SQL: Tunis day and hour of a sale posted at 23:30 UTC,
cancelled documents left out, channels, distinct documents per product,
new and returning customers, session totals and insights.

## Issues closed since v2.1.0

| Issue | Brief     | Behaviour                                                                                                                                                       |
| ----- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 014   | `prs/049` | `Analyses`: overview against the previous period with a trend, sales and order pickups by weekday and hour, products, customers; behind `analytics.view`        |
| 014   | `prs/049` | `Sessions de caisse` in the navigation; the history on the month with its totals; a session page with duration, average basket, activity by hour, best products |
| 014   | `prs/049` | Kit: `Heatmap` and `TrendChart`; analysis windows on the period filter; vertical bars drawn without a hover, readable by touch                                  |
| —     | —         | A dated Expenses test pinned to the month of its fixtures (it failed from 1 October)                                                                            |

## Migrations

None since `v2.1.0`. The deploy applies nothing to the production
database.

| Environment                                     | `migrate deploy` result | Date    | Operator |
| ----------------------------------------------- | ----------------------- | ------- | -------- |
| Production (`dar_el_baraka` on `postgres-prod`) | nothing to apply        | pending | pipeline |

## Environment

- No new setting, no new dependency, no new volume.
- One new permission, `analytics.view`: the API inserts it and grants it
  to the Super Admin role when it boots. Any other role sees `Analyses`
  only after the permission is ticked in `Rôles et autorisations`.

## Release gate

| Gate item                      | Status                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| Issue 014 merged with CI green | met: PR #75, CI green on the pull request and on the push to `dev` (run 37209740606) |
| Owner's review of the module   | **not recorded**: the owner sees it on the deployed release                          |
| Backups                        | **not done**, owner's decision (unchanged from `v2.0.0`)                             |
| UAT signed                     | **not signed**                                                                       |
| Deployment of this release     | **pending**: the promotion to `main` deploys it after the approval on `production`   |
| `v2.2.0` tag                   | **pending**: on `dev` once the deploy is checked (DEC-V2-001)                        |

## Tagging

Once the deploy is green and the owner has opened `Analyses` on production:

```
git checkout dev && git pull
git tag -a v2.2.0 -m "v2.2.0 - Dar El Barka V2, analytics module"
git push origin v2.2.0
```
