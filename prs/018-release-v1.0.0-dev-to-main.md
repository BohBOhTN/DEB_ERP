# Release v1.0.0 Promotion of `dev` to `main`

## Branches

- Source: `dev`
- Target: `main`

This is the only brief in this folder whose target is not `dev`. It is the
first merge into `main`, which until now holds the initial commit and three
`.gitignore` files and no application code at all.

## Scope

Promotes the complete Version 1 codebase to the releasable branch: releases R0
through R5, sprints 0 through 14, delivered over 18 feature and fix branches.

- 99 commits ahead of `main`, of which 20 are merge commits;
- 163 files added, 49,543 insertions;
- no file on `main` is modified or deleted, because `main` carries no source.

This merge establishes the baseline. It does **not** tag `v1.0.0`; see
_Tagging_ below.

## Source requirement IDs

The merge carries the implemented Version 1 scope of
`docs/01_SOURCE_OF_TRUTH.md` in full:

| Family | Count | Area                                              |
| ------ | ----- | ------------------------------------------------- |
| `IAM`  | 14    | Identity, dynamic RBAC, session and account state |
| `GOV`  | 13    | Governance, audit and protected system role       |
| `MST`  | 16    | Master data, units and conversions                |
| `INV`  | 12    | Inventory ledger and adjustments                  |
| `SUP`  | 19    | Procurement and supplier payments                 |
| `POS`  | 19    | Single point of sale and sessions                 |
| `CUS`  | 12    | Customer credit and receivables                   |
| `ORD`  | 19    | Customer orders and advances                      |
| `DST`  | 29    | Distributor consignment, settlement and payments  |
| `EXP`  | 10    | Expenses and categories                           |
| `SIM`  | 10    | Ingredient cost simulation                        |
| `AUD`  | 5     | Audit trail and operational views                 |
| `API`  | 11    | API conventions, errors and pagination            |
| `UX`   | 16    | French localization and responsive rules          |
| `NFR`  | 24    | Non-functional requirements                       |

Acceptance scenarios `AS-001` through `AS-019` are covered by automated tests;
`AS-020` is open. Open decisions `OD-001` through `OD-014` are resolved or have
a documented safe default applied; `OD-015` is open by direction.

## Behavior added

Relative to `main`, every capability below is new.

| Module         | Capability                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `auth`         | Opaque hashed session tokens, rate-limited login, security events                                 |
| `access`       | Dynamic roles and permissions, last-Super-Admin protection, guard middleware                      |
| `catalog`      | Products, units, conversions and snapshots                                                        |
| `inventory`    | Stock movement ledger, derived quantities, permissioned manual adjustment with reason             |
| `procurement`  | Purchase posting in one transaction, supplier payables, payment allocation                        |
| `pos`          | One open session at a time, paid and partial sales, session close with computed expected cash     |
| `customers`    | Customer credit, receivable and advance balances as separate kinds, till-collected payments       |
| `orders`       | Customer orders, deposits held as advance, once-only completion into at most one linked sale      |
| `distribution` | Consignment dispatch as custody transfer, settlement on confirmed sold quantity, distributor debt |
| `expenses`     | Expense categories, posting, cancellation with evidence                                           |
| `simulation`   | Ingredient cost simulation with no ledger effect                                                  |
| `audit`        | Read-only audit viewer with server-side paging and a stable sort, plus operational due lists      |

Cross-cutting: decimal-safe TND money with three decimals, `fr-TN` dates in
`Africa/Tunis`, idempotency keys on every posting command, French validation and
error copy, and correlation IDs on every error response.

## Database and migration impact

**Fourteen migrations**, additive throughout. No destructive change and no down
migration is included.

`main` has no deployment history, so the first deployment from this branch
applies the entire chain to an empty database. CI already performs exactly that
rehearsal on every run: it provisions PostgreSQL 16 and applies the chain with
`prisma migrate deploy`, which is the only migration command permitted against a
shared database.

Money and state invariants are enforced by database check constraints, not by
service code alone: sale payment states, the order advance cap, the custody
quantity invariant, expense posting and cancellation evidence, and simulation
output quantity. All 54 foreign keys are indexed, verified by parsing the
committed SQL.

