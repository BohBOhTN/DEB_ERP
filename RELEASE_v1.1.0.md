# Release v1.1.0 Evidence

Release R6, platform hardening and API contract: Sprints 15 to 17, merged to
`dev` as PR #24, #25 and #26. Written from what was verified, and plain
about what was not.

## Quality suite

Locally on the merge commit of PR #26 (macOS, Node 24.15.0) and in the CI run
of that pull request (Ubuntu, Node 24, PostgreSQL 16 service):

| Command                       | Result                                                   |
| ----------------------------- | -------------------------------------------------------- |
| `npm run format:check`        | passed                                                   |
| `npm run lint`                | passed, zero warnings                                    |
| `npm run typecheck`           | passed, backend and frontend (generated types included)  |
| `npm run test`                | 305 backend tests passed, 10 skipped locally; 3 frontend |
| `npm run test:integration`    | CI only: fixture seeded, p95 budget held                 |
| `npm run db:check-drift`      | CI only: no drift beyond the protected objects           |
| `npm run openapi:check`       | passed: `backend/openapi.json` matches the routes        |
| `npm run api:types` then diff | passed: `frontend/src/lib/api/types.gen.ts` matches      |
| `npm run build`               | passed, backend and frontend                             |

The ten tests skipped locally are the PostgreSQL-backed suites (idempotency,
inventory and reference concurrency, the order-completion race, the
performance suite). CI runs them with `REQUIRE_INTEGRATION_TESTS=1`, so a
missing database fails the build instead of skipping.

## Timings (Sprint 16 fixture, CI run of PR #25)

Fixture: 5 000 products, 200 customers with 10 000 ledger rows, 50 suppliers
with 1 000 purchases, 10 distributors with 500 dispatches, 3 000 expenses.
p95 over 20 samples, budget 150 ms:

| Read                              | p95 ms |
| --------------------------------- | ------ |
| customer balances (name order)    | 20.8   |
| customer balances (balance order) | 25.9   |
| customer statement                | 22.4   |
| supplier balances                 | 26.5   |
| supplier statement                | 15.2   |
| distributor balances              | 3.0    |
| distributor statement             | 7.4    |
| custody                           | 34.1   |
| expense totals                    | 20.2   |
| product search                    | 7.8    |

Product search uses `products_normalized_name_trgm_idx` (bitmap index scan,
0.041 ms execution on the fixture). The suite ran again on PR #26 after the
Sprint 17 schema changes and stayed within budget.

## Acceptance scenarios

| ID       | Proof                                                                                              | Status |
| -------- | -------------------------------------------------------------------------------------------------- | ------ |
| AS-V2-01 | `errorHandler.test.ts`: a forced 500 is logged with the correlation id the client received         | passes |
| AS-V2-02 | `idempotency.concurrency.test.ts` against PostgreSQL: duplicate concurrent posts replay, never 500 | passes |
| AS-V2-03 | `inventory.service.concurrency.test.ts`: concurrent adjustments commit independently               | passes |
| AS-V2-04 | performance suite p95 3 to 34 ms, budget 150                                                       | passes |
| AS-V2-05 | `access.service.test.ts`: permission loss effective next request; catalogue read writes nothing    | passes |
| AS-V2-06 | performance suite: "the" finds "Thé à la menthe" through the trigram index                         | passes |
| AS-V2-07 | `app.runtime.test.ts`, route matrices, `openapi.test.ts`: every route on `/api/v1` and `/api`      | passes |
| AS-V2-08 | `home.service.test.ts`: `payables` absent without `supplier_balances.view`, other blocks present   | passes |
| AS-V2-09 | `references.concurrency.test.ts`: 20 concurrent `VT-` and `AC-` allocations distinct               | passes |

## Migrations

Five migrations since `v1.0.0` (`dev` at `4db1965`), applied in order by CI on
every run from an empty database:

| Migration                                   | Effect                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `20260922140000_add_v2_query_indexes`       | `pg_trgm`, 12 btree and 8 GIN trigram indexes                                                   |
| `20260922150000_add_document_references`    | sequences, `sales.reference` backfilled then unique and mandatory, `purchases.reference` unique |
| `20260922151000_inventory_source_type_enum` | `source_type` text becomes the `InventorySourceType` enum                                       |
| `20260922152000_unify_payment_method_enum`  | one `PaymentMethod` enum; the five per-table enums are dropped                                  |
| `20260922153000_add_user_version`           | `users.version` for optimistic updates                                                          |

The SQL-only objects (partial unique indexes, the two sequences, the
extension) are listed in `backend/prisma/protected-objects.json` and guarded
by the CI drift step.

**Remote development database:** the migrations have not been applied by
this repository; the owner runs `npm run prisma:migrate:deploy --workspace
backend` against it and records the result below before tagging.

| Environment        | `migrate deploy` result | Date | Operator |
| ------------------ | ----------------------- | ---- | -------- |
| Remote development | _pending_               |      |          |

## API contract

- Every route is served under `/api/v1`; the `/api` prefix stays for the V1
  frontend and answers `Deprecation: true`.
- The contract is `backend/openapi.json` (OpenAPI 3.0.3, 82 paths, 113
  operations, validated with swagger-cli), regenerated with
  `npm run openapi:generate --workspace backend`, served at
  `GET /api/v1/openapi.json` outside production.
- Frontend types: `frontend/src/lib/api/types.gen.ts`, regenerated with
  `npm run api:types --workspace frontend`. Unused by the V1 screens.

## Environment

Twelve optional variables with defaults were added across Sprints 15 and 16
(`backend/.env.example`): rate limit, trust proxy, logging, `GIT_SHA`,
idempotency TTL, request and shutdown timeouts, slow-query threshold,
permission cache TTL, session touch interval, and pool settings on
`DATABASE_URL`. Deployments behind nginx must set `TRUST_PROXY=1`.

## R6 release gate

| Gate item                                             | Status                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| Sprints 15 to 17 accepted                             | met: PR #24, #25, #26 merged with CI green                         |
| Full quality suite and integration suite green in CI  | met on PR #26                                                      |
| `RELEASE_v1.1.0.md` with timings, migrations, OpenAPI | this file; remote development migration line pending               |
| `v1.1.0` tagged                                       | **pending**: on `dev` once the line above is recorded (DEC-V2-001) |

## Release checklist position

Against `templates/RELEASE_CHECKLIST.md`, relative to the `v1.0.0` position:

- Scope, documentation, code quality, security, data and migration lines:
  met, by the suites above and the CI drift and migration steps. "Upgrade from
  previous release" is met by the linear chain applied in CI; the enum
  consolidation migrates existing rows and was exercised by CI on the seeded
  fixture.
- UI and localization lines: unchanged from `v1.0.0`; this release touched no
  screen. The responsive review (`AS-020`) remains open and is superseded by
  the V2 redesign (R7 to R10), whose acceptance checklist replaces it.
- Backup and restore rehearsal: still out of scope by direction (`OD-015`),
  scheduled for R10 Sprint 28.
- UAT: not run; the V2 plan schedules it in R10.

`v1.0.0` was never tagged, for the reasons recorded in `RELEASE_v1.0.0.md`.
Decision DEC-V2-001 in the V2 decision log closes that question: `v1.0.0`
stays untagged, and each V2 release is tagged on `dev` at its release gate.
The R6 gate is met except for the remote development migration line above;
once it is recorded, tag the commit on `dev` that carries this file:

```text
git tag -a v1.1.0 -m "v1.1.0 - Platform hardening and API contract" <dev-sha>
git push origin v1.1.0
```

The promotion of `dev` to `main` (`prs/022-release-v1.1.0-dev-to-main.md`)
is independent of the tag.
