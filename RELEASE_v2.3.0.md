# Release v2.3.0 Evidence

After `v2.2.0` the owner reported two defects (the order queue that showed
nothing, the purchase form and the payment cancellations), asked for a
test environment beside production, then for one page to record a
shopping trip and for sub-categories of expenses. Issues 015, 016 and 017
were merged to `main` on their own (PRs #77, #78 and #79) and already run
in production. Issue 018 was merged to `dev` (PRs #80 and #81) and is what
this release deploys. Written from what was verified, and plain about what
was not.

## Quality suite

Locally on the branch of issue 018 (macOS, Node 24) and in the CI run of
pull request #81 (Ubuntu, Node 24, PostgreSQL 16 service, run
37438724720):

| Command                       | Result                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`        | passed                                                                                                                                                              |
| `npm run lint`                | passed, zero warnings                                                                                                                                               |
| `npm run typecheck`           | passed, backend and frontend                                                                                                                                        |
| `npm run test`                | backend 456 passed, 16 skipped locally; frontend 301 passed (100 files)                                                                                             |
| `npm run test:integration`    | CI only                                                                                                                                                             |
| `npm run db:check-drift`      | CI only: the migration of issue 018 applied to the CI database, no drift beyond the protected objects                                                               |
| `npm run openapi:check`       | passed                                                                                                                                                              |
| `npm run api:types` then diff | passed                                                                                                                                                              |
| `npm run build`               | passed; 201.7 kB gzip initial against 250 kB; POS route 14.3 kB against 120 kB                                                                                      |
| `npm run e2e`                 | CI at 360, 768 and 1280 px; locally the whole suite on Brave: 147 passed, 3 skipped by design, 3 desktop specs timed out at the end of the run and passed run again |
| Container images              | CI `containers` job on the pull request                                                                                                                             |

The sixteen tests skipped locally are the PostgreSQL-backed suites, proven
by CI; no database is installed on the development machine by the owner's
decision. The shopping trip itself is proven on a transactional double
(one transaction, rollback of the purchase when an expense fails, replay
on the same key); no database-backed suite exercises it yet.

The first CI runs of issue 018 failed twice before the green one: the PR
brief was not formatted, then a test double did not typecheck. Both were
in files no runtime code reads.

## Issues closed since v2.2.0

| Issue | Brief     | Behaviour                                                                                                                                                   |
| ----- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 015   | `prs/051` | `Commandes`: `À traiter` is every open order over every date, late ones flagged; `Demain` and `7 jours`; a `Toutes` tab                                     |
| 016   | `prs/052` | `Achats`: the form refuses a repeated material, a zero price, a future date, each on its field; no text about the price under the quantity                  |
| 016   | `prs/052` | A cancellation takes back what is still applied; a payment of a cancelled purchase offers no cancellation, for suppliers, customers and distributors        |
| 017   | `prs/053` | A staging stack for `testing.darelbarka.work`, deployed from the `staging` branch, seeded from a dump of production                                         |
| 018   | `prs/054` | `Nouvelle course`: the raw materials and the other goods of one store validated together, as a posted purchase and posted expenses in one transaction       |
| 018   | `prs/054` | `Course fournisseur` in the quick actions, on `Achats` and on `Dépenses`; the purchase page lists the other goods of its trip; an expense names its store   |
| 018   | `prs/054` | Sub-categories of expenses: a parent per category, the tree on the categories page, the path in every picker; a parent stays active while a sub-category is |

## Migrations

One since `v2.2.0`:
`20261006100000_expense_sub_categories_and_shopping_trips`. It adds
`expense_categories.parent_id`, `expenses.supplier_id` and
`expenses.purchase_id`, all nullable, with their indexes and foreign keys.
Nothing is backfilled and no row is rewritten.

| Environment                                     | `migrate deploy` result                            | Date       | Operator |
| ----------------------------------------------- | -------------------------------------------------- | ---------- | -------- |
| CI database                                     | applied, no drift                                  | 2026-10-06 | pipeline |
| Staging (`dar_el_baraka_staging`)               | not applied: issue 018 was not pushed to `staging` | —          | —        |
| Production (`dar_el_baraka` on `postgres-prod`) | one migration to apply                             | pending    | pipeline |

## Environment

- No new setting, no new dependency, no new volume.
- No new permission. The shopping trip asks for three that exist:
  `purchases.create`, `purchases.post` and `expenses.create`. A role
  without the three does not see `Course fournisseur`.

## Release gate

| Gate item                               | Status                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Issues 015 to 017 merged, CI green      | met: PRs #77, #78 and #79 on `main`, in production                                       |
| Issue 018 merged with CI green          | met: PRs #80 and #81 on `dev`, CI green on pull request #81 (run 37438724720)            |
| Issue 018 tried on the test environment | **not done**: it went to `dev`, not to `staging`                                         |
| Owner's review of the shopping trip     | **not recorded**: the owner sees it on the deployed release                              |
| Backups                                 | **not scheduled**; the dump taken on 2026-10-04 to seed staging is the last manual one   |
| UAT signed                              | **not signed**                                                                           |
| Deployment of this release              | **pending**: the promotion to `main` deploys it after the approval on `production`       |
| `v2.3.0` tag                            | **pending**: on `dev` once the deploy is checked (DEC-V2-001); `v2.2.0` was never tagged |

## Known and left open

- The fixes of the staging tooling on `fix/staging-copy-admin-user` (the
  admin role read from the Postgres container, the guard that reads the
  database name) are on neither `dev` nor `main`. They do not touch the
  production deploy.
- `.github/workflows/demo.yml` records a failed run with no job on every
  push. It blocks nothing.

## Tagging

Once the deploy is green and the owner has validated a trip on
production:

```
git checkout dev && git pull
git tag -a v2.3.0 -m "v2.3.0 - Dar El Barka V2, shopping trip and sub-categories"
git push origin v2.3.0
```
