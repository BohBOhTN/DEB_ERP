# R5 Sprint 14 Hardening and Launch Readiness

## Branches

- Source: `feature/r5-sprint-14-hardening-launch`
- Target: `dev`

## Scope

Implements Release R5, Sprint 14 as stabilization, not a feature sprint: the
security and quality review, the acceptance evidence, and the release
documentation for Version 1.

Backup, retention, and restoration rehearsal were removed from this sprint by
explicit direction, so `OD-015` stays open and that exit-gate line is not
signed here.

## Summary

- Fixed a localization defect: Zod's English validation messages were reaching
  the interface through `fieldErrors`.
- Made authorization coverage mechanical. Permission guards now carry the keys
  they enforce, and a test derives the authorization matrix from the running
  Express stack, so an unguarded route fails the build.
- Verified the rate limit, session cookie, and CORS model with tests. The rate
  limiter had been configured since Sprint 1 but never actually tested.
- Added error redaction tests proving no stack, host, file path, SQL, or schema
  name can reach a client.
- Reviewed dependencies, scanned for secrets, and checked that every foreign key
  is indexed.
- Wrote `RELEASE_v1.0.0.md` with the acceptance-scenario coverage map and an
  honest exit-gate status, and added the `1.0.0` changelog entry.

## Defects found and fixed

**English validation messages reached the UI.** `errorHandler` passed
`issue.message` straight through, so a user saw "Invalid input: expected string,
received undefined". The language rule forbids leaking a raw English exception,
and "English ... critical UI flow" is a listed release blocker. Every Zod issue
is now translated in `backend/src/shared/validationMessages.ts`, and a test
asserts no Zod wording survives a validation response.

While writing that mapper a second, quieter bug appeared: `.positive()` is an
_exclusive_ zero minimum, so describing it as "positive ou nulle" would have
told the user zero was acceptable when the server rejects it. The mapper now
reads Zod's `inclusive` flag and distinguishes the two.

**The rate limiter was never tested.** The auth route tests configured a limit
of 100 attempts and never reached it, so nothing proved the limiter worked. It
does, and is now covered.

## Verification

- `npm run prisma:validate`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed; backend 248 tests and frontend 3 tests, up from 232.
- `npm run build`: passed.
- `npm run format:check`: passed.

## Database and Migration Impact

**No migration.** This sprint adds no table, column, or enum.

## Security review results

| Area                 | Result                                                                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization matrix | Every authenticated route carries a permission guard; only health and the three auth endpoints are unauthenticated; no write is guarded by a `.view` permission alone; every key exists in the catalogue. All asserted against the live router stack. |
| Session              | `httpOnly`, `sameSite=lax`, `secure` in production, on set and on clear. Rejected when revoked, expired, or the user is deactivated.                                                                                                                  |
| Rate limit           | Threshold enforced, `429` with a French message, window releases, limit never disclosed.                                                                                                                                                              |
| CORS                 | Configured origin echoed, foreign origin receives no allow-origin header, credentials enabled without a wildcard.                                                                                                                                     |
| CSRF                 | `sameSite` cookie plus JSON-only writes; no cookie-authenticated form-encoded write exists.                                                                                                                                                           |
| Error redaction      | No stack, host, path, SQL, or schema name in any response; correlation id always present.                                                                                                                                                             |
| Secret scan          | No tracked `.env`; no secret literal in source; only the CI throwaway credentials and an `.env.example` placeholder.                                                                                                                                  |
| Indexes              | All 54 foreign keys indexed, checked by parsing the committed migration SQL.                                                                                                                                                                          |

## Dependency review

`npm audit` reports three high-severity advisories, all from one chain:
`prisma` (devDependency) → `@prisma/config` → `deepmerge-ts@7.1.5`.

**Assessed as not reachable from the deployed runtime and accepted for this
release.** `prisma` is the migration and codegen CLI, not the server;
`@prisma/client`, which the server imports, does not depend on `deepmerge-ts`,
and `npm ls deepmerge-ts` shows the CLI as the only path. The advisory needs a
crafted config file to trigger, which no API request can reach.

The fix requires a Prisma major upgrade. The release file warns against scope
that risks launch, so it is recorded here and deferred to the first maintenance
release rather than taken during stabilization.

## Acceptance scenario coverage

`AS-001` through `AS-019` are covered by automated tests; the full map is in
`RELEASE_v1.0.0.md`.

`AS-020`, the French responsive experience on phone, tablet, and desktop, is
**not automated and has not been reviewed on a device**. French copy is asserted
throughout, but layout is not.

## Version 1 exit gate

Met: all modules delivered, permissions enforced and tested, ledgers reconcile,
migrations apply from an empty database on every CI run.

**Not met, and the reason `v1.0.0` is not tagged in this PR:**

1. `AS-020` responsive review has not been done.
2. UAT has not been run or accepted.
3. Backup and restore evidence is out of scope by direction, so that line
   cannot be signed from this repository.

The release file lists "unusable phone layout" and "failing acceptance
scenario" as release blockers. Tagging `v1.0.0` while `AS-020` is unverified
would put a signature on something nobody has checked, so the tag is withheld
rather than applied optimistically. The code is ready for it.

## Out of Scope

- Automated backup, retention policy, and restoration rehearsal, by direction.
- The responsive review itself, which needs a human on a device.
- UAT execution, which is a business activity.
- Any new feature, module, or posting rule.

## Risks and Follow-Up

- **The responsive review is the last engineering gate.** It covers every
  workspace, and the longest forms — the simulation ingredient form and the
  distributor settlement form — are the most likely to need work at 360 px.
- The four backend lists added in Sprint 13 (POS sales, purchase due lists,
  order due lists, settlement history) still have no screens. They are tested
  API capabilities. Whether they block launch is a product call.
- The customer ledger still writes a receivable for the remainder only while
  suppliers and distributors write the full document then payments. Balances
  agree under both; aligning them needs its own migration and backfill.
- `OD-015` remains open.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches the sprint
- [ ] Target branch is `dev`
