# Release v1.0.0 Evidence

This file records the Sprint 14 stabilization evidence for the Version 1 exit
gate. It is written from what was actually verified, and states plainly where a
gate item is not met.

Generated for branch `feature/r5-sprint-14-hardening-launch`.

## Quality suite

| Command                   | Result                                   |
| ------------------------- | ---------------------------------------- |
| `npm run prisma:validate` | passed                                   |
| `npm run lint`            | passed, zero warnings                    |
| `npm run typecheck`       | passed                                   |
| `npm run format:check`    | passed                                   |
| `npm run test`            | passed; 248 backend and 3 frontend tests |
| `npm run build`           | passed, backend and frontend             |

CI additionally provisions PostgreSQL 16, applies every migration with
`prisma migrate deploy`, and runs the four database-backed concurrency tests
that are skipped locally.

## Authorization matrix

The matrix is derived mechanically from the running Express stack by
`backend/src/modules/audit/authorizationMatrix.test.ts`, not by reading route
files, so a future unguarded route fails the build.

Verified:

- every authenticated route carries a permission guard;
- the only unauthenticated endpoints are the health check and the three auth
  endpoints (`/login`, `/logout`, `/me`);
- no write route is guarded by a `.view` permission alone;
- every permission key used by a route exists in the catalogue;
- all fourteen permission modules have at least one guarded route.

Permission keys are attached to the guard middleware itself, so the test reads
the real enforcement rather than a parallel list that could drift.

## Session, rate limit, CORS, and error model

- **Session.** An opaque token is stored as a hash; the cookie is verified
  `httpOnly`, `sameSite=lax`, and `secure` in production, on both set and
  clear. A session is rejected when revoked, expired, or when the user has been
  deactivated, which `auth.routes.test.ts` asserts.
- **Rate limit.** Login attempts are limited per IP per window.
  `securityControls.test.ts` drives the limiter to its threshold, asserts a
  `429` with a French message, asserts the window releases, and asserts the
  response never reveals the configured limit. The limiter had been configured
  but never tested before this sprint.
- **CORS.** Origins come from `CORS_ALLOWED_ORIGINS` with credentials enabled.
  A test asserts a configured origin is echoed back and a foreign origin
  receives no `access-control-allow-origin` header at all; a wildcard would be
  fatal with credentials enabled.
- **CSRF.** The cookie is `sameSite`, and the API accepts JSON only. No
  cookie-authenticated form-encoded write exists.
- **Error redaction.** `errorRedaction.test.ts` asserts that an unexpected
  failure returns only a generic French message, a stable error code, and a
  correlation id, with no stack, host, file path, SQL, or schema name.

## Localization

A defect was found and fixed during this sprint: Zod's default validation
messages are English ("Invalid input: expected string, received undefined") and
were reaching the interface through `fieldErrors`. Every issue is now translated
in `backend/src/shared/validationMessages.ts`, and a test asserts that no Zod
wording survives in a validation response.

## Dependency review

`npm audit` reports three high-severity advisories, all one chain:

```text
prisma@6.19.3 (devDependency)
  @prisma/config@6.19.3
    deepmerge-ts@7.1.5   stack exhaustion on recursive object graphs
```

**Assessment: not reachable from the deployed runtime, accepted for v1.0.0.**

- `prisma` is the CLI used for migrations and code generation. It is a
  `devDependency` and is not installed in a production runtime image.
- `@prisma/client@6.19.3`, the package the server actually imports, does not
  depend on `deepmerge-ts`; `npm ls deepmerge-ts` shows the CLI as the only
  path.
- The advisory describes stack exhaustion while merging a crafted configuration
  object, which is reachable only by running the CLI against a hostile config
  file, not by any API request.

The fix requires a Prisma major upgrade. Taking a major dependency bump during
stabilization is exactly the kind of launch risk the release file warns against,
so it is deferred to the first maintenance release and recorded here rather than
applied now.

## Secret scan

- No `.env` file is tracked; only `backend/.env.example` and
  `frontend/.env.example`, which contain placeholders.
- No hardcoded password, API key, or token literal exists in `backend/src` or
  `frontend/src`.
- The only committed connection strings are the CI throwaway database
  (`ci:ci@localhost`) and the placeholder in `.env.example`.

