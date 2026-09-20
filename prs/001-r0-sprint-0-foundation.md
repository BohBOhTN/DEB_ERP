# R0 Sprint 0 Foundation Scaffold

## Branches

- Source: `feature/r0-sprint-0-foundation`
- Target: `dev`

## Scope

Implements Release R0, Sprint 0 repository and environment foundation.

This PR establishes the backend and frontend project baseline, quality commands, CI workflow, Prisma schema baseline, safe environment examples, and health check endpoint. It does not add business modules.

## Summary

- Added root npm workspace for `backend` and `frontend`.
- Added Express, TypeScript, Prisma, and Vitest backend foundation.
- Added Vite, React, TypeScript, and Vitest frontend foundation.
- Added API health endpoint at `GET /api/health`.
- Added correlation ID middleware and API response envelope.
- Added safe `.env.example` files for backend and frontend.
- Added README setup, command, health check, and Prisma workflow documentation.
- Added GitHub Actions CI for install, Prisma generation, formatting, lint, typecheck, tests, and build.
- Updated `.gitignore` for secrets, local files, dependencies, build output, coverage, and TypeScript build cache.

## Out of Scope

- Authentication and session lifecycle.
- Dynamic RBAC.
- Products, raw materials, units, and inventory.
- Suppliers, purchases, POS, customers, orders, distributors, expenses, simulation, and audit modules.
- Database migrations for business or authentication entities.

## Verification

- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed.
- `npm run build`: passed.
- `npm run prisma:validate`: passed.
- `curl http://localhost:5000/api/health`: returned `status: ok` and `database.status: ok` in local development.

## Database and Migration Impact

No database migration is included.

`backend/prisma/schema.prisma` was added as the baseline Prisma schema. The first migration should be created when Sprint 1 introduces authentication and session persistence.

## Environment Impact

Added placeholder-only examples:

- `backend/.env.example`
- `frontend/.env.example`

Real `.env` files remain ignored.

Backend variables documented:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `CORS_ALLOWED_ORIGINS`
- `RATE_LIMIT_MAX`
- `RATE_LIMIT_WINDOW_MS`

Frontend variable documented:

- `VITE_API_BASE_URL`

## Risks and Follow-Up

- `npm audit --omit=dev` reports a Prisma CLI transitive advisory through `deepmerge-ts`. The suggested `npm audit fix --force` would force a Prisma version change, so it was not applied in this PR.
- Sprint 1 should add authentication entities, session persistence, protected middleware, and the French login/application shell.
- CI should be confirmed on GitHub before merging into `dev`.

## Merge Checklist

- [ ] CI passed on GitHub.
- [ ] No real `.env` files or secrets committed.
- [ ] Scope remains limited to R0 Sprint 0.
- [ ] Target branch is `dev`.
