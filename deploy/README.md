# Deploying to the VPS

The stack runs from `/opt/dar-el-barka` on the VPS: two images built by
GitHub Actions and pushed to GHCR, one `docker compose` file (this folder's),
and two files written by the deploy from GitHub secrets, `.env` (image tag,
port, registry owner) and `backend.env` (the API's configuration). The API
joins the database's network, `pg-network`, so Postgres keeps accepting
internal connections only. The app is served on one origin: nginx in the
frontend container forwards `/api` to the API container.

## One-time setup

1. On the VPS, a deploy user in the `docker` group and a key pair whose
   private half is the `VPS_SSH_KEY` secret.
2. `docker network create pg-network` if it does not exist, then
   `docker network connect pg-network postgres-prod`.
3. In `postgres-prod`, the application's role and database (see the
   `DATABASE_URL` below); `pg_trgm` is created by the first migration.
4. In the GitHub repository, an environment named `production` with the
   owner as required reviewer and these secrets:

| Secret         | Content                                                                                                                                                                                                                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VPS_SSH_HOST` | VPS address                                                                                                                                                                                                                                                                                                                                         |
| `VPS_SSH_USER` | Deploy user                                                                                                                                                                                                                                                                                                                                         |
| `VPS_SSH_KEY`  | Private key                                                                                                                                                                                                                                                                                                                                         |
| `VPS_SSH_PORT` | Optional, `22` by default                                                                                                                                                                                                                                                                                                                           |
| `PUBLIC_PORT`  | Host port published for the app, `8081`                                                                                                                                                                                                                                                                                                             |
| `PUBLIC_URL`   | `http://<ip>:8081`, used by the smoke step                                                                                                                                                                                                                                                                                                          |
| `BACKEND_ENV`  | The API's `.env`: `NODE_ENV=production`, `PORT=4000`, `DATABASE_URL=postgresql://dar_el_baraka_user:<password>@postgres-prod:5432/dar_el_baraka?schema=public&connection_limit=10&pool_timeout=10`, `CORS_ALLOWED_ORIGINS=http://<ip>:8081`, `TRUST_PROXY=1`, `SESSION_COOKIE_SECURE=false`, `LOG_PRETTY=false`, the rest as `backend/.env.example` |

## Behind the VPS nginx with a domain

The VPS nginx terminates TLS for the domain and forwards to the stack on
the loopback; the stack publishes `127.0.0.1:${PUBLIC_PORT}` by default
(`PUBLIC_BIND=0.0.0.0` in the secrets puts it back on the address for a
deployment without a domain). Two hops then sit in front of the API, the
VPS nginx and the frontend container's nginx, so the API's settings are:

| Where         | Setting                                 |
| ------------- | --------------------------------------- |
| `BACKEND_ENV` | `SESSION_COOKIE_SECURE=true`            |
| `BACKEND_ENV` | `TRUST_PROXY=2`                         |
| `BACKEND_ENV` | `CORS_ALLOWED_ORIGINS=https://<domain>` |
| `PUBLIC_URL`  | `https://<domain>`                      |

The host site, `/etc/nginx/sites-available/<domain>`, forwards everything
to the container and passes the client address and scheme on:

```
server {
    server_name <domain>;

    client_max_body_size 6m;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 40s;
    }

    listen 80;
}
```

Enable it, then let certbot add the certificate and the redirect:
`sudo ln -s /etc/nginx/sites-available/<domain> /etc/nginx/sites-enabled/`,
`sudo nginx -t && sudo systemctl reload nginx`,
`sudo certbot --nginx -d <domain>`. The 6 MB body limit is what a 5 MB
photo upload needs once the multipart envelope is counted.

## Product photos

The API writes the photos to `MEDIA_ROOT` (`/data/media` in the container),
a named volume `deb-media` shared read-only with the frontend container,
which serves them under `/media/`. The volume survives redeploys; it is the
second thing to back up after the database. `MEDIA_ROOT` is set in the
compose file, so `BACKEND_ENV` needs no line for it.

## Each deploy

A push to `main` runs the CI `quality` job, then waits for the reviewer's
approval on the `production` environment, then builds the images tagged
with the commit, copies this folder to the VPS and runs
`remote-deploy.sh`, which writes the configuration, pulls, applies the
pending migrations from a one-off container, restarts the stack and waits
for the API's readiness. If the API never becomes ready, the script puts
the previous image back and the run is red.

`Run workflow` on the Actions page deploys the current commit of any
branch by hand; with an `image_tag`, it redeploys an image built earlier
(a rollback).

## First admin

The API seeds the permission catalogue at boot and gives the Super Admin
role to the first active user. Create that user once:

```
cd /opt/dar-el-barka
docker compose run --rm backend node dist/scripts/createUser.js <email> "<display name>" <password>
```

## Day to day

- Logs: `docker compose logs -f backend` (JSON lines).
- Health: `http://<ip>:8081/api/health/ready` reports the database and the
  deployed commit.
- Restart: `docker compose up -d`.
