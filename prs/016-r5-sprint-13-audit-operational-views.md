# R5 Sprint 13 Audit and Operational Supervision

## Branches

- Source: `feature/r5-sprint-13-audit-operational-views`
- Target: `dev`

## Scope

Implements Release R5, Sprint 13: complete audit coverage, a permission-
protected audit viewer, the operational views section 18 requires, server-side
pagination and stable sorting on the new lists, and ledger reconciliation tests.

No advanced dashboard is added, as the release file instructs. This sprint
closes gaps in what is already built rather than adding a module.

## Summary

- Recorded authentication security events, the one category of `AUD` events
  that had no coverage: `auth.login`, `auth.logout`, and `auth.login_failed`
  with a reason of `invalid_password`, `inactive_user`, or `unknown_email`.
- Added the audit viewer: `GET /api/audit-events` with filtering by actor,
  action prefix, entity, target, correlation id and date range, plus
  `GET /api/audit-filters` to populate the controls.
- Added the POS sales list, which section 18 requires and which did not exist
  at all: by date, customer, payment state, and cashier.
- Added overdue and upcoming filters for purchases and for customer orders.
- Added the distributor settlement history as its own list.
- Gave every new list a stable sort, breaking ties on id so paging cannot
  repeat or skip a row.
- Added the French audit workspace with server-side paging and an empty state
  that tells the user what to change.
- Added ledger reconciliation tests.

## Audit coverage review

Section 17 lists fourteen categories that must be audited. I checked each
against the code rather than assuming:

| Category                                               | Before      | Now                                              |
| ------------------------------------------------------ | ----------- | ------------------------------------------------ |
| Login-relevant security events                         | **missing** | `auth.login`, `auth.logout`, `auth.login_failed` |
| User activation and deactivation                       | covered     | unchanged                                        |
| Role and permission changes                            | covered     | unchanged                                        |
| Master-data deactivation                               | covered     | unchanged                                        |
| Opening stock and stock adjustment                     | covered     | unchanged                                        |
| Purchase posting and cancellation                      | covered     | unchanged                                        |
| Supplier payment                                       | covered     | unchanged                                        |
| POS session opening and closing                        | covered     | unchanged                                        |
| Sale posting                                           | covered     | unchanged                                        |
| Order state changes, deposit, completion, cancellation | covered     | unchanged                                        |
| Customer payment                                       | covered     | unchanged                                        |
| Distributor dispatch, settlement, direct sale, payment | covered     | unchanged                                        |
| Expense posting and cancellation                       | covered     | unchanged                                        |

Only the first row was a real gap. The others already emitted events, several
through dynamic action names such as `user.activate` / `user.deactivate`, which
is why a naive grep under-reports them.

## Operational view review

Section 18 lists fourteen minimum views. Missing before this sprint:

- **POS sales by date, customer, payment state, and cashier** — no endpoint
  existed at all.
- **Purchases by due date**, including overdue — the list filtered by supplier
  and status only.
- **Overdue and upcoming orders** — the list took a raw date range but had no
  notion of overdue.
- **Distributor settlement history** — reachable only nested inside a dispatch.

All four are added. The other ten already existed.

## Out of Scope

- No advanced analytics or dashboard, per the release file.
- No change to any posting rule, money effect, or permission key.
- Sprint 14 hardening, migration rehearsal, backup and restore, and the
  `v1.0.0` tag.

## Verification

- `npm run prisma:validate`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed; backend 229 tests and frontend 3 tests, up from 214.
- `npm run build`: passed.
- `npm run format:check`: passed.

## Database and Migration Impact

**No migration.** This sprint adds no table, column, or enum. The audit viewer
reads the existing `audit_events` table, and every new filter uses columns that
already exist.

## API and Permission Surface

- `GET /api/audit-events` — requires `audit.view`.
- `GET /api/audit-filters` — requires `audit.view`.
- `GET /api/pos/sales` — requires `pos.access`.
- `GET /api/purchases` — now also accepts `paymentTerms`, `from`, `to`, and
  `dueState`; permission unchanged (`purchases.view`).