## Database and migration review

- Fourteen migrations, applied in order from an empty database by CI on every
  run, which is the staging-like rehearsal for this release.
- All 54 foreign keys are indexed; this was checked by parsing the committed
  migration SQL rather than by inspection.
- Money invariants are enforced by database check constraints rather than by
  service code alone: sale payment states, the order advance cap, the custody
  quantity invariant, expense posting and cancellation evidence, and simulation
  output quantity.

## Acceptance scenario coverage

| Scenario | Covered by                                                                  | Status |
| -------- | --------------------------------------------------------------------------- | ------ |
| `AS-001` | `access.routes.test.ts`, `authorizationMatrix.test.ts`                      | passes |
| `AS-002` | `access.routes.test.ts`                                                     | passes |
| `AS-003` | `pos.service.test.ts` one-open-session tests plus the database unique index | passes |
| `AS-004` | `procurement.service.transaction.test.ts`                                   | passes |
| `AS-005` | `procurement.service.transaction.test.ts` conversion snapshots              | passes |
| `AS-006` | `pos.service.test.ts` paid sale                                             | passes |
| `AS-007` | `pos.service.test.ts` partial sale                                          | passes |
| `AS-008` | `pos.service.test.ts` anonymous credit rejection                            | passes |
| `AS-009` | `orders.service.test.ts` deposit as advance                                 | passes |
| `AS-010` | `orders.service.test.ts` completion effects                                 | passes |
| `AS-011` | `orders.service.concurrency.test.ts` against PostgreSQL                     | passes |
| `AS-012` | `orders.service.test.ts` refund and credit dispositions                     | passes |
| `AS-013` | `customers.service.payments.test.ts`                                        | passes |
| `AS-014` | `distribution.service.dispatch.test.ts`                                     | passes |
| `AS-015` | `distribution.service.settlement.test.ts`                                   | passes |
| `AS-016` | `distribution.service.payments.test.ts`                                     | passes |
| `AS-017` | `expenses.service.test.ts` cancellation and totals                          | passes |
| `AS-018` | `simulation.service.test.ts` worked example                                 | passes |
| `AS-019` | idempotent retry tests in POS, orders, procurement, and distribution        | passes |
| `AS-020` | **not automated**                                                           | open   |

`AS-020` is the French responsive experience across phone, tablet, and desktop.
French copy is asserted by unit and route tests, but the responsive layout has
never been reviewed on a real device or emulator. This is a manual gate item and
is the reason the exit gate below is not fully met.

## Version 1 exit gate status

| Gate item                                       | Status                                                       |
| ----------------------------------------------- | ------------------------------------------------------------ |
| All source-of-truth Version 1 modules delivered | met                                                          |
| Every acceptance scenario passes                | **not met** — `AS-020` is unverified                         |
| All permissions enforced and tested             | met, mechanically                                            |
| Ledgers reconcile                               | met                                                          |
| Migrations work from previous release state     | met, CI applies the full chain to an empty database each run |
| Backup restoration succeeds                     | **out of scope by direction** — see below                    |
| UAT accepted                                    | **not met** — business activity, not yet run                 |
| Release checklist signed                        | **not met** — depends on the two items above                 |
| Release commit tagged and deployment evidence   | **not met** — tag withheld until the gate is met             |

## Deliberately out of scope

Automated backup, retention policy, and restoration rehearsal were removed from
this sprint by explicit direction. `OD-015` (retention and backup RPO/RTO)
therefore remains open, and the corresponding exit-gate line cannot be signed
from this repository. Nothing in the code depends on it.

## Why v1.0.0 is not tagged here

Three gate items are open: the responsive review (`AS-020`), UAT acceptance, and
backup evidence. The release file lists "unusable phone layout" and "failing
acceptance scenario" as release blockers, so tagging a commit as `v1.0.0` while
`AS-020` is unverified would put a signature on something nobody has checked.

The code is ready to be tagged. The tag is withheld until:

1. the responsive review is done at 360 px, 430 px, 768 px, and desktop;
2. UAT is run and accepted;
3. the backup decision is made, or the gate line is formally waived.

When those are closed, tag the release commit as `v1.0.0` and record the
deployment evidence against it.
