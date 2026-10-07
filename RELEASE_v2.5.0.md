# Release v2.5.0 Evidence

After `v2.4.0` the owner asked for a module that picks products from the
catalogue and prints their price tags on A4 sheets, with a chosen tag
size and a placement that wastes no paper. Issue 024 was delivered on one
branch (PR #92) merged to `dev`, then `dev` to `staging` (PR #93), where
the owner looked at the tag, asked for a bigger logo, a centred name and
a richer design, and approved the reworked tag. Written from what was
verified, and plain about what was not.

## Quality suite

Locally on the branch (macOS, Node 24) and in the CI runs of pull
request #92 (run 37700693546), of the merge to `dev` (run 37701716317)
and of the push to `staging` (run 37702112660; Ubuntu, Node 24,
PostgreSQL 16 service):

| Command                       | Result                                                                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`        | passed                                                                                                                                                                              |
| `npm run lint`                | passed, zero warnings (eslint and stylelint)                                                                                                                                        |
| `npm run typecheck`           | passed, backend and frontend                                                                                                                                                        |
| `npm run test`                | frontend 334 passed (102 files) locally; backend untouched, 495 passed and 19 skipped in CI                                                                                         |
| `npm run test:integration`    | CI only: no new migration; the PostgreSQL suites as before                                                                                                                          |
| `npm run db:check-drift`      | CI only: no drift beyond the protected objects                                                                                                                                      |
| `npm run openapi:check`       | passed; the contract did not change                                                                                                                                                 |
| `npm run api:types` then diff | passed                                                                                                                                                                              |
| `npm run build`               | passed; 202.2 kB gzip initial against 250 kB; POS route 14.3 kB against 120 kB; the tags page is its own 4.9 kB chunk                                                               |
| `npm run e2e`                 | CI at 360, 768 and 1280 px; locally the new `priceTags` spec (printed geometry measured under the print media), the catalogue, shell and axe specs: 127 passed, 2 skipped by design |
| Container images              | CI `containers` job                                                                                                                                                                 |
| Staging                       | deployed from `c7d3b15`; the tag reworked after the owner's first look, then approved                                                                                               |

The nineteen tests skipped locally are the PostgreSQL-backed suites,
proven by CI; no database is installed on the development machine by the
owner's decision.

## Issues closed since v2.4.0

| Issue | Brief     | Behaviour                                                                                                                                                                        |
| ----- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 024   | `prs/062` | `Étiquettes de prix`: products picked by search, category and origin, copies per product, three presets or a free size, A4 sheets packed without waste, printed from the browser |

## Migrations

None since `v2.4.0`. The deploy runs `migrate deploy` as always and finds
nothing to apply.

| Environment                                     | `migrate deploy` result | Date       | Operator |
| ----------------------------------------------- | ----------------------- | ---------- | -------- |
| CI database                                     | nothing to apply        | 2026-10-07 | pipeline |
| Staging (`dar_el_baraka_staging`)               | nothing to apply        | 2026-10-07 | pipeline |
| Production (`dar_el_baraka` on `postgres-prod`) | nothing to apply        | pending    | pipeline |

## Environment

- No new setting, no new dependency, no new volume, no new permission.
- The page needs `products.view`; the category filter needs
  `categories.view` to list the categories (it stays empty otherwise).
- The logo on the tag is the shell's `/assets/dar-el-barka-logo.webp`,
  served by the frontend container as before.

## Release gate

| Gate item                      | Status                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------- |
| Issue 024 merged with CI green | met: PR #92 on `dev`, CI green on it, on `dev` and on the push to `staging`     |
| Tried on the test environment  | met: `staging` deployed from `c7d3b15`, the tag reworked on the owner's remarks |
| Owner's review                 | met: approval given on 2026-10-08                                               |
| Backups                        | **not scheduled**; the last manual dump is the one taken to seed staging        |
| UAT signed                     | **not signed**                                                                  |
| Deployment of this release     | **pending**: the promotion to `main` deploys it after the approval              |
| `v2.5.0` tag                   | **pending**: on `dev` once the deploy is checked (DEC-V2-001)                   |

## Known and left open

- `fix/staging-copy-admin-user` (staging tooling) is still on neither
  `dev` nor `main`; it does not touch the production deploy.
- `.github/workflows/demo.yml` records a failed run with no job on every
  push. It blocks nothing.
- Neither `v2.2.0`, `v2.3.0` nor `v2.4.0` was tagged; only `v2.1.0`
  exists. The commands below tag `v2.5.0`; the older ones can be added
  on their merge commits the same way.
- The 8 mm printer margin is one constant (`SHEET.marginMm`); a printer
  with a wider unprintable edge would clip the outer tags.

## Tagging

Once the deploy is green and the owner has printed a sheet from
production:

```
git checkout dev && git pull
git tag -a v2.5.0 -m "v2.5.0 - Dar El Barka V2, price tags"
git push origin v2.5.0
```