## Permission changes

The whole permission catalogue arrives with this merge. Authorization is proven
mechanically rather than by review:
`backend/src/modules/audit/authorizationMatrix.test.ts` walks the live Express
router stack and asserts that every authenticated route carries a permission
guard, that the only unauthenticated endpoints are the health check and
`/login`, `/logout`, `/me`, that no write route is guarded by a `.view`
permission alone, and that every key used by a route exists in the catalogue.
The test fails if it discovers zero routes, so it cannot pass vacuously.

## API and UI changes

All API routes and all frontend workspaces are new relative to `main`. No
existing contract is broken, because no contract exists on the target.

## Environment impact

No new variable is introduced by this merge itself. The deployment target needs
the full Version 1 set already documented in `backend/.env.example` and
`frontend/.env.example`, chiefly `DATABASE_URL`, the session and cookie
settings, and `CORS_ALLOWED_ORIGINS`. No `.env` file is tracked and no secret
literal exists in `backend/src` or `frontend/src`.

## Verification

Run on the merge base, commit `4db1965`:

- `npm run prisma:validate`: passed.
- `npm run lint`: passed, zero warnings.
- `npm run typecheck`: passed.
- `npm run format:check`: passed.
- `npm run test`: passed; 248 backend and 3 frontend tests. Four
  database-backed concurrency tests are skipped locally and run in CI.
- `npm run build`: passed, backend and frontend.

CI runs on this pull request and on the push to `main` that follows it.

## Screenshots

**None.** The responsive review (`AS-020`) has not been performed, so there is
no screenshot evidence to attach. This is stated rather than omitted, because
the workflow document asks for screenshots of relevant responsive UI.

## Open decisions and limitations

- `AS-020`, the French responsive experience at 360 px, 430 px, 768 px and
  desktop, has never been checked on a device or emulator. French copy is
  asserted by tests; layout is not.
- UAT has not been run or accepted.
- `OD-015`, retention and backup RPO/RTO, is open by explicit direction, so the
  backup line of the exit gate cannot be signed from this repository.
- Four backend lists added in Sprint 13 have no screens: POS sales, purchase due
  lists, order due lists, and settlement history. They are tested API
  capabilities. Whether their absence blocks launch is a product call.
- The customer ledger writes a receivable for the remainder only, while
  suppliers and distributors write the full document and then payments. Balances
  agree under both conventions; aligning them needs its own migration and a
  backfill.
- `npm audit` reports three high-severity advisories, all through the `prisma`
  CLI, a devDependency, and not reachable from the deployed runtime. Assessed in
  `RELEASE_v1.0.0.md` and deferred to the first maintenance release.

## Rollback considerations

Rollback is unusually cheap here, and will not be this cheap again.

- **Code.** `main` has no deployed predecessor, so there is no previous
  known-good artifact to fall back to. Reverting the merge commit returns
  `main` to an empty repository; it does not return a running system to a
  working state.
- **Schema.** The same holds for the database. There is no prior applied
  migration state, so a rollback is a drop of an empty or newly populated
  database rather than a down migration. Once real data exists, this stops being
  true, and the deployment document's rule applies: prefer a forward fix, and
  never run a down migration that destroys live data.
- **Practical consequence.** Any defect found after the first production
  deployment should be handled as a forward fix on a `fix/` branch, not by
  rewriting an applied migration.

## Tagging

**This pull request does not tag `v1.0.0`.** The workflow document permits a tag
only on a commit that passes CI, contains committed migrations, passed the
release checklist, has an updated changelog, has a recorded deployment and
rollback plan, and matches the tested build artifact.

Four of those six are satisfied. The release checklist is not signed, because
`AS-020` and UAT are open. Tagging now would put a signature on a layout nobody
has looked at.

Tag the merge commit on `main` as `v1.0.0` once the responsive review is done,
UAT is accepted, and the backup line is either closed or formally waived. The
code is ready for the tag; only the evidence is missing.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches the full Version 1 baseline
- [ ] Target branch is `main`
- [ ] Understood that `v1.0.0` is not tagged by this merge
