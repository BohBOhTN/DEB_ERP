# R6 Sprint 16: Query performance and indexes

## Branches

- Source: `feature/r6-sprint-16-query-performance`
- Target: `dev`

## Scope

Release R6 (platform hardening), Sprint 16. Backend only. Closes `BE-13` to
`BE-24` from the V2 remediation plan. Response shapes stay backward compatible
for the V1 frontend; new query parameters and `meta` blocks are additive.

## Summary

- **Aggregation in SQL.** Customer, supplier and distributor balance lists,
  the three statements, distributor custody, POS session close and expense
  totals no longer load whole ledgers into Node. Balances come from `groupBy`
  and `aggregate`; per-document balances from `groupBy` over the page's
  documents only; expense days from a `date_trunc` in `Africa/Tunis`.
- **Balance lists** accept `search`, `sort=name|balance` and `minBalance`.
  With `sort=balance` or `minBalance` the page is chosen from the ledger
  aggregate (largest balance first, parties without activity omitted).
- **Statements** accept `from`, `to`, `limit` and `cursor`; ledger entries
  page by cursor, document sections show the most recent `limit` rows with a
  `hasMore*` flag, and `meta` carries opening and closing balances and the
  calculation basis (`NFR-007`).
- **Payment transactions** read the party balance with one `aggregate` and the
  allocated documents' balances with one `groupBy`, instead of loading every
  ledger row under the lock.
- **Custody** is bounded to open dispatches plus lines with a discrepancy; a
  dispatch is closed once nothing is held, so closed dispatches cannot appear.
- **Indexes.** Migration `20260922140000_add_v2_query_indexes` adds the
  btree indexes for the filters actually used (sale payment state, cashier,
  session, audit action/correlation/target, purchase terms and due state,
  order status and fulfilment time, customer ledger kind, expense status and
  date, product name) and `pg_trgm` GIN indexes on the searched columns. All
  are declared in `schema.prisma` (GIN with `gin_trgm_ops`).
- **Search** at the POS matches the accent-stripped product name via the
  shared `normalizeName`, so "the" finds "Thé à la menthe".
- **Auth hot path.** Effective permissions are cached in process for
  `PERMISSION_CACHE_TTL_MS` (60 s) and invalidated by every access mutation;
  the session's `lastUsedAt` is written at most every
  `SESSION_TOUCH_INTERVAL_MS` (5 min); `GET /access/permissions` no longer
  re-seeds the catalogue.
- **Batching.** Purchase lines look up their raw materials with one query;
  distributor payment ledger entries use `createMany`; settlement line updates
  are pipelined.
- **List payloads** return document headers only (see changelog).
- **Prisma client** logs slow queries (`SLOW_QUERY_MS`) and the pool settings
  are documented in the connection string.
- **Integration suite** `src/integration/performance.test.ts` seeds a
  synthetic history (5 000 products, 200 customers with 10 000 ledger rows,
  50 suppliers with 1 000 purchases, 10 distributors with 500 dispatches,
  3 000 expenses), reconciles SQL balances with the rows, walks a statement
  by cursor, asserts a p95 latency budget (`INTEGRATION_LATENCY_BUDGET_MS`,
  default 150) for ten reads, and prints the product-search plan.
- **CI drift guard** `scripts/check-schema-drift.mjs` diffs the migrated CI
  database against `schema.prisma` and allows only the drops of the objects
  listed in `prisma/protected-objects.json` (partial unique indexes,
  sequences).

## Out of Scope

- `/api/v1` prefix, envelope standardisation, sort parameters on every list,
  detail endpoints (Sprint 17).
- Cursor pagination for `audit_events` and `inventory_movements` counts
  (deferred in the remediation plan).
- A shared permission cache across instances; the cache is per process and
  the TTL bounds staleness for changes made through another instance.
- Any frontend change.

## Verification

Run locally on macOS, Node 24.15.0:

- `npm run prisma:validate`: passed
- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed
- `npm run test --workspace backend`: 282 passed, 9 skipped (38 files
  passed, 4 skipped) before the integration suite was added; the suite adds
  4 gated tests
