# R1 Sprint 2 Dynamic RBAC

## Branches

- Source: `feature/r1-sprint-2-dynamic-rbac`
- Target: `dev`

## Scope

Implements Release R1, Sprint 2 dynamic role-based access control.

This PR adds the permission catalog, role and user-role persistence, effective permission evaluation, backend action guards, protected Super Admin bootstrap and invariants, audit records for access changes, and a French access-management workspace.

## Summary

- Added `Permission`, `Role`, `RolePermission`, `UserRole`, and `AuditEvent` Prisma models.
- Added an additive RBAC migration.
- Added the stable permission catalog from the source of truth.
- Added idempotent permission and protected Super Admin bootstrap.
- Assigns the protected Super Admin role to the first active user only when no active Super Admin assignment exists.
- Calculates effective permissions from active user roles on login and each current-user request.
- Added `/api/access` endpoints for permissions, roles, role permissions, user creation, users, user-role assignment, and user activation.
- Added exact backend permission checks for role and user access actions.
- Prevents protected Super Admin role deactivation and permission stripping.
- Prevents deactivation of the last active Super Admin inside a transaction-level advisory lock.
- Revokes active sessions when a user is deactivated.
- Adds audit events for role creation/update, permission assignment, user-role assignment, user activation, user deactivation, and Super Admin bootstrap.
- Adds a guarded French frontend access workspace with role list, permission matrix, user creation, user role assignment, and activation controls.
- Mirrors frontend navigation and actions from effective permission keys while preserving backend enforcement as authority.
- Added allowed, denied, and anonymous backend route tests for protected access routes.

## Out of Scope

- Product, category, unit, raw material, inventory, supplier, purchase, POS, customer, order, distributor, expense, simulation, and audit viewer business screens.
- Per-user deny rules.
- Role deletion.
- Catalog and inventory Sprint 3 or Sprint 4 behavior.

## Verification

- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed with local-port permission for Supertest.
- `npm run build`: passed.
- `npm run prisma:validate`: passed.

## Database and Migration Impact

Adds migration:

- `backend/prisma/migrations/20260921010000_add_dynamic_rbac/migration.sql`

New tables:

- `permissions`
- `roles`
- `role_permissions`
- `user_roles`
- `audit_events`

Startup seed impact:

- Upserts the permission catalog.
- Upserts the protected `SUPER_ADMIN` system role.
- Ensures the protected Super Admin role has all permission grants.
- Assigns the protected Super Admin role to the first active user only when no active Super Admin assignment exists.

No destructive schema changes are included.

## Environment Impact

No new environment variables are required.

Existing real `.env` files remain ignored.

## Risks and Follow-Up

- The audit table is written for access changes, but a dedicated audit viewer is deferred until its module is in scope.
- `npm audit --omit=dev` previously reported the Prisma CLI transitive advisory through `deepmerge-ts`; this PR does not force package upgrades.

## Requirement Mapping

- IAM-001: role create, update, activate, and deactivate support.
- IAM-002: role permission matrix support.
- IAM-003: user creation and user-role assignment support.
- IAM-004: effective permissions are the union of active role grants.
- IAM-005: grants only; no deny rule added.
- IAM-006: protected Super Admin receives every permission.
- IAM-007: protected Super Admin role cannot be deactivated or stripped through the API.
- IAM-008: last active Super Admin deactivation is blocked.
- IAM-009: frontend navigation and workspace actions are permission guarded.
- IAM-010: backend endpoints enforce action permissions.
- IAM-011: backend remains the security authority.
- IAM-012: permission changes affect the next authorized request.
- IAM-013: access changes are audited.
- IAM-014: deactivated users cannot continue using active sessions.

## Merge Checklist

- [ ] CI passed on GitHub.
- [ ] Migration reviewed before applying to any shared database.
- [ ] One person owns migration deployment to the shared development database.
- [ ] No real `.env` files or secrets committed.
- [ ] Scope remains limited to R1 Sprint 2.
- [ ] Target branch is `dev`.

## GitHub PR Link

Use this compare URL:

```text
https://github.com/BohBOhTN/DEB_ERP/compare/dev...feature/r1-sprint-2-dynamic-rbac?expand=1
```
