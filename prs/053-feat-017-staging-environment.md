# Feature 017: a staging stack for `testing.darelbarka.work`, deployed from `staging`

## Branches

- Source: `feat/staging-environment` (from `main`)
- Target: `main` (the workflow must be on `main` before the `staging` branch is cut from it)

## Scope

Closes issue 017 ([issues/017](../issues/017-environnement-de-test-staging.md)):
a second stack on the VPS for `testing.darelbarka.work`, a `staging`
branch that deploys to it, and a way to seed its database from a backup of
production. Decision `DEC-V2-008`. No application code changes.

## Summary

- **Two stacks side by side.** `STACK_NAME` names the containers
  (`deb-*` for production, the default; `deb-staging-*` for staging) in
  `deploy/docker-compose.yml` and `deploy/remote-deploy.sh`. The folder
  already gives each stack its compose project, so staging gets its own
  network and its own media volume. Production keeps every name, folder,
  port and volume it has.
- **Deploy target.** A `target` job in `ci.yml` picks the stack: a push to
  `main` goes to production, a push to `staging` to staging, a manual run
  to the choice made, staging by default (it used to deploy production).
  The `deploy` job takes the GitHub environment, the folder, the stack
  name and the image channel (`latest` or `staging`) from it. `quality`
  now runs on pushes to `staging`.
- **Guards.** The deploy script refuses a stack other than production
  that does not state its port (8081 is production's) or whose
  `DATABASE_URL` does not name a database containing `staging`, so a
  secret copied from production cannot run staging on real data.
- **Seeding.** `deploy/refresh-staging-db.sh`, run by hand on the VPS:
  dumps production to `/opt/dar-el-barka-backups/<name>-<date>.dump` (the
  first backup of production), asks for confirmation, recreates the
  staging database from it under the staging role, clears the sessions,
  and with `COPY_MEDIA=1` copies the product photos. It only reads
  production and refuses a target without `staging` in its name. The
  deploy copies it to the stack folder.
- **Documentation.** `deploy/README.md` gains the staging section: the
  table of the two stacks, the one-time setup, the copy, the branch flow.

## Out of Scope

- A schedule for backups (`OD-V2-008` stays open).
- A marker in the interface saying "environnement de test".
- What becomes of `dev`, now 27 commits behind `main`.

## Verification

Run locally on macOS on 2026-10-05:

- `npm run format:check`: passed (workflow, compose file and README
  included)
- The workflow and the compose file parse (`js-yaml`); `bash -n` on the
  two scripts
- The `target` script run with each event: push to `main` gives
  `production`, `/opt/dar-el-barka`, `deb`, `latest`; push to `staging`
  and a manual run to staging give `staging`,
  `/opt/dar-el-barka-staging`, `deb-staging`, `staging`; a manual run to
  production gives production; an unknown target exits 1
- The guard run with each case: production passes untouched; staging with
  port and a staging database passes; staging with production's database
  is refused; staging without a port is refused
- Not run here: Docker, the VPS, GitHub Actions. The copy script was
  never executed. The first push to `staging` and the first run of the
  copy on the VPS are the end-to-end proof

## Database and Migration Impact

None in the application. On the VPS: a new role and a new database for
staging in `postgres-prod`, created by the one-time setup and the copy
script. Production's database is read by `pg_dump` only.

## Environment Impact

A GitHub environment `staging` with its secrets (`PUBLIC_PORT=8082`,
`PUBLIC_URL`, `BACKEND_ENV` with the staging database, origin and cookie
name; the VPS credentials as production). On the VPS: a DNS record, two
folders, an nginx site with its certificate. All listed in
`deploy/README.md`.

## Risks and Follow-Up

- **Production deploys go through the changed job.** The production path
  differs only by where its values come from (the `target` job instead of
  literals); the resolved values are identical. If the next push to `main`
  fails in `deploy`, production keeps running the previous build and the
  fix is on the workflow.
- **Same Postgres server.** Staging has its own database, not its own
  server: a heavy test on staging shares CPU and disk with production.
- **Real data on staging.** The copy brings real customers and the real
  users with their passwords; the address should stay among testers.
- Until the `staging` environment and its secrets exist, a push to
  `staging` fails at the copy step and changes nothing.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue 017
- [ ] Target branch is `main`
- [ ] One-time setup of `deploy/README.md` done before the first push to `staging`
