# Dar El Barka Bakery Management System

Dar El Barka is a French-only, mobile-first bakery management web application. This repository is currently closing Release R2: procurement, supplier balances, and supplier payments.

## Scope Status

Current sprint:

- Release: R2 Procurement
- Sprint: 6 Supplier balances and payments
- Scope: dynamic RBAC, catalog, units, inventory foundation, suppliers, purchase posting, supplier payable balances, and supplier payments
- Not in scope yet: POS, customers, orders, distributors, expenses, product-cost simulation, supplier opening balances, supplier returns, or supplier exchanges

## Repository Shape

```text
/
├── backend/   # Express API, TypeScript, Prisma
├── frontend/  # React web app, TypeScript, Vite
└── .github/   # CI workflow
```

## Prerequisites

- Node.js 22 or newer. CI uses Node 24.
- npm 10 or newer.
- PostgreSQL for local development when database-backed work begins.

## Environment Setup

Create local environment files from the examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Never commit real `.env` files, credentials, database passwords, tokens, or backups.

### Backend Environment

| Variable                      | Purpose                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`                    | Runtime environment, for example `development`                               |
| `PORT`                        | API port                                                                     |
| `DATABASE_URL`                | PostgreSQL connection string                                                 |
| `SESSION_COOKIE_NAME`         | HTTP-only session cookie name                                                |
| `SESSION_TTL_MINUTES`         | Session lifetime in minutes                                                  |
| `CORS_ALLOWED_ORIGINS`        | Comma-separated browser origins allowed to call the API                      |
| `RATE_LIMIT_MAX`              | Login attempts allowed per client address per window                         |
| `RATE_LIMIT_WINDOW_MS`        | Login rate-limit window in milliseconds                                      |
| `GLOBAL_RATE_LIMIT_MAX`       | Requests allowed on any route per client address per window                  |
| `GLOBAL_RATE_LIMIT_WINDOW_MS` | Global rate-limit window in milliseconds                                     |
| `TRUST_PROXY`                 | Reverse-proxy hops to trust for the client address (`1` behind nginx)        |
| `LOG_LEVEL`                   | pino level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`     |
| `LOG_PRETTY`                  | `true` for human-readable terminal logs; production emits JSON               |
| `GIT_SHA`                     | Commit identifier reported by the health endpoints                           |
| `IDEMPOTENCY_TTL_DAYS`        | Days an idempotency record is kept before cleanup                            |
| `SLOW_QUERY_MS`               | Queries at or above this duration are logged as slow                         |
| `PERMISSION_CACHE_TTL_MS`     | In-memory lifetime of a user's effective permissions (invalidated on change) |
| `SESSION_TOUCH_INTERVAL_MS`   | Minimum interval between two writes of a session's last-used timestamp       |
| `REQUEST_TIMEOUT_MS`          | Socket timeout for a single request                                          |
| `SHUTDOWN_TIMEOUT_MS`         | Grace period for in-flight requests on SIGTERM                               |

### Frontend Environment

| Variable            | Purpose                                                               |
| ------------------- | --------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | Browser-visible API base URL, for example `http://localhost:4000/api` |

Frontend variables are public at build time. Do not put secrets in `frontend/.env`.

## Commands

Install dependencies:

```bash
npm install
npm run prisma:generate
```

Run both applications:

```bash
npm run dev
```

Run one application:

```bash
npm run dev:backend
npm run dev:frontend
```

Quality gate:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

## Health Check

The API exposes two probes, under both the legacy and the versioned prefix:

```text
GET /api/v1/health/live    # process is running; touches no dependency
GET /api/v1/health/ready   # database reachable; reports the latest migration
GET /api/health            # alias of /ready kept for the V1 frontend
```

Responses use the project envelope, include a correlation ID, and carry the
package version and `GIT_SHA` of the running build.

## API contract

Every route is served under `/api/v1` and, for the V1 frontend, under the
legacy `/api` prefix, which answers with `Deprecation: true`. Responses are
an envelope `{ data, meta }`; errors are
`{ error: { code, message, fieldErrors?, correlationId } }`. On `/api/v1` a
collection is `data: { items, page, pageSize, total, pageCount }` and every
list accepts `page`, `pageSize`, `q`, `sort=field:asc|desc` (whitelisted
per list) and `from`/`to` as business days in `Africa/Tunis`.

