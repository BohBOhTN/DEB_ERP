# R0 Sprint 1 Authentication and Protected Shell

## Branches

- Source: `feature/r0-sprint-1-auth-shell`
- Target: `dev`

## Scope

Implements Release R0, Sprint 1 authentication and protected application shell.

This PR adds email/password authentication, bcrypt password hashing, opaque server-side sessions, current-user lookup, logout, active-user enforcement, a protected French application shell, the Dar El Barka logo asset, and focused tests.

## Summary

- Added `User` and `AuthSession` Prisma models.
- Added forward migration for authentication tables.
- Added bcrypt password hashing and verification.
- Added login, current-user, and logout API endpoints under `/api/auth`.
- Added HTTP-only session cookie handling.
- Added active-user enforcement for authentication and session reuse.
- Added reusable protected authentication middleware.
- Added baseline login rate limiting.
- Added a local user creation script for development bootstrap.
- Replaced the Sprint 0 health screen with a French login flow and protected shell.
- Added the Dar El Barka logo under `frontend/public/assets/`.
- Rendered the logo on the login screen and authenticated shell header.
- Added backend service and route tests for valid login, invalid credentials, inactive users, anonymous access, current user, and logout.
- Added frontend tests for session bootstrap, login, logo rendering, and generic French login failure.

## Out of Scope

- Dynamic RBAC management.
- Permission matrix UI.
- Super Admin role invariants.
- Products, inventory, suppliers, purchases, POS, customers, orders, distributors, expenses, simulation, and audit modules.
- Social login or multi-factor authentication.

## Verification

- `npm run test --workspace frontend`: passed after adding and optimizing the logo.
- `npm run build --workspace frontend`: passed after adding and optimizing the logo.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed.
- `npm run build`: passed.
- `npm run prisma:validate`: passed.

## Database and Migration Impact

Adds migration:

- `backend/prisma/migrations/20260920235000_add_auth_foundation/migration.sql`

New tables:

- `users`
- `auth_sessions`

No business data tables are added.

## Asset Impact

Adds:

- `frontend/public/assets/dar-el-barka-logo.png`

The logo was optimized to `512x512` for web use before pushing.

## Environment Impact

Adds optional backend variables with defaults:

- `SESSION_COOKIE_NAME`
- `SESSION_TTL_MINUTES`

Existing real `.env` files remain ignored.

## Risks and Follow-Up

- `effectivePermissions` is intentionally empty until R1 Sprint 2 implements dynamic RBAC.
- The user creation script is for local/bootstrap use and should be replaced or constrained by an approved admin workflow in later sprints.
- `npm audit --omit=dev` continues to report the Prisma CLI transitive advisory through `deepmerge-ts`; the forced npm fix was not applied because it changes Prisma versions.

## Merge Checklist

- [ ] CI passed on GitHub.
- [ ] Migration reviewed before applying to any shared database.
- [ ] No real `.env` files or secrets committed.
- [ ] Scope remains limited to R0 Sprint 1.
- [ ] Target branch is `dev`.

## GitHub PR Link

Use this compare URL:

```text
https://github.com/BohBOhTN/DEB_ERP/compare/dev...feature/r0-sprint-1-auth-shell?expand=1
```
