# R9 Sprint 26: Utilisateurs, rôles, audit, paramètres

## Branches

- Source: `feature/r9-sprint-26-access-audit-settings`
- Target: `dev`

## Scope

Release R9 (module redesign wave 2), Sprint 26. Closes `UI-19`, `UI-20`
and `UI-21`: users, roles and the permission matrix, the audit journal
and the settings page, rebuilt on the kit following the seven-step recipe.
Every remaining V1 frontend file is deleted, including `global.css`, the
legacy screen wrapper and the "Ancienne interface" badge, so the frontend
contains V2 code only. No backend change.

## Summary

- Screens rebuilt (07 sections 4.10 to 4.12): `Utilisateurs`
  (`/utilisateurs`), `Rôles et autorisations` (`/roles`, `/roles/:roleId`),
  `Journal d'audit` (`/audit`), `Paramètres` (`/parametres`, previously a
  redirect to the home page).
- Access: `features/access/{access.api,access.queries,access.schemas}.ts`,
  `pages/UsersPage` (name, e-mail, role chips, status; search, role and
  status filters in the URL; row actions Modifier, Rôles, Réinitialiser le
  mot de passe, Désactiver / Réactiver through `ConfirmDialog`; the
  server's French refusal for the last active Super Admin shown inside the
  dialog), `pages/RolesPage` (master-detail on desktop, list then page on
  phones with breadcrumbs), `components/UserFormDialog` (creation with a
  generated temporary password, regenerate and copy buttons, role
  checkboxes; edition of name and e-mail with the version),
  `UserRolesDialog`, `ResetPasswordDialog` (temporary password,
  OD-V2-011 default), `RoleFormDialog`, `RoleEditor` (name, description,
  the matrix, a sticky save bar, `useBlocker` guard with a confirmation
  before leaving unsaved changes; the Super Admin role read-only with its
  explanation), `PermissionMatrix` (groups from `GET /access/permissions`,
  search over module, label and description, select-all per group with
  the count; keys never rendered as text).
- Audit: `features/audit/{audit.api,audit.queries}.ts`, `pages/AuditPage`
  (French action and entity labels first, actor, reason; action, entity,
  date range and correlation id filters in the URL from `GET
/audit-filters`; target links to the rebuilt detail routes through
  `components/auditLinks.ts`), `components/AuditEventSheet` (the event's
  story with a before / after table highlighting the changed fields and a
  copyable correlation id).
- Settings: `features/settings/settings.api.ts`, `pages/SettingsPage`
  (profile from the session: name, e-mail, roles, session expiry; the
  application block with the current till terminal when the user may open
  the till, the main location, currency and time zone; "À propos" with
  the version, git revision, environment and database state from `GET
/health/ready`). The password change is hidden because the API has no
  endpoint for it (OD-V2-011 default: the Super Admin sets a temporary
  password).
- Shell: the user menu's `Paramètres` entry now navigates to
  `/parametres`; a permission or role change invalidates the session query
  so the caller's own navigation follows the new matrix.
- API endpoints consumed (all under `/api/v1`): `GET /access/permissions`,
  `GET/POST /access/roles`, `GET/PATCH /access/roles/{id}`, `PUT
/access/roles/{id}/permissions`, `GET/POST /access/users`, `GET/PATCH
/access/users/{id}`, `POST /access/users/{id}/password-reset`, `PUT
/access/users/{id}/roles`, `PATCH /access/users/{id}/activation`, `GET
/audit-events`, `GET /audit-filters`, `GET /health/ready`.
- V1 files deleted: `features/access/AccessManagement.tsx`, `accessApi.ts`,
  `features/audit/AuditManagement.tsx`, `auditApi.ts`, `styles/global.css`,
  `services/health.ts`, `features/auth/authApi.ts` (its only consumers were
  V1 screens), `features/catalog/catalogApi.ts` (shim), the whole
  `features/legacy/` folder (`LegacyScreen`, `legacyRoutes`,
  `useSessionUser`). The `legacy` route handle, `fr.legacyInterface` and
  the badge in `ProtectedLayout` are removed; the `postcss-prefix-selector`
  scoping in `vite.config.ts` and its dev dependency are removed (ADR-V2-003
  closed). Proof, run on the branch:

  ```text
  $ rg "Management.tsx|global.css" frontend/src
  (no output, exit code 1)
  $ ls frontend/src/features/legacy frontend/src/services
  (no such directories)
  ```

### Deliverables by requirement

| ID    | Delivered                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI-19 | Users table with role chips and status, filters, creation with a temporary password, edition, role assignment, password reset, activation with impact and the last-Super-Admin explanation; roles master-detail with the matrix grouped by module, French labels and descriptions, search, select-all per group, sticky save, unsaved guard, Super Admin read-only |
| UI-20 | Audit table with French labels, actor, reason and target links; action, entity, period and correlation filters in the URL; the event sheet with the before / after diff and the copyable correlation id                                                                                                                                                            |
| UI-21 | Settings with the profile, the application identity and the build; the password change hidden until its endpoint exists                                                                                                                                                                                                                                            |

## Out of Scope

- Self-service password change (`OD-V2-011`): no endpoint on the API; the
  page says to ask a Super Admin for a temporary password.
- Terminal and location management: no listing endpoints; the settings
  page shows the current session's terminal and the fixed main location.
- Audit export and retention settings (no endpoints).

## Verification

Run locally on macOS, Node 24.15.0:

- `npm run format:check`: passed
- `npm run lint` (ESLint with hooks and a11y rules, stylelint): passed,
  zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 307 passed, 10 skipped (backend
  untouched)
