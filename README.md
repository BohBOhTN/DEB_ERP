# Dar El Barka Bakery Management System

Dar El Barka is a French-only, mobile-first bakery management web application. This repository is currently in Release R0, Sprint 1: authentication and protected application shell.

## Scope Status

Current sprint:

- Release: R0 Engineering Foundation
- Sprint: 1 Authentication and protected application shell
- Scope: authentication persistence, password hashing, session cookies, protected API middleware, French login shell, quality gates, CI
- Not in scope yet: dynamic RBAC, products, inventory, suppliers, POS, orders, distributors, expenses, or simulation

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

| Variable               | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| `NODE_ENV`             | Runtime environment, for example `development`          |
| `PORT`                 | API port                                                |
| `DATABASE_URL`         | PostgreSQL connection string                            |
| `SESSION_COOKIE_NAME`  | HTTP-only session cookie name                           |
| `SESSION_TTL_MINUTES`  | Session lifetime in minutes                             |
| `CORS_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the API |
| `RATE_LIMIT_MAX`       | Placeholder for Sprint 1 rate-limit maximum             |
| `RATE_LIMIT_WINDOW_MS` | Placeholder for Sprint 1 rate-limit window              |

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

The API exposes:

```text
GET /api/health
```

The response uses the project response envelope and includes a correlation ID.

## Authentication

Sprint 1 adds email/password authentication with bcrypt password hashes and opaque server-side sessions stored in an HTTP-only cookie.

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

The current-user response includes an empty `effectivePermissions` array. Dynamic permissions are implemented in R1 Sprint 2.

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

## Branches

- `main`: protected release baseline
- `dev`: integration branch
- `feature/r0-sprint-1-auth-shell`: current Sprint 1 implementation branch

## Documentation Authority

Internal planning docs are intentionally not tracked by this repository. Follow the internal source of truth and active release file when implementing each sprint.