- `GET /api/orders` — now also accepts `dueState`; permission unchanged.
- `GET /api/distributor-settlements` — requires `distribution.custody.view`.

No permission key was added. `audit.view` existed in the baseline namespace but
had never been used by any route until now.

## Requirement Coverage

| Requirement | Coverage                                                                     |
| ----------- | ---------------------------------------------------------------------------- |
| `AUD-001`   | The viewer exposes reads only; no update or delete route exists.             |
| `AUD-002`   | Events carry actor, action, entity, target, server time, and correlation id. |
| `AUD-003`   | Before and after values continue to be stored for master-data changes.       |
| `AUD-004`   | Reasons remain mandatory for adjustments and cancellations.                  |
| `AUD-005`   | Both audit routes require `audit.view`.                                      |
| `NFR-005`   | New lists paginate, filter, and sort stably on the server.                   |
| `NFR-006`   | The audit empty state explains what to change, in French.                    |
| `NFR-007`   | Statements already show their basis; the due lists state their as-of moment. |

## Acceptance Evidence

- Authentication events:
  `backend/src/modules/audit/audit.service.test.ts` covers a successful login
  and its logout, a wrong password recorded against the targeted account, a
  deactivated user, and an unknown email.
- Stable sort:
  "sorts newest first and breaks ties on id" pushes three events sharing one
  timestamp and asserts a deterministic order.
- Server-side paging: "paginates server-side" asserts page 2 of 30 events
  returns 5 rows with a page count of 2.
- Operational view queries:
  `backend/src/modules/audit/operationalViews.test.ts` asserts the query each
  list builds, including that an overdue purchase must be posted and still
  owed, and that a completed or cancelled order can never be overdue.
- Ledger reconciliation:
  `backend/src/modules/audit/ledgerReconciliation.test.ts` runs a partly paid
  sale, a consignment settlement and a later allocated payment, then asserts
  the party balance equals both the sum of every ledger entry and the sum of
  each document's own balance, with no orphaned entry.

## Decisions Taken

1. **A failed login for an unknown email is counted but the address is not
   stored.** The submitted address is attacker-controlled text and belongs to
   no account, so storing it would put arbitrary input and non-user personal
   data into the audit trail. The event still records that an unknown-email
   attempt happened, which is what matters for monitoring. A failed login
   against a _real_ account does record which account was targeted.
2. **Auditing never breaks the request it describes.** The authentication audit
   sink is injected and its failures are swallowed, so an audit outage cannot
   stop people logging in. A test asserts login still succeeds when the
   recorder throws.
3. **"Due" means posted and still owed.** A draft purchase owes nothing yet and
   a cancelled one never will, so neither appears in the overdue or upcoming
   lists whatever its due date says. The same reasoning excludes completed and
   cancelled orders.
4. **`AuthService` takes an optional audit recorder rather than a database.**
   That keeps the service testable against the in-memory repository the auth
   tests already use, and left all existing constructor call sites working.

## Risks and Follow-Up

- Manual responsive review is still outstanding at 360 px, 430 px, 768 px, and
  desktop widths, now including the audit workspace.
- The new backend lists are not yet surfaced in the UI. The POS sales list, the
  purchase due lists, the order due lists and the settlement history are tested
  API capabilities without screens; the audit viewer is the only new workspace.
  Sprint 14 should decide whether those screens are launch blockers.
- The audit viewer filters by action prefix, which is enough to select a module
  such as `auth.` or `pos_sale.`, but there is no full-text search over before
  and after payloads.
- `listFilterOptions` reads distinct actions and entities from the whole table.
  That is cheap now and will stay cheap while the action vocabulary is small,
  but it should become a static list or a cached query if the audit table grows
  very large.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches the sprint
- [ ] Target branch is `dev`
