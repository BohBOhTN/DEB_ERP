# 010 · Deployment: build, ship and run the release on the VPS from GitHub Actions

| Field            | Value                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Module           | `.github/workflows`, `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `deploy/`                |
| Type             | Infrastructure                                                                                                    |
| Priority         | High (the release cannot be shown to the owner without it)                                                        |
| Depends on       | `dev` promoted to `main` (PR #58 and the promotion PR), the release checklist of `11_GIT_AND_RELEASE_WORKFLOW.md` |
| Suggested branch | `feat/vps-deployment-pipeline`                                                                                    |
| Related          | `12_DEPLOYMENT_AND_OPERATIONS.md` (build gate, deployment order, rollback), the Aegis staging pipeline            |

## Owner's request

> Deploy a version to my VPS with GitHub Actions, following my previous deployment steps: secrets in the GitHub repository including the VPS credentials and the backend and frontend `.env`; the backend joins `pg-network` so it reaches the production database, which only accepts internal connections. Keep the Aegis logic, improve it where there is room.

## What Aegis does today (`/Users/boh/Desktop/Aegis`)

One workflow, `deploy.yml`, on every push to `staging`:

1. A `test` job installs, migrates a throwaway Postgres, builds and tests both tiers.
2. A `build-and-deploy` job builds two images with Buildx (GHA cache), pushes them to GHCR as `:staging` and `:staging-<sha>`, then opens one SSH session (`appleboy/ssh-action`) that writes `/opt/aegis-erp-staging/.env` and `docker-compose.yml` from heredocs with the secrets interpolated, logs in to GHCR, creates the Docker network, connects the `postgres-prod` container to it, `docker compose pull` and `up -d`, waits for the backend health check, then runs `prisma migrate deploy` inside the running backend, and prunes images.
3. The backend image is a two-stage `node:20-alpine` build (`prisma generate`, `tsc`, `npm prune --production`, `dumb-init`, non-root `node`, `wget` health check). The frontend image builds Vite with `VITE_API_URL` baked in and serves `dist/` with nginx (SPA fallback, immutable assets, security headers).
4. Backend and frontend are published on two host ports and two origins, so the API needs CORS and the JWT travels in a header.

What holds up well: prebuilt images in GHCR tagged by commit, one SSH script, the external Docker network shared with the database container, compose with health checks and `restart: always`, `init: true`, the non-root runtime, the GHA build cache.

What this repository needs done differently:

- **Sessions are cookies, not JWTs** (`SESSION_COOKIE_NAME`, `secure` in production). Two origins would need `SameSite=None` cookies and CORS credentials; one origin needs nothing. Serve the frontend and `/api` from the same origin.
- **Migrations run after the new backend is up** in Aegis. `12_DEPLOYMENT_AND_OPERATIONS.md` orders it the other way: additive migration, backend, frontend, smoke. Migrations here are additive (24 files, all `ADD`/`CREATE`), so they run before the new backend starts, from a one-off container.
- **Secrets interpolated into the SSH script** are masked in logs but every one becomes a workflow input. The owner wants to keep two `.env` files as secrets; ship each file as one secret, written to disk with `chmod 600`, never expanded in the script.
- **Health probe**: the API has `/api/health/live` (process) and `/api/health/ready` (database round trip); the ready probe is the gate. The API also reports `GIT_SHA` on it, so the deployed commit is visible.
- **No rollback**: Aegis exits on an unhealthy backend and leaves it down. Keep the previous image tag and put it back when the new one never becomes ready.
- **Trigger**: Aegis deploys on every push to `staging`. Here `main` is the releasable branch and the CI workflow already runs on pushes to it, so the deploy job hangs off the existing `quality` job instead of repeating the tests.
- **Node**: the repository requires Node 22 or later and CI runs 24; Prisma 6 on Alpine needs `openssl` in the runtime image.
- **Prisma CLI at runtime**: the migration container needs `prisma` and the `prisma/` folder; `npm prune --omit=dev` removes the CLI, so `prisma` moves to `dependencies` (it is a production tool here) or stays through a dedicated stage.

## Proposed change

### 1. Container images (one PR)

- `backend/Dockerfile`: `node:24-alpine`; builder stage `npm ci`, `prisma generate`, `tsc -p tsconfig.build.json`, `npm prune --omit=dev`; runner stage `apk add --no-cache dumb-init wget openssl`, copies `dist/`, `node_modules/`, `prisma/` and `package.json`, `USER node`, `EXPOSE 4000`, health check on `http://localhost:4000/api/health/ready`, `CMD ["dumb-init","node","dist/server.js"]`. `.dockerignore` for `node_modules`, `dist`, `.env*`, tests.
- `frontend/Dockerfile`: builder `npm ci` and `npm run build` (no API URL baked in: the client defaults to `/api/v1` on the same origin); runner `nginx:1.27-alpine` with `nginx.conf`: SPA fallback, `/assets/` immutable for a year, `index.html` and `manifest.webmanifest` `no-cache`, gzip, the three security headers, and `location /api/ { proxy_pass http://backend:4000/api/; }` with `X-Forwarded-For`, `X-Forwarded-Proto`, `Host`, `proxy_read_timeout 35s` (above `REQUEST_TIMEOUT_MS`). Health check on `/`.
- Both images build in the monorepo context (`npm ci` at the root uses workspaces) with `context: .` and `file: backend/Dockerfile`, so the lockfile stays the single source.
- Backend `TRUST_PROXY` becomes `1` behind the nginx container, `2` when the VPS also has a TLS reverse proxy in front (Caddy or Traefik). The session cookie is `secure` in production, so TLS on the public hostname is required; the host proxy provides it.