- `npm run build`: passed

**Not verified locally, by decision (`CI only`):** this machine has no
PostgreSQL or Docker. The following run only in CI and their results must be
read from the Actions log before merge:

| Item                                                                                                           | Where                                |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Migration `add_v2_query_indexes` applies (`prisma migrate deploy` step)                                        | CI                                   |
| Schema drift guard passes with only the protected drops (`Check schema drift` step)                            | CI                                   |
| AS-V2-04 p95 ≤ 150 ms for the ten reads on the fixture (`[performance] p95 ms` line)                           | CI                                   |
| AS-V2-05 permission removal effective on next request; catalogue read issues no write                          | `access.service.test.ts`, everywhere |
| AS-V2-06 unaccented search finds the accented product; `EXPLAIN` printed (`[performance] product search plan`) | CI                                   |
| Reconciliation: SQL balances equal ledger sums; cursor paging neither repeats nor skips                        | CI                                   |

### CI evidence (run of 2026-09-22 16:34 UTC, PostgreSQL 16 service)

The migration applied, the schema drift guard passed, the unit run passed,
and the performance suite passed on the fixture (5 000 products, 200
customers with 10 000 ledger rows, 50 suppliers, 10 distributors, 3 000
expenses). p95 over 20 samples, in milliseconds, budget 150:

| Read                              | p95  |
| --------------------------------- | ---- |
| customer balances (name order)    | 20.8 |
| customer balances (balance order) | 25.9 |
| customer statement                | 22.4 |
| supplier balances                 | 26.5 |
| supplier statement                | 15.2 |
| distributor balances              | 3.0  |
| distributor statement             | 7.4  |
| custody                           | 34.1 |
| expense totals                    | 20.2 |
| product search                    | 7.8  |

AS-V2-06 plan on 5 000 products: `Bitmap Index Scan on
products_normalized_name_trgm_idx` with `Index Cond: (normalized_name ~~
'%the a la menthe%')`, execution time 0.041 ms. The trigram index is used.

Reconciliation (SQL balance equals the ledger sum) and cursor paging
(neither repeats nor skips) passed on the same run.

Three fixture defects were found and fixed by CI before this evidence: a
closed POS session created without its closing amounts (the database check
constraint rejected it, as it should), a statement assertion that expected a
second page from a supplier with fewer rows than one page, and bulk inserts
above the bind-parameter limit.

The gate line "a deliberate partial-index removal turns the guard red" was
not exercised: it requires a throwaway CI run on a scratch branch, which I
cannot start from this machine.

## Database and Migration Impact

One additive migration: `CREATE EXTENSION IF NOT EXISTS pg_trgm`, 12 btree
indexes, 8 GIN trigram indexes. No data change. `schema.prisma` now declares
every index (GIN via `type: Gin` with `gin_trgm_ops`) and carries a
`PROTECTED OBJECTS` header; `prisma/protected-objects.json` lists the SQL-only
objects. The extension needs a role allowed to create extensions on the
target database (true for the CI service and the default development role).

## Environment Impact

New optional variables with defaults, documented in `backend/.env.example`
and `README.md`: `SLOW_QUERY_MS`, `PERMISSION_CACHE_TTL_MS`,
`SESSION_TOUCH_INTERVAL_MS`. The example `DATABASE_URL` now carries
`connection_limit=10&pool_timeout=10`. No real secrets.

## Risks and Follow-Up

- `sort=balance` and `minBalance` compute the aggregate for every party with
  activity before paging; at bakery scale (hundreds of parties) this is one
  indexed `GROUP BY`. Revisit if the party count reaches tens of thousands.
- The permission cache is per process; multi-instance deployments rely on
  the TTL for cross-instance changes (recorded as a follow-up for Sprint 28
  operations).
- Trigram plan choice depends on table size; on a small table PostgreSQL may
  still choose a sequential scan, which is correct and fast. The printed plan
  in CI documents the choice on the 5 000-product fixture.

## Merge Checklist

- [x] CI passed
- [x] No real `.env` files or secrets committed
- [x] Scope matches the sprint
- [x] Target branch is `dev`
