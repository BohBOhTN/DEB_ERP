# Release v2.0.0 Evidence

Release R10, polish, operations and launch: Sprints 27 and 28 (PR #38, #40),
the issue-driven fixes #41 to #49 (PR #50 to #58) and the deployment
pipeline (PR #59), all merged to `dev`. The first stable version of the V2
application. Written from what was verified, and plain about what was not.

## Quality suite

Locally on the `dev` merge commit of PR #59 (macOS, Node 24) and in the CI
run of that pull request (Ubuntu, Node 24, PostgreSQL 16 service):

| Command                       | Result                                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`        | passed                                                                                                                                                |
| `npm run lint`                | passed, zero warnings                                                                                                                                 |
| `npm run typecheck`           | passed, backend and frontend (generated types included)                                                                                               |
| `npm run test`                | backend 364 passed, 10 skipped locally; frontend 217 passed (90 files)                                                                                |
| `npm run test:integration`    | CI only: fixture seeded, p95 budget held                                                                                                              |
| `npm run db:check-drift`      | CI only: no drift beyond the protected objects                                                                                                        |
| `npm run openapi:check`       | passed: `backend/openapi.json` matches the routes                                                                                                     |
| `npm run api:types` then diff | passed: `frontend/src/lib/api/types.gen.ts` matches                                                                                                   |
| `npm run build`               | passed; initial JavaScript 200.6 kB gzip against the 250 kB budget                                                                                    |
| `npm run e2e`                 | CI: the shell, till, orders, customers, procurement, distribution, expenses, simulation and catalogue flows and the axe audit at 360, 768 and 1280 px |
| Container images              | CI `containers` job on PR #59: both images build                                                                                                      |

The ten tests skipped locally are the PostgreSQL-backed suites (idempotency,
inventory, orders and distribution concurrency, references, the performance
suite). CI runs them with `REQUIRE_INTEGRATION_TESTS=1`. No database is
installed on the development machine by the owner's decision, so those
suites are proven by CI only; one of them caught a wrong test payment amount
in #45 that a local run could not have (fixed in PR #58).

## Issues closed since v1.4.0

| Issue | Brief     | Behaviour                                                                                                          |
| ----- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| #47   | `prs/034` | Payments settle the party's open documents; documents keep their paid state in step with the ledger; reversals     |
| #43   | `prs/035` | Till: whole-card selection, stay on the till after a sale, no payment-method control, guarded clear                |
| #41   | `prs/036` | One period filter (today, yesterday, week, month, custom) on five lists, kept in the URL                           |
| #45   | `prs/037` | Order queue figures, filters, row actions, explicit completion amount, capped deposit                              |
| #44   | `prs/038` | Sales figures, filters, search, cancellation under `pos.cancel_sale`, remainder collection, full receipt           |
| #46   | `prs/039` | Customer deactivation under `customers.deactivate`, page figures, paged sales, activity filter, address in form    |
| #42   | `prs/040` | Accueil: expenses per business day, daily tiles follow the period, drawer cash formula, quick actions              |
| #48   | `prs/041` | Approximate product cost under `margin.view`, margin per product, cost snapshot on sold lines, Accueil margin tile |
| #49   | `prs/042` | Cached pickers, editable direct-sale price bounded by cost, total-based line entry, direct-sale quick action       |
| 010   | `prs/043` | Container images, compose stack on `pg-network`, remote deploy with readiness gate and rollback, CI deploy job     |

Each brief carries its own verification (unit suites, browser flows on the
system browser at three widths) and its open decisions.

## Migrations

Five migrations since `v1.4.0`, applied in order by CI on every run from an
empty database, all additive:

| Migration                                 | Effect                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260924180000_payment_document_state`   | `purchases.remaining_due_tnd`, reversal columns on the three payment tables, indexes, projections rebuilt; the purchase terms check no longer pins the paid amount |
| `20260924190000_order_queue_indexes`      | Indexes for the order queue                                                                                                                                        |
| `20260925100000_sale_cancellation`        | `sales.cancelled_*`, `sale_payments.movement`, `POS_SALE_CANCELLATION` source type, index                                                                          |
| `20260925110000_customer_queries_indexes` | Indexes for a customer's sales and ledger                                                                                                                          |
| `20260925120000_product_approximate_cost` | `products.approximate_cost_tnd` with its check, `unit_cost_tnd` on the three sold-line tables                                                                      |

| Environment                                     | `migrate deploy` result                                                                            | Date       | Operator |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------- | -------- |
| Remote development                              | applied by the owner up to `payment_document_state` after its constraint fix; later ones to record | 2026-09-25 | owner    |
| Production (`dar_el_baraka` on `postgres-prod`) | empty database, migrated by the first deploy run                                                   | pending    | pipeline |

## Permissions

Three keys added since `v1.4.0`: `pos.cancel_sale` ("Annuler une vente"),
`customers.deactivate` ("Désactiver un client"), `margin.view` ("Voir la
marge approximative"). The catalogue holds 49 keys; the Super Admin role
receives every key at boot; the demo `Gérant` receives all but the user and
role administration. Other roles need a manual grant from the Rôles page.

## API contract

`backend/openapi.json`: OpenAPI 3.0.3, 92 paths, 124 operations, checked in
CI against the route catalogue; `frontend/src/lib/api/types.gen.ts`
regenerated from it and checked in CI. Every route is served under `/api/v1`;
the `/api` aliases planned for removal in Sprint 28 are still served.

## Environment

One new backend setting, `SESSION_COOKIE_SECURE` (default on in
production), for the deployment reached over plain HTTP on the VPS address.
The deployment reads the whole backend `.env` from the `BACKEND_ENV` secret
of the `production` GitHub environment (see `deploy/README.md`).

## R10 release gate

Against the gate of `04_V2_RELEASE_ROADMAP.md`, as replanned by the owner
after Sprint 27 (the deployment, backup and UAT sprint was replaced by the
cache work and the issue-driven fixes):

| Gate item                                                       | Status                                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Sprint 27 delivered (`UI-22` to `UI-25`)                        | met: PR #38; Lighthouse accessibility 100 on the login page; axe over thirty routes |
| Sprint 28 as replanned (cache, fixes #41 to #49)                | met: PR #40, #50 to #58                                                             |
| Docker images, compose, entrypoint migration, Node pin          | met: PR #59 (issue 010)                                                             |
| Scheduled backups and restore rehearsal (`OD-015`)              | **not done**, by the owner's decision (no backup step in the pipeline)              |
| Native bcrypt, FK backfill, `timestamptz`, `/api` alias removal | **not done**; dropped with the Sprint 28 replan                                     |
| UAT scripts executed and signed                                 | **not run**                                                                         |
| Stakeholder demo accepted on a phone and a laptop               | **pending**: shown manually by the owner (the automated replay is parked)           |
| First deployment on the VPS                                     | **pending**: the pipeline is merged; the first run follows the promotion            |
| `v2.0.0` tag                                                    | **pending**: on `dev` once the owner signs this gate (DEC-V2-001)                   |

## Release checklist position

Against `templates/RELEASE_CHECKLIST.md`:

- Scope, documentation, code quality, security, data and migration lines:
  met by the suites above, the CI drift and migration steps and the briefs.
  "Upgrade from previous release" is met by the linear chain applied in CI
  and by the owner's `migrate deploy` on the remote development database,
  which surfaced and fixed the purchase-terms constraint before promotion.
- UI and localization lines: met by the browser suites at three widths and
  the axe audit; the 430 px width is covered by the responsive check of
  Sprint 27, not by a browser flow.
- Domain correctness lines: met by the service suites of each module; the
  cost simulation still has no ledger effect; posted history is never
  hard-deleted (customers deactivate, sales cancel with a reversal).
- Backup and restore: not done, owner's decision.
- Deployment and operations: environment variables held as secrets, health
  checks in the images and the deploy script, runbook in `deploy/README.md`,
  smoke by the deploy job; the first deployment result is to be recorded
  in the table above.
- UAT: not run.

## Tagging

This branch does not tag. Per DEC-V2-001 the tag goes on `dev`, on the
commit that carries this file, once the owner signs the gate above knowing
its pending lines. The command, from an up-to-date `dev`:

```
git tag -a v2.0.0 -m "v2.0.0 - Dar El Barka V2, first stable version"
git push origin v2.0.0
```
