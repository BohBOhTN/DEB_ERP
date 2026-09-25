# R6 Sprint 15: Observability and runtime safety

## Branches

- Source: `feature/r6-sprint-15-observability-runtime-safety`
- Target: `dev`

## Scope

Release R6 (platform hardening), Sprint 15. Backend only; no route path or
response shape changes. Closes `BE-01` to `BE-12` from the V2 remediation plan.

## Summary

- Structured logging with pino: one line per request (correlation id, actor,
  route template, status, duration) and every 5xx logged with its stack under
  the correlation id the client received. Request bodies and secrets are never
  logged.
- Error handler maps body-parser failures (400/413/415) and Prisma known
  errors (P2002/P2003 → 409, P2025 → 404, P2034 → retryable 409,
  initialization → 503) instead of reporting them as retryable server errors.
  `STALE_VERSION` and `CONCURRENT_UPDATE` are replaced by the single
  documented `VERSION_CONFLICT` code.
- Client-supplied correlation ids are validated (8 to 64 printable characters)
  before being persisted in audit and ledger rows.
- `trust proxy` from configuration, login limiter moved to `express-rate-limit`
  with a pruning store, a global soft limiter, gzip compression, request and
  header socket timeouts.
- Graceful shutdown with a forced-exit timer and fatal handlers for unhandled
  rejections; `/api/v1/health/live` and `/ready` probes with package version,
  git sha and latest applied migration (`/api/health` kept as the ready alias).
- `InventoryService` no longer swaps its shared Prisma client for a transaction
  client; helpers receive the transaction explicitly.
- One shared `runIdempotentCommand` replaces six copies: stable payload hash,
  insert-first inside the transaction, unique-violation race handled by replay
  instead of a 500, `Idempotency-Replayed: true` header on replays.
- Cleanup job purges idempotency records past their TTL and long-expired
  sessions every six hours under a PostgreSQL advisory lock.
- Explicit `timeout`, `maxWait` and isolation level on all 14 interactive
  posting transactions.
- Accents restored in every backend user-facing message, with a test that
  scans the sources for the most common unaccented words.

## Out of Scope

- Query performance and indexes (Sprint 16).
- `/api/v1` mounting of business routes, envelope changes, sort parameters
  (Sprint 17). Only the health probes are under `/api/v1` now.
- Any frontend change. The V1 frontend keeps working unchanged; it only sees
  properly accented messages.
- Centralising every module's business message into `shared/messages.ts`
  (deferred to `BE-47`).

## Verification

Run locally on macOS, Node 24.15.0:

- `npm run prisma:validate`: passed
- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed
- `npm run test --workspace backend`: 275 passed, 9 skipped (36 files passed,
  4 skipped)
- `npm run test --workspace frontend`: 3 passed
- `npm run build`: passed, backend and frontend

The 9 skipped tests are the four real-PostgreSQL suites (`orders`,
`distribution`, and the two new ones below). This machine has no PostgreSQL or
Docker, so they are gated off locally exactly like the existing suites and run
in CI, where `REQUIRE_INTEGRATION_TESTS=1` makes a missing database fail the
build.

New acceptance scenarios and where they are proven:

| Scenario                                                                  | Test                                                          | Runs            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------- |
| AS-V2-01 forced 500 is logged with the client's correlation id            | `src/middleware/errorHandler.test.ts`                         | everywhere      |
| AS-V2-02 ten concurrent identical posts: one effect, nine replays, no 5xx | `src/shared/idempotency.concurrency.test.ts`                  | CI (PostgreSQL) |
| AS-V2-03 concurrent stock adjustments commit independently                | `src/modules/inventory/inventory.service.concurrency.test.ts` | CI (PostgreSQL) |

Other evidence:

- `rg "console\." backend/src` returns only the user-creation script.
- `rg "STALE_VERSION|CONCURRENT_UPDATE" backend/src` returns nothing.
- Authorization-matrix test still proves every non-health, non-auth route is
  guarded, with `/ready` and `/live` added to the documented public list.
- Manual shutdown check not performed on a running server (no local database
  to boot against); the sequence is unit-level only and should be exercised
  on the development server after merge.

## Database and Migration Impact

No migration. The idempotency record shape is unchanged; the hash of a payload
is now computed with sorted keys everywhere. A retry of a command whose record
was written by the previous procurement or inventory code with unsorted keys
could be reported as `IDEMPOTENCY_CONFLICT` once; such records are at most a
few hours old on the development database and are purged by the new cleanup
job after `IDEMPOTENCY_TTL_DAYS`.

## Environment Impact

New optional variables, all with defaults, documented in `backend/.env.example`
and `README.md`: `GLOBAL_RATE_LIMIT_MAX`, `GLOBAL_RATE_LIMIT_WINDOW_MS`,
`TRUST_PROXY`, `LOG_LEVEL`, `LOG_PRETTY`, `GIT_SHA`, `IDEMPOTENCY_TTL_DAYS`,
`REQUEST_TIMEOUT_MS`, `SHUTDOWN_TIMEOUT_MS`. No real secrets.

## Risks and Follow-Up

- Production deployments behind nginx must set `TRUST_PROXY=1`, otherwise all
  users share the proxy's rate-limit bucket.
- The replay marker on idempotent results is a non-enumerable symbol property;
  Sprint 17 replaces it with an explicit command result type when the envelope
  is standardised (`BE-26`).
- Run the graceful-shutdown check against the development server after merge
  and record it in the release evidence.

## Merge Checklist

- [ ] CI passed
- [x] No real `.env` files or secrets committed
- [x] Scope matches the sprint
- [x] Target branch is `dev`
