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

## Staging: `testing.darelbarka.work`

A second stack runs beside production on the same VPS (issue 017), from
`/opt/dar-el-barka-staging`, with its own containers (`deb-staging-backend`,
`deb-staging-frontend`), its own Docker network and media volume, its own
port on the loopback and its own database in `postgres-prod`. The branch
`staging` deploys to it: a push runs the CI `quality` job, then the deploy,
with no approval step. `main` keeps deploying to production behind the
reviewer.

| Stack      | Branch    | Folder                      | Containers      | Port   | Database                | Image tag |
| ---------- | --------- | --------------------------- | --------------- | ------ | ----------------------- | --------- |
| production | `main`    | `/opt/dar-el-barka`         | `deb-*`         | `8081` | `dar_el_baraka`         | `latest`  |
| staging    | `staging` | `/opt/dar-el-barka-staging` | `deb-staging-*` | `8082` | `dar_el_baraka_staging` | `staging` |

### One-time setup

1. **DNS**: an `A` record `testing.darelbarka.work` to the VPS address.
2. **Folders**, owned by the deploy user:
   `sudo mkdir -p /opt/dar-el-barka-staging /opt/dar-el-barka-backups`,
   `sudo chown <deploy-user>: /opt/dar-el-barka-staging /opt/dar-el-barka-backups`.
3. **The staging role** in `postgres-prod`, with a password of its own
   (the database itself is created by the copy in step 6). The server's
   admin role is the `POSTGRES_USER` the container was created with, which
   the first command prints; it is not always `postgres`:

   ```
   docker exec postgres-prod printenv POSTGRES_USER
   docker exec -it postgres-prod psql -U <admin-role> -d postgres -c "CREATE ROLE dar_el_baraka_staging_user LOGIN PASSWORD '<password>'"
   ```

4. **GitHub**: an environment named `staging`, without a required
   reviewer, with the same secrets as `production` except:

| Secret        | Staging value                                                                                                                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_PORT` | `8082` (required: the deploy refuses a staging stack without it, `8081` is production's)                                                                                                                                                                                                            |
| `PUBLIC_URL`  | `https://testing.darelbarka.work`                                                                                                                                                                                                                                                                   |
| `BACKEND_ENV` | production's, with `DATABASE_URL=postgresql://dar_el_baraka_staging_user:<password>@postgres-prod:5432/dar_el_baraka_staging?schema=public&connection_limit=10&pool_timeout=10`, `CORS_ALLOWED_ORIGINS=https://testing.darelbarka.work`, `SESSION_COOKIE_NAME=deb_staging_session`, `TRUST_PROXY=2` |

`VPS_SSH_HOST`, `VPS_SSH_USER`, `VPS_SSH_KEY` and `VPS_SSH_PORT` are the
same as production's. The deploy refuses a staging stack whose
`DATABASE_URL` does not name a database containing `staging`, so a
secret copied from production cannot point staging at real data. It reads
the database name itself, the part after the last `/`: both the role and
the database change from production's (`…_staging_user` and
`…/dar_el_baraka_staging`), and changing the role alone is refused.

5. **The host site**: the block of the previous section with
   `server_name testing.darelbarka.work;` and
   `proxy_pass http://127.0.0.1:8082;`, enabled the same way, then
   `sudo certbot --nginx -d testing.darelbarka.work`.
6. **The data**: copy production into staging (next section). The first
   deploy needs the database to exist.
7. **The branch**: `git push origin main:staging` creates it from `main`
   and triggers the first staging deploy.

### Copying production into staging

`refresh-staging-db.sh` is copied to both stack folders by every deploy;
before the first one, take it from the repository. Run it on the VPS:

```
cd /opt/dar-el-barka-staging
COPY_MEDIA=1 ./refresh-staging-db.sh
```

It dumps `dar_el_baraka` to `/opt/dar-el-barka-backups/<name>-<date>.dump`
(a backup of production worth keeping, readable by its owner only), asks
for confirmation, recreates `dar_el_baraka_staging` from the dump owned by
the staging role, clears the sessions, and with `COPY_MEDIA=1` copies the
product photos to the staging volume. Production is only read. The script
refuses a target database without `staging` in its name. Run it again
whenever staging should start over from production's current data.

Staging then holds real customers and the real users with their real
passwords: keep the address among the people who test.

### Working with the branches

- A fix or a feature branch is merged into `staging` first and tried on
  `testing.darelbarka.work`; once accepted, `staging` is merged into
  `main`, which deploys production after the reviewer's approval.
- `Run workflow` on the Actions page deploys any branch by hand to the
  stack chosen (`staging` by default); with an `image_tag` it redeploys an
  image built earlier.
- A migration reaches staging first. Staging and production share the
  Postgres server but not the database, so a bad migration on staging
  leaves production's data alone.

## Product photos

The API writes the photos to `MEDIA_ROOT` (`/data/media` in the container),
a named volume `deb-media` shared read-only with the frontend container,
which serves them under `/media/`. The volume survives redeploys; it is the
second thing to back up after the database. `MEDIA_ROOT` is set in the
compose file, so `BACKEND_ENV` needs no line for it.

## Each deploy

A push to `main` runs the CI `quality` job, then waits for the reviewer's
approval on the `production` environment (a push to `staging` deploys to
the staging stack without that wait), then builds the images tagged with
the commit, copies this folder to the VPS and runs
`remote-deploy.sh`, which writes the configuration, pulls, applies the
pending migrations from a one-off container, restarts the stack and waits
for the API's readiness. If the API never becomes ready, the script puts
the previous image back and the run is red.

`Run workflow` on the Actions page deploys the current commit of any
branch by hand to the stack chosen, staging unless production is picked;
with an `image_tag`, it redeploys an image built earlier (a rollback).

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