The contract is generated from the route schemas and committed:

```bash
npm run openapi:generate --workspace backend   # writes backend/openapi.json
npm run openapi:check --workspace backend      # fails when the file is stale (CI)
npm run api:types --workspace frontend         # writes frontend/src/lib/api/types.gen.ts
```

Outside production the running server also serves it at
`GET /api/v1/openapi.json`. A route without a record in
`backend/src/openapi/operations.ts` fails the unit tests.

## Logging and errors

Every request writes one structured log line (pino) with the correlation ID,
actor, route template, status and duration; every 5xx is logged with its stack
under the same correlation ID the client received in the error body and in the
`X-Correlation-Id` header. Clients may send their own `X-Correlation-Id`
(8 to 64 printable characters); anything else is replaced.

Idempotent commands return `Idempotency-Replayed: true` when the response was
served from the idempotency store rather than executed again.

## Balances and statements

Balances are summed by the database. The balance lists accept `search`,
`sort=name|balance` and `minBalance`; with `sort=balance` or `minBalance`
only parties with ledger activity are listed, largest balance first.
Statements accept `from`, `to`, `limit` (default 50, max 200) and `cursor`;
`meta.nextCursor` continues the ledger, and `meta.openingBalanceTnd` and
`meta.closingBalanceTnd` state the balance at the range boundaries.

## Schema drift guard

Some invariants exist only in hand-written migration SQL (partial unique
indexes, document-number sequences, the `pg_trgm` extension). They are listed
in `backend/prisma/protected-objects.json`, and CI runs
`npm run db:check-drift --workspace backend` after applying migrations so any
other difference between the database and `schema.prisma` fails the build.

## Authentication

Authentication uses email/password credentials with bcrypt password hashes and opaque server-side sessions stored in an HTTP-only cookie.

Available endpoints:

```text
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

Create a local user after applying migrations:

```bash
npm run users:create --workspace backend -- <email> <displayName> <password>
```

The current-user response includes the user's effective permission keys.

## Procurement API

R2 exposes procurement endpoints under `/api/procurement`. All endpoints require authentication and the matching permission key.

```text
GET    /api/procurement/suppliers
POST   /api/procurement/suppliers
PATCH  /api/procurement/suppliers/:supplierId

GET    /api/procurement/purchases
POST   /api/procurement/purchases
POST   /api/procurement/purchases/:purchaseId/post
POST   /api/procurement/purchases/:purchaseId/cancel

GET    /api/procurement/supplier-balances
GET    /api/procurement/suppliers/:supplierId/statement
GET    /api/procurement/supplier-payments
POST   /api/procurement/supplier-payments
```

Posting commands require an `Idempotency-Key` header. Supplier balances and statements are derived from ledger entries; supplier payments do not change stock and supplier opening balances are not implemented.

## Prisma Workflow

Prisma is configured in `backend/prisma/schema.prisma`. Sprint 1 adds the authentication foundation migration for `users` and `auth_sessions`.

For future migration work:

1. Use an isolated local PostgreSQL database and shadow database.
2. Never run destructive reset commands against remote development, staging, or production.
3. Generate named migrations locally from the backend workspace.
4. Inspect generated SQL before applying it to shared environments.
5. Apply committed migrations to shared environments with `prisma migrate deploy` or the approved project wrapper.

Useful backend commands:

```bash
npm run prisma:generate
npm run prisma:validate
npm run prisma:migrate:dev --workspace backend -- --name <migration_name>
npm run prisma:migrate:deploy --workspace backend
```

## Deployment

The release ships to the VPS from GitHub Actions: two container images
(`backend/Dockerfile`, `frontend/Dockerfile`), the compose stack and the
remote script under `deploy/`, and a `deploy` job in `.github/workflows/ci.yml`
behind the `production` environment's approval. Setup, secrets, the first
admin and day-to-day operations are in `deploy/README.md`.

## Branches

- `main`: protected release baseline
- `dev`: integration branch
- `feature/r2-sprint-6-supplier-payments`: current Sprint 6 implementation branch

## Documentation Authority

Internal planning docs are intentionally not tracked by this repository. Follow the internal source of truth and active release file when implementing each sprint.
