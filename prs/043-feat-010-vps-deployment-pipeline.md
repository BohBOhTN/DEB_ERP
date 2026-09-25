# Feature 010: build, ship and run the release on the VPS from GitHub Actions

## Branches

- Source: `feat/vps-deployment-pipeline`
- Target: `dev`

## Scope

Closes issue 010 ([issues/010](../issues/010-deploiement-vps-github-actions.md)):
container images for the API and the app, a compose stack on the VPS that
joins the database's `pg-network`, a remote deploy script with a readiness
gate and a rollback, a CI job that builds the images on every pull request,
and a deploy job behind the `production` environment's approval. Modelled on
the Aegis staging pipeline, adapted to cookie sessions, one origin and the
project's deployment order.

## Summary

- **Images** (`backend/Dockerfile`, `frontend/Dockerfile`, built from the
  repository root so the workspace lockfile is the single source): the API
  on `node:24-alpine`, production dependencies only, non-root, `dumb-init`,
  a readiness health check on `/api/health/ready`; the app built by Vite
  and served by `nginx:1.27-alpine`, which forwards `/api` to the API
  container, keeps hashed assets for a year and the shell uncached.
- **One origin.** The app calls `/api/v1` on its own address, so no CORS
  entry beyond that origin and no cross-site cookie. `TRUST_PROXY=1` for
  the nginx hop.
- **`SESSION_COOKIE_SECURE`** (`backend/src/config/env.ts`): the session
  cookie is `Secure` in production by default; the owner's deployment is
  reached over plain HTTP on the VPS address for now, so the setting turns
  it off until a hostname with TLS fronts the stack.
- **Prisma CLI in the image** (`prisma` moved to `dependencies`): the
  migration container runs `prisma migrate deploy` from the same image.
- **Stack** (`deploy/docker-compose.yml`): `backend` on the internal `app`
  network and on the external `pg-network` (the database publishes on
  `127.0.0.1` only and stays that way), a one-off `migrate` profile, and
  `frontend` publishing `0.0.0.0:${PUBLIC_PORT}:80`, `8081` on this VPS.
- **Remote script** (`deploy/remote-deploy.sh`): writes `backend.env` and
  `.env` from the environment with mode 600, checks `pg-network` exists,
  logs in to GHCR, pulls, applies the pending migrations from the one-off
  container, restarts the stack, waits up to two minutes for readiness and
  otherwise restores the previous image tag and fails the run.
- **CI** (`.github/workflows/ci.yml`): a `containers` job builds both
  images on every pull request without pushing; a `deploy` job after
  `quality`, on pushes to `main` or by `Run workflow` (any branch, with an
  optional `image_tag` to redeploy an earlier image), under the
  `production` environment, builds and pushes the images tagged by commit,
  copies the stack files, runs the script over SSH with the secrets passed
  as environment values, then smokes the public readiness endpoint until
  it reports the deployed commit.
- **Operations notes** (`deploy/README.md`): one-time VPS setup, the
  secrets, the first admin, logs, health, rollback.

## Out of Scope

- Backups: the owner chose none in the pipeline. The deployment guide
  still requires one before production use; recorded in the issue.
- TLS and a hostname: later; the plan says which four settings change.
- A staging stack from `dev`: later, once the production one has run.

## Verification

Run locally on macOS, Node 24:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 364 passed, 10 skipped (50 files)
- Docker is not installed on the development machine, so the two images
  and the compose file were not built here. The new `containers` job
  builds both images on this pull request; the deploy itself is proven by
  the first `Run workflow` against the VPS.

## Database and Migration Impact

None in this change. The deploy applies the repository's migrations to the
production database `dar_el_baraka` on `postgres-prod` through
`dar_el_baraka_user`, created by hand beforehand.

## Environment Impact

New GitHub environment `production` with the owner as required reviewer and
the secrets `VPS_SSH_HOST`, `VPS_SSH_USER`, `VPS_SSH_KEY`, optional
`VPS_SSH_PORT`, `PUBLIC_PORT`, `PUBLIC_URL`, `BACKEND_ENV`. New backend
setting `SESSION_COOKIE_SECURE`.

## Risks and Follow-Up

- Plain HTTP on an address: credentials travel unencrypted until a
  hostname with TLS is added. Flip `SESSION_COOKIE_SECURE`, `TRUST_PROXY`,
  `CORS_ALLOWED_ORIGINS` and the published interface that day.
- The GitHub-hosted runner reaches the VPS over SSH; the deploy key should
  be a dedicated pair for this repository.
- `docker compose run --rm migrate` fails the run if a migration fails,
  before the API restarts; the previous release keeps serving.

## Merge Checklist

- [ ] CI passed, including the `containers` job
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue 010
- [ ] Target branch is `dev`