### 2. Compose and the VPS layout (same PR)

`deploy/docker-compose.yml`, committed and copied to the VPS unchanged (no heredoc), reads `/opt/dar-el-barka/.env` for the image tag and ports and mounts `/opt/dar-el-barka/backend.env` as the backend's `env_file`:

- `backend`: `ghcr.io/<owner>/dar-el-barka-backend:${IMAGE_TAG}`, `env_file: backend.env`, `environment: GIT_SHA=${IMAGE_TAG}`, `init: true`, `restart: unless-stopped`, health check, networks `app` and `pg-network` (external), no published port.
- `migrate`: same image, `profiles: ["migrate"]`, `command: ["npx","prisma","migrate","deploy"]`, same `env_file` and networks, no restart; run once per deploy before `backend` restarts.
- `frontend`: `ghcr.io/<owner>/dar-el-barka-frontend:${IMAGE_TAG}`, depends on `backend` healthy, network `app`, publishes `127.0.0.1:${PUBLIC_PORT}:80` (the host proxy terminates TLS; publish on `0.0.0.0` only if no host proxy exists).
- `networks`: `app` (internal bridge) and `pg-network` (`external: true`, the database's network; the database container is never listed here).

The backend's `DATABASE_URL` in `backend.env` names the database container on `pg-network` (for example `postgresql://…@<db-container>:5432/<db>?schema=public&connection_limit=10&pool_timeout=10`), so Postgres keeps accepting internal traffic only.

### 3. The workflow (same PR)

A `deploy` job appended to `ci.yml`, `needs: quality`, `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`, plus `workflow_dispatch` with an `image_tag` input for a manual redeploy or rollback to any previous commit. `environment: production` so its secrets live in the GitHub environment and a required reviewer (the owner) approves each deploy from the Actions page. `concurrency: production-deploy`, `cancel-in-progress: false`.

Steps:

1. Log in to GHCR, build and push both images tagged `<sha>` and `latest` with the GHA cache.
2. One SSH session (`appleboy/ssh-action`, key auth, optional `VPS_SSH_PORT`) that receives `BACKEND_ENV` through `envs`, not through the script text, and runs `deploy/remote-deploy.sh` (committed, copied with `scp-action` first) with the image tag. The script:
   - writes `backend.env` (`umask 077`) and the stack `.env` (`IMAGE_TAG`, `PUBLIC_PORT`, `REGISTRY_OWNER`);
   - `docker network inspect pg-network` and fails with a clear message if it does not exist or the database container is not attached;
   - `docker compose pull`;
   - `docker compose run --rm migrate` (additive migrations, before the new API);
   - records the currently running backend image as `PREVIOUS_TAG`, then `docker compose up -d --remove-orphans`;
   - polls `backend` health up to two minutes; on failure prints the last 100 log lines, restores `PREVIOUS_TAG` in `.env`, `up -d` again and exits non-zero, so the run is red and the old release is serving;
   - `docker image prune -f` on success.
3. Smoke from the runner against the public hostname: `GET /api/health/ready` returns `ok` with the deployed `gitSha`, `GET /` returns the app shell. Failure marks the run red after the rollback branch above.

### 4. First deploy and operations (documented in `deploy/README.md`)

- One-time on the VPS: `mkdir -p /opt/dar-el-barka`, the host TLS proxy route to `127.0.0.1:${PUBLIC_PORT}`, the database container attached to `pg-network`, a database user for the app.
- First admin: the API's boot seeds the permission catalogue and gives Super Admin to the first active user; create that user once with `docker compose run --rm backend node dist/scripts/createUser.js`.
- Rollback: rerun the workflow by hand with the previous `image_tag`; the migrations stay (additive), the checklist in `12_DEPLOYMENT_AND_OPERATIONS.md` section 6 applies.
- Logs: `docker compose logs -f backend` (JSON, `LOG_PRETTY=false`); health: `/api/health/ready`.

### Secrets to add in the `production` environment

| Secret         | Content                                                                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VPS_SSH_HOST` | VPS address                                                                                                                                                                                                                  |
| `VPS_SSH_USER` | Deploy user, member of the `docker` group                                                                                                                                                                                    |
| `VPS_SSH_KEY`  | Private key of a deploy-only key pair; the public half in that user's `authorized_keys`                                                                                                                                      |
| `VPS_SSH_PORT` | Optional, `22` by default                                                                                                                                                                                                    |
| `BACKEND_ENV`  | The whole backend `.env` for production: `NODE_ENV=production`, `PORT=4000`, `DATABASE_URL` on `pg-network`, `CORS_ALLOWED_ORIGINS=https://<host>`, `TRUST_PROXY`, `LOG_PRETTY=false`, the rest as in `backend/.env.example` |
| `PUBLIC_PORT`  | Host port the frontend container publishes on `127.0.0.1` (for example `8081`)                                                                                                                                               |
| `PUBLIC_URL`   | `https://<host>`, used by the smoke step                                                                                                                                                                                     |

The frontend needs no secret: it calls `/api/v1` on its own origin. A `FRONTEND_ENV` secret is only needed if the API is ever served from another hostname (`VITE_API_V1_BASE_URL`).

`GITHUB_TOKEN` pushes and pulls the images (`packages: write` on the job); the VPS logs in to GHCR with it during the SSH session, as Aegis does.

## Tests and acceptance criteria

- `docker build` of both images succeeds in CI; the backend image answers `/api/health/live` and the frontend image serves `/`.
- A push to `main` that passes `quality` produces a pending production deploy; approving it ends with the public `/api/health/ready` reporting the pushed commit's `gitSha`.
- `migrate` applied every pending migration exactly once (the second run reports nothing to apply).
- A deliberately broken image (manual run with a bad tag) leaves the previous release serving and the run red.
- The database port is never published by the stack; `docker network inspect pg-network` shows the API container and the database only.
- Signing in through the public hostname sets the session cookie with `Secure` and the app works with no CORS entry beyond its own origin.

## Open decisions to surface

- Answered: the production database container is `postgres-prod` (postgres 16.2, published on `127.0.0.1:5432` only); the app gets its own role and database, created by hand like the development ones.
- Whether a TLS reverse proxy already runs on the VPS (Caddy, Traefik, nginx) and which hostname the app gets; without one the stack must publish on `0.0.0.0` and the session cookie cannot be `Secure`, which is not acceptable for production.
- Whether the same pipeline should also deploy a staging stack from `dev` (a second environment, a second compose directory, the same images tagged by commit). Proposed: yes, later, once the production one has run twice.
- Owner's decision: no backup step in the pipeline. `12_DEPLOYMENT_AND_OPERATIONS.md` sections 3 and 7 still require one before production use; recorded here as a deliberate deviation.
