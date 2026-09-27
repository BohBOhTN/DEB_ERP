# Release v2.1.0 Evidence

The client demo of 2026-09-26 on the deployed `v2.0.0` produced three
issues; this release closes them, together with the fixes that followed the
first deployment. Merged to `dev` as PR #67 (#65), #68 (#66), #69 (#64) and
the branches for the balances round trips, the performance fixture and the
plain-HTTP ids. Written from what was verified, and plain about what was not.

## Quality suite

Locally on the `dev` merge commit of PR #69 (macOS, Node 24) and in the CI
runs of the three pull requests (Ubuntu, Node 24, PostgreSQL 16 service):

| Command                       | Result                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run format:check`        | passed                                                                                     |
| `npm run lint`                | passed, zero warnings                                                                      |
| `npm run typecheck`           | passed, backend and frontend                                                               |
| `npm run test`                | backend 375 passed, 10 skipped locally; frontend 225 passed (93 files)                     |
| `npm run test:integration`    | CI only: fixture analysed then seeded, p95 budget held (balances 22 to 31 ms)              |
| `npm run db:check-drift`      | CI only: no drift beyond the protected objects                                             |
| `npm run openapi:check`       | passed                                                                                     |
| `npm run api:types` then diff | passed                                                                                     |
| `npm run build`               | passed; 201.0 kB gzip initial against 250 kB; POS route 13.3 kB against 120 kB             |
| `npm run e2e`                 | CI at 360, 768 and 1280 px; locally 103 passed on the till, catalogue, shell and axe flows |
| Container images              | CI `containers` job on each pull request, `sharp` included                                 |

The ten tests skipped locally are the PostgreSQL-backed suites, proven by
CI; no database is installed on the development machine by the owner's
decision.

## Issues closed since v2.0.0

| Issue | Brief     | Behaviour                                                                                                                                 |
| ----- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| #65   | `prs/045` | Order detail and commands return the deposit figures; the deposit and completion dialogs read the real remainder                          |
| #66   | `prs/046` | Expenses in the Accueil KPI row, simulation of the product, sales refreshed after a payment, pickers scroll in dialogs, locked adjustment |
| #64   | `prs/047` | A photo per product, re-encoded and stored in a volume, served by nginx, shown on the list, the page and the till tiles                   |
| —     | —         | Balances page in three database rounds; performance fixture analysed before measuring; the demo workflow valid again                      |
| —     | —         | Ids generated without `crypto.randomUUID` so the app works over plain HTTP on an address                                                  |

## Migrations

One since `v2.0.0`, additive: `20260927100000_product_image` (two nullable
columns on `products`). The production database was emptied by the owner on
2026-09-28 and is rebuilt from the whole chain by the deploy of this release.

| Environment                                     | `migrate deploy` result                         | Date    | Operator |
| ----------------------------------------------- | ----------------------------------------------- | ------- | -------- |
| Production (`dar_el_baraka` on `postgres-prod`) | empty database, all 25 migrations by the deploy | pending | pipeline |

## Environment

- New backend setting `MEDIA_ROOT` (set by the compose file to
  `/data/media`); new named volume `deb-media` shared by the API and the
  frontend containers; nginx serves `/media/`.
- New dependencies `multer` and `sharp`.
- No new permission.

## Release gate

| Gate item                                 | Status                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Issues #64, #65, #66 merged with CI green | met: PR #67, #68, #69                                                       |
| Client demo                               | done on `v2.0.0` by the owner on 2026-09-26; the three issues are its notes |
| Backups                                   | **not done**, owner's decision (unchanged from `v2.0.0`)                    |
| UAT signed                                | **not signed**: the demo stood in for it                                    |
| First deployment of this release          | **pending**: the promotion to `main` deploys it on an emptied database      |
| `v2.1.0` tag                              | **pending**: on `dev` once the deploy is checked (DEC-V2-001)               |

## Tagging

Once the deploy is green and the owner has signed in on the new database:

```
git checkout dev && git pull
git tag -a v2.1.0 -m "v2.1.0 - Dar El Barka V2, after the client demo"
git push origin v2.1.0
```
