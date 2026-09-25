# Release v2.0.0 Promotion of `dev` to `main`

## Branches

- Source: `dev`
- Target: `main`

`main` still holds the `v1.0.0` baseline (PR #23). The `v1.1.0` promotion
brief (`prs/022`) was written but never merged, so this promotion carries
every V2 release at once: R6 to R10, versions 1.1.0 to 2.0.0.

## Scope

- 277 commits ahead of `main`, of which 22 are merge commits;
- 774 files changed, about 119 000 insertions and 14 700 deletions;
- the V1 frontend is replaced in full by the V2 application on the design
  system; the backend is hardened, versioned under `/api/v1` and deployable.

Release by release, from `CHANGELOG.md`:

| Version | Release                                          | Merged as               |
| ------- | ------------------------------------------------ | ----------------------- |
| 1.1.0   | R6 platform hardening and API contract           | PR #24 to #27           |
| 1.2.0   | R7 design system and application shell           | PR #28, #29             |
| 1.3.0   | R8 module redesign wave 1                        | PR #30 to #33           |
| 1.4.0   | R9 module redesign wave 2                        | PR #34 to #37           |
| 2.0.0   | R10 polish, operations, fixes #41 to #49, deploy | PR #38, #40, #50 to #59 |

## Source requirement IDs

The V2 plan of `internal-docs/DAR_EL_BARKA_V2_REDESIGN_AND_HARDENING_PACK`:
`BE-01` to `BE-38` (backend remediation), `UI-01` to `UI-26` (frontend
architecture and screens), the issue briefs `issues/001` to `010`, and the
decisions `DEC-V2-001` to `DEC-V2-005` of the V2 decision log.

## Behaviour added since `main`

| Area       | Capability                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform   | Correlation-id logging, stable error codes, shared idempotency, health probes, rate limits, graceful shutdown, SQL aggregates, 20 indexes, permission cache, drift guard, performance suite |
| API        | `/api/v1` with a version-aware envelope, one list contract, detail endpoints, OpenAPI document and generated frontend types                                                                 |
| Frontend   | The whole application rebuilt on the Dar El Barka design system: shell, till, orders, customers, procurement, distribution, expenses, simulation, access, audit, settings, home             |
| Cache      | Four cache tiers and a domain-event invalidation map; reference data warmed at sign-in; cached pickers                                                                                      |
| Money      | Payments settle documents; paid state in step with the ledger; payment reversals; sale cancellation; explicit completion amounts                                                            |
| Figures    | Period filter, KPI rows on the sales, orders and customers lists, customer page figures, Accueil per business day, approximate margin                                                       |
| Catalogue  | Approximate product cost and margin under `margin.view`; cost snapshot on every sold line                                                                                                   |
| Operations | Container images, compose stack on `pg-network`, remote deploy with readiness gate and rollback, CI `containers` and `deploy` jobs                                                          |

## Database and migration impact

Nineteen additive migrations since `v1.0.0` (five since `v1.4.0`), listed
with their effects in `RELEASE_v1.1.0.md` and `RELEASE_v2.0.0.md`. Two are
forward-only on a populated database (`add_document_references`,
`unify_payment_method_enum`); one replaces a check constraint
(`payment_document_state`). CI applies the chain from an empty database on
every run; the remote development database is migrated by the owner; the
production database is empty and will be migrated by the first deploy.

## Permission changes

3 keys added since `main` (49 in the catalogue), all
seeded at boot and granted to the Super Admin role automatically:
`users.reset_password` (R6), `pos.cancel_sale`, `customers.deactivate` and
`margin.view` (R10) among them. Other roles need a manual grant.

## API and UI changes

Everything under `/api/v1`; the `/api` aliases are still served with
`Deprecation: true`. Every V1 screen is gone; the V2 screens are the only
frontend.

## Environment impact

The backend settings of `backend/.env.example` (thirteen optional with
defaults since `v1.0.0`, including `SESSION_COOKIE_SECURE`), and the
`production` GitHub environment with its seven secrets for the deploy job
(`deploy/README.md`). No `.env` file is tracked and no secret literal exists
in the sources.

## Verification

CI ran on every pull request into `dev` and on each push to `dev`; the last
run on `dev` (PR #59) passed every step, including the PostgreSQL suites,
the performance suite, both builds, the browser smoke and the container
images. Local results are in `RELEASE_v2.0.0.md`. The push to `main` runs
CI again and, on success, pauses the deploy job on the `production`
environment for the owner's approval: **merging this pull request and
approving that job is the first production deployment.**

## Rollback considerations

- **Code.** Reverting the merge commit returns `main` to the `v1.0.0`
  baseline, whose code does not run against a database carrying the V2
  migrations (enum consolidation, mandatory references). A defect after
  promotion is fixed forward on a `fix/` branch, per the workflow document.
- **Deployment.** The deploy job's manual run with an earlier `image_tag`
  puts a previous image back; migrations stay, being additive.

## Tagging

Per DEC-V2-001, `v2.0.0` is tagged on `dev`, on the commit that carries
`RELEASE_v2.0.0.md`, once the owner signs the R10 gate with its pending lines
(no backup, no UAT, demo shown manually). This pull request does not tag.

## Merge Checklist

- [ ] CI passed on this pull request
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches releases R6 to R10
- [ ] Target branch is `main`
- [ ] The `production` environment has its seven secrets and the owner as reviewer
- [ ] The R10 gate in `RELEASE_v2.0.0.md` signed, or its pending lines accepted, before tagging
