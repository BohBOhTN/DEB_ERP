# Release v1.1.0 Promotion of `dev` to `main`

## Branches

- Source: `dev`
- Target: `main`

## Scope

Promotes release R6, platform hardening and API contract, to the releasable
branch: Sprints 15, 16 and 17, merged to `dev` as PR #24, #25 and #26, plus
the release-notes pull request that follows them.

- 52 commits ahead of `main`, of which 3 are merge commits (before the
  release-notes merge);
- 113 files changed, about 34 000 insertions and 1 800 deletions, of which
  90 source files with 18 400 insertions; the rest is the generated OpenAPI
  document, the generated frontend types and the PR briefs;
- no V1 screen is changed.

## Source requirement IDs

`BE-01` to `BE-38` of
`internal-docs/DAR_EL_BARKA_V2_REDESIGN_AND_HARDENING_PACK/docs/08_BACKEND_REMEDIATION_PLAN.md`,
all closed. Acceptance scenarios `AS-V2-01` to `AS-V2-09` pass in CI. Open
decisions `OD-V2-001`, `OD-V2-002`, `OD-V2-010` and `OD-V2-012` were applied
with their documented safe defaults.

## Behaviour added

| Sprint | Capability                                                                                                                                                                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15     | Structured logging by correlation id, stable error codes for body-parser and Prisma failures, shared idempotency with the insert-first race fixed, `Idempotency-Replayed`, cleanup job, timeouts, graceful shutdown, health probes, rate limit and compression        |
| 16     | SQL aggregation for every balance, statement, custody, POS close and expense total; cursor-paged statements; 20 indexes including trigram search; permission cache; drift guard; performance suite with a latency budget                                              |
| 17     | `/api/v1` with a version-aware envelope, one list contract, detail endpoints, POS session history, home summary, `VT-`/`AC-` document references, inventory filters, unified enums, audit labels, access API additions, OpenAPI document and generated frontend types |

## Database and migration impact

Five additive migrations, listed with their effect in `RELEASE_v1.1.0.md`.
Two deserve attention on a populated database:

- `add_document_references` backfills `sales.reference` in `postedAt` order
  before making the column mandatory and unique; on the remote development
  database this numbers the existing sales once, in history order.
- `unify_payment_method_enum` converts five enum columns to one type and
  drops the old types. It is a forward-only change: reversing it needs its
  own migration.

CI applies the whole chain from an empty database on every run; the remote
development database is migrated by the owner with `prisma migrate deploy`
and the result is recorded in `RELEASE_v1.1.0.md` before tagging.

## Permission changes

One new key, `users.reset_password`, guarding
`POST /api/v1/access/users/{id}/password-reset`. The catalogue is seeded at
boot and the Super Admin role receives every key, so no manual grant is
needed. The permission catalogue's French labels and module names gained
their accents; keys are unchanged.

## API and UI changes

- Every route is now also served under `/api/v1`. The `/api` prefix used by
  the V1 frontend is unchanged in shape and answers `Deprecation: true`.
- New endpoints only under `/api/v1`: `GET /home/summary`, detail endpoints,
  POS session list and detail, `PATCH /access/users/{id}`, the password
  reset, and `GET /openapi.json` outside production.
- List endpoints return document headers only since Sprint 16; the V1
  screens were checked against this in PR #25.
- No screen changed. The generated `frontend/src/lib/api/types.gen.ts` is
  committed and unused until R7.

## Environment impact

Twelve optional variables with defaults, documented in `backend/.env.example`
and `README.md`. Deployments behind a reverse proxy must set `TRUST_PROXY=1`
or every client shares one rate-limit bucket. No `.env` file is tracked and no
secret literal exists in the sources.

## Verification

CI ran on each sprint pull request and will run on this one and on the push
to `main`. The last run on `dev` (PR #26) passed every step: install,
Prisma generation, migrations, drift guard, OpenAPI staleness, generated-types
diff, format, lint, typecheck, unit tests with the PostgreSQL suites, the
performance suite, and both builds. Local results are in `RELEASE_v1.1.0.md`.

## Rollback considerations

- **Code.** Reverting the merge commit returns `main` to the `v1.0.0`
  baseline. The V1 frontend on that baseline works against a database that
  carries the R6 migrations, because every schema change is additive at the
  column level and the enum consolidation keeps the same values.
- **Schema.** No down migration is shipped. The enum consolidation and the
  mandatory `sales.reference` are forward-only; a defect found after
  deployment is fixed forward on a `fix/` branch, per the workflow document.

## Tagging

The R6 release file asks for a `v1.1.0` tag on `dev` after the sprint merges,
with `RELEASE_v1.1.0.md` recording timings, migrations and the OpenAPI
location. That file exists and its gate table is met except for the remote
development migration line, which only the owner can complete.

`v1.0.0` was never tagged because the responsive review, UAT and backup
evidence were open; they still are, and the V2 plan addresses them in R10.
R6 changed no screen, so those items are no worse than at `v1.0.0`.

Recommendation: after this merge and the remote migration line, tag the
merge commit on `main`:

```text
git tag -a v1.1.0 -m "v1.1.0 - Platform hardening and API contract" <merge-sha>
git push origin v1.1.0
```

If the owner prefers to keep the V1 rule that no tag precedes a signed
checklist, leave `v1.1.0` untagged like `v1.0.0` and record that decision in
the sprint tracker; nothing in R7 depends on the tag.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches release R6
- [ ] Target branch is `main`
- [ ] Remote development database migrated and recorded in `RELEASE_v1.1.0.md`
- [ ] Tag decision made
