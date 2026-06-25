# Staging / Test Environment Setup

A second, **fully isolated** stack (Postgres + Redis + backend + frontend) that runs
**without touching production**. Prod's containers, DB, Redis, volumes, and ports are
never modified.

## Isolation at a glance

| | Production | Staging |
|---|---|---|
| Compose project | `deploy` | `wa-staging` |
| Containers | `wa-postgres`, `wa-redis`, `wa-backend`, `wa-frontend` | `wa-staging-*` |
| Postgres | `127.0.0.1:5432` | `127.0.0.1:5433` |
| Redis | `127.0.0.1:6379` | `127.0.0.1:6380` |
| Backend | `127.0.0.1:3000` | `127.0.0.1:3001` |
| Frontend | `:8080` | `:8081` |
| Volumes | `deploy_pgdata`, `deploy_redisdata` | `wa-staging_pgdata-staging`, `wa-staging_redisdata-staging` |
| Network | `wa-network` | `wa-staging-network` |
| Database | `whatsapp_commerce` | `whatsapp_commerce_staging` (separate container) |

Because the staging Postgres/Redis are **separate containers with their own volumes**,
nothing the staging stack does can affect prod data.

## ⚠️ Resource warning (read first)

Production is tuned for a **1 GB box and already uses ~1 GB**. A second stack needs
**≥2 GB additional free RAM** (t3.medium / 4 GB recommended). Options:

- **Best:** run staging on a **separate/bigger instance** (zero risk to prod).
- **Same box:** only if it has enough free RAM — otherwise the kernel may OOM‑kill
  production containers. Check first: `free -m`.

## One-time prerequisites (on the server)

```bash
cd /path/to/whatsapp-automation
git fetch origin
git checkout new-features        # the branch with this code
git pull

# Build the staging env file from prod (reuse all prod values, override the few
# staging-specific ones — see deploy/.env.staging.example for the exact list).
cp deploy/.env deploy/.env.staging
nano deploy/.env.staging         # set DB_NAME, CORS_ORIGIN, FRONTEND_URL, OAUTH_CALLBACK_BASE_URL
```

## Bring up staging (prod keeps running, untouched)

```bash
# 1) Start ONLY the staging DB + Redis first.
docker compose -p wa-staging -f deploy/docker-compose.staging.yml \
  --env-file deploy/.env.staging up -d postgres redis

# 2) Clone PROD public schema + super_admins data ONLY (prod is read-only here).
bash deploy/clone-superadmins.sh

# 3) Start the staging backend + frontend.
docker compose -p wa-staging -f deploy/docker-compose.staging.yml \
  --env-file deploy/.env.staging up -d --build
```

Staging is now on:
- Frontend: `http://<server>:8081`
- Backend API: `http://127.0.0.1:3001/api` (front it with nginx/subdomain if public)

Log in with your **existing super-admin credentials** (cloned from prod). No tenant
data is present — create test tenants via the normal signup/onboarding flow.

## Verify isolation

```bash
docker compose -p wa-staging -f deploy/docker-compose.staging.yml ps   # staging only
docker ps --format '{{.Names}}'                                        # prod wa-* untouched
free -m                                                                # confirm headroom
```

## Update staging later

```bash
git pull
docker compose -p wa-staging -f deploy/docker-compose.staging.yml \
  --env-file deploy/.env.staging up -d --build
```

## Tear down staging (prod unaffected)

```bash
# Stop + remove staging containers (keeps the staging DB volume):
docker compose -p wa-staging -f deploy/docker-compose.staging.yml down

# Also wipe the staging data volumes (full reset):
docker compose -p wa-staging -f deploy/docker-compose.staging.yml down -v
```

## Notes
- `clone-superadmins.sh` aborts if staging already has super_admins (so you don't
  overwrite a test env you've been using). For a clean re-clone, `down -v` first.
- Keep `TOKEN_ENCRYPTION_KEY` identical to prod if you later clone encrypted rows
  (e.g. `meta_tokens`); for `super_admins` (bcrypt) it isn't required.
- Webhooks: if you point a real WhatsApp number at staging, use a **separate**
  verify token / callback URL so prod webhooks aren't affected.