- `npm run test --workspace frontend`: 186 passed (82 files), including
  `AccessPages.test.tsx` (the temporary password shape; AS-V2-22 grant of
  `customer_balances.view` and `audit.view` to `Caissier` from the matrix
  with the audit before / after and the session re-read showing the new
  navigation entry; the Super Admin role read-only and the unsaved guard
  cancelled on navigation; user creation with a generated password and a
  role, the refusal to deactivate the last Super Admin with the server's
  sentence, the deactivation of a cashier; password reset and role
  replacement from the row; the settings page content and the absence of
  a password field) and `AuditPage.test.tsx` (target links; French labels
  with no raw key in the table, the action filter through the URL, the
  sheet with the diff row and the correlation id)
- `npm run build`: passed; initial JavaScript 196.2 kB gzip against the
  250 kB budget; POS chunk 11.2 kB against 120 kB
- `npm run openapi:check` and `npm run api:types`: unchanged, backend
  untouched; every client path checked against the document by
  `contractPaths.test.ts`
- `npm run e2e --workspace frontend` (Playwright on the system Brave
  browser): 19 passed, 1 skipped by design, at 360 and 1280 px: the shell
  smoke (every module now checked by heading, no "Ancienne interface"
  anywhere, the login round-trip lands on the rebuilt `/utilisateurs`),
  the seven module flows and the access flow below
- `npm run screen:review --workspace frontend`: login, home and the
  twenty-eight rebuilt routes at 360, 430, 768 and 1280 px, no horizontal
  overflow; the legacy mode of the script is removed

Acceptance scenarios:

| ID       | Where                                                                                                                                                                                                                                                                                                                       | Result |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AS-001   | `e2e/shell.spec.ts` (both widths): wrong password refused with the generic message, correct password lands on the requested rebuilt route, every module opens inside the shell, logout returns to the login page                                                                                                            | pass   |
| AS-002   | `AccessPages.test.tsx` and `e2e/access.spec.ts`: a permission granted from the matrix applies at the next request (the session re-read shows the new entry, no deployment); the last active Super Admin cannot be deactivated and the refusal reads "Le dernier Super Admin actif ne peut pas être désactivé."              | pass   |
| AS-V2-22 | `AccessPages.test.tsx` and `e2e/access.spec.ts` at 360 and 1280 px: `Voir les soldes clients` ticked for `Caissier` and saved; the audit lists "Modification des autorisations d'un rôle" with the before / after keys in the sheet; the deactivation refusal explained in French; a user created with a temporary password | pass   |

## UX acceptance checklist

Executed for the five screens (users, roles list, role editor, audit,
settings) against `09_UX_ACCEPTANCE_CHECKLIST.md`. Owner decision: no
screenshot images; the automated checks are the evidence.

| Section                        | Result                                                                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Layout and responsiveness    | pass: `screen:review` at four widths on the four routes; roles as a two-column master-detail from 900 px and list-then-page below; card mode on the tables below 600 px; the matrix in two columns from 900 px; the sticky save bar clears the bottom navigation on phones |
| B Brand and visual consistency | pass: tokens only, `PageHeader` + `FilterBar` + `DataTable`, `Checkbox`, `Badge`, `StatusPill`, `ConfirmDialog`, `FormDialog`, `Sheet`, `KeyValueList`, `Card` reused; no new primitive                                                                                    |
| C Copy and localisation        | pass: French with accents; permission keys never rendered as text (asserted on the matrix and the audit table); action and entity labels from the API; the audit diff shows the stored field names, which are the record's own keys                                        |
| D Screen states                | pass: skeleton, background refresh, empty with the next action, field and server errors, denied through the route guard, error with retry, success toast after the server, stale version refused on user edition                                                           |
| E Business safety              | pass: activation through `ConfirmDialog` with the impact sentence; the last-Super-Admin refusal shown in place; unsaved matrix changes guarded on navigation; the temporary password shown once with a copy button                                                         |
| F Accessibility                | pass: labelled checkboxes, named groups per module, the role list as a list of buttons with `aria-current`, focus trap in dialogs and the sheet, the save status announced politely; `axe` still planned for Sprint 27                                                     |
| G Performance                  | pass: the permission catalogue and audit filters cached five minutes; server pagination on users and audit; one request per save (two when the name also changed); the four pages lazy-loaded (users chunk 4.2 kB gzip)                                                    |

## Database and Migration Impact

None.

## Environment Impact

None. One dev dependency removed (`postcss-prefix-selector`).

## Risks and Follow-Up

- The audit diff labels fields by their stored key (`permissionKeys`,
  `isActive`): the API stores raw snapshots without field labels. A French
  field dictionary is a follow-up if the owner asks for it.
- The role editor saves the header and the matrix as two requests when
  both changed; the second failing leaves the name saved, which the toast
  reports.
- No `v1.4.0` tag by owner decision (releases stay untagged). With this
  sprint merged, the R9 release gate is met except the tag: the frontend
  contains only V2 code, and every V1 acceptance scenario has been
  exercised through the V2 UI across Sprints 20 to 26. Promotion of `dev`
  to `main` is the owner's step.

## Merge Checklist

- [ ] CI passed
- [x] No real `.env` files or secrets committed
- [x] Scope matches the sprint
- [x] Screen specs delivered in full (07 sections 4.10 to 4.12)
- [x] `12_SPRINT_STATUS_V2.md` and `CHANGELOG.md` updated
- [x] Target branch is `dev`
