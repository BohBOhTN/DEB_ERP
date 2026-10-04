# 017 · Staging: `testing.darelbarka.work`, deployed from a `staging` branch, seeded from production

| Field            | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Module           | `.github/workflows/ci.yml`, `deploy/`                                                      |
| Type             | Infrastructure                                                                             |
| Priority         | High                                                                                       |
| Depends on       | 010 (the deployment pipeline), the domain setup behind the VPS nginx                       |
| Suggested branch | `feat/staging-environment`                                                                 |
| Related          | `12_DEPLOYMENT_AND_OPERATIONS.md`, `11_GIT_AND_RELEASE_WORKFLOW.md`, `OD-V2-008` (backups) |

## Owner's request

> Create `testing.darelbarka.work` as our staging environment. Take a backup of the current production database and use it to create the staging one. A `staging` branch deploys to this environment.

## Findings

- **One stack, hard-wired.** The deploy job targets `/opt/dar-el-barka` and the `production` environment only ([ci.yml](../.github/workflows/ci.yml)); the compose file names its containers `deb-backend` and `deb-frontend` ([docker-compose.yml](../deploy/docker-compose.yml)) and the script inspects `deb-backend` by name ([remote-deploy.sh](../deploy/remote-deploy.sh)). A second copy of the stack on the same host would collide on the container names and on port 8081.
- **What already separates two copies.** The compose project comes from the folder name, so a second folder gets its own `app` network and its own `deb-media` volume without a change. The frontend container reaches the API as `backend` on that private network, so two stacks do not see each other. Both APIs join `pg-network`, which is how they reach Postgres.
- **CI does not run on a `staging` branch** (`push` covers `main` and `dev`), and a manual run always deploys to production.
- **No backup exists** (`OD-V2-008`, owner's decision so far), so nothing can seed a second database today. A dump taken for staging is also the first backup of production.
- **Nothing stops a staging stack from being pointed at the production database**: `BACKEND_ENV` is one secret per environment, and a copy of production's would run staging's migrations and tests on real data.
- **Branches have drifted.** The last pull requests went straight to `main`; `dev` is 27 commits behind and no longer the integration branch in practice. A `staging` branch that deploys somewhere takes that role.

## Proposed change

1. **Stack name.** `STACK_NAME` (default `deb`) names the containers in the compose file and in the deploy script; `STACK_DIR` already chooses the folder. Production keeps every name it has.
2. **Deploy target.** A small `target` job picks the stack from the event: `main` to production, `staging` to staging, a manual run to the choice made (`staging` by default). The `deploy` job reads the environment, the folder, the stack name and the image channel (`latest` or `staging`) from it; `quality` runs on pushes to `staging`.
3. **Guards in the deploy script.** A stack other than production must state its port, and its `DATABASE_URL` must name a database containing `staging`.
4. **Seeding.** `deploy/refresh-staging-db.sh`, run by hand on the VPS: dump production to a dated file kept as a backup, recreate the staging database from it under the staging role, clear the sessions, optionally copy the product photos. It only reads production and refuses a target without `staging` in its name.
5. **Documentation** of the one-time setup: DNS, folders, the staging role, the `staging` GitHub environment and its secrets, the host nginx site and its certificate, the first copy, the branch.

## Tests

- The target script on each event (push to `main`, push to `staging`, manual to each stack, an unknown target) and the guard (production untouched, a staging database accepted, production's database refused, a missing port refused), run locally.
- Workflow and compose files parsed; scripts syntax-checked.
- The first push to `staging` is the end-to-end proof; it cannot be run from the development machine.

## Acceptance criteria

- A push to `staging` deploys to `https://testing.darelbarka.work` without touching the production containers, volume, port or database; `/api/health/ready` there reports the commit.
- A push to `main` deploys production exactly as before, behind the reviewer.
- Staging holds a copy of production's data and photos; a dated dump of production is kept on the VPS.
- A staging secret that names the production database stops the deploy before anything runs.

## Decisions surfaced

- `DEC-V2-008` (new): a staging stack on the same VPS and Postgres server, a separate database, deployed from `staging` without approval; `main` stays the production branch.
- `OD-V2-008` (backups) stays open: the dump taken by the copy is a manual backup, not a schedule.
- To settle with the owner: whether `dev` is retired in favour of `staging`; a visible "environnement de test" marker in the interface, since staging shows real data.
