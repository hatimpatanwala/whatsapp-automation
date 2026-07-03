# WhatsApp Commerce ERP — Desktop (Electron / Windows)

Offline-first desktop ERP. The app boots an **embedded PostgreSQL** and a local copy of
the **NestJS backend**, then loads the Angular SPA from that local backend — so it runs
with no internet. See `../docs/DESKTOP_ERP_PLAN.md` for the full architecture/roadmap.

- **Phase 0 (done):** Electron shell, NSIS installer, auto-update, Tally-style menu.
- **Phase 1 (done):** embedded Postgres + local backend + first-run provisioning.
- **Phase 2 (slice 1 done):** offline sync engine for master data (see below).

## Prerequisites

- Node 20+, npm, Windows.
- **Do NOT run the app as Administrator** — PostgreSQL on Windows refuses to start under
  an elevated account. Launch it normally (double-click).

## One-time build of the pieces the local backend serves

```bash
# 1. Backend build (produces ../dist/main.js that the desktop forks)
cd ..            && npm install && npm run build
# 2. Angular build (served by the local backend)
cd frontend      && npm install && npm run build:prod
# 3. Desktop deps
cd ../desktop    && npm install
```

## Run

```bash
cd desktop

# Full offline stack: embedded Postgres + local backend + local SPA
npm start
#   first run provisions the local DB and a default company, then opens the app.
#   default offline login →  phone: +919000000000   password: admin1234

# Fast UI iteration against `ng serve` (no local DB; needs `npm start` in ../frontend)
npm run dev

# Just the shell against the hosted cloud portal
npm run start:cloud
```

The embedded Postgres data lives in `%APPDATA%/WaCommerceERP/pgdata`; first-run
provisioning writes `%APPDATA%/WaCommerceERP/.provisioned`. Delete that folder to reset.

## Build the Windows installer (Phase 6)

The installer bundles the whole offline stack: the NestJS backend (`../dist`), its
`node_modules`, the Angular build, and the embedded-Postgres binaries. `electron-builder.yml`
copies these under `resources/backend` (matching `paths.ts`' packaged branch), unpacks the
Postgres binaries from the asar, and provisioning runs the compiled `dist/provision-cli.js`
(no ts-node/npm needed at runtime).

1. Put an icon at `build/icon.ico` (256×256).
2. Build everything + package in one step:

   ```bash
   npm run pack:full     # builds ../dist, ../frontend build, then electron-builder
   ```

   → `release/WhatsApp Commerce ERP-Setup-<version>.exe`.

### Remaining hardening (do before shipping to distributors)

- **Native modules**: the backend's native deps (`sharp`, `bcrypt`) are built for system
  Node. The packaged app forks them under Electron's Node — rebuild them for Electron's ABI
  (`electron-rebuild`) **or** bundle a standalone Node runtime and point the fork at it via
  `DESKTOP_NODE`. `pg` and `embedded-postgres` are unaffected (pure JS / external binary).
- **Code signing**: set `CSC_LINK` (cert path/URL) + `CSC_KEY_PASSWORD` in the environment
  before `pack:full` (EV cert → set `win.certificateSubjectName` instead). Unsigned installers
  trigger SmartScreen warnings.
- **Installer size**: bundling the backend `node_modules` is large; prune dev/optional deps
  or bundle the backend (esbuild/ncc) to shrink it.

## Sync engine (Phase 2)

Master data (customers, products/SKUs, categories, brands, variants, suppliers, tax rates,
warehouses) syncs between the local DB and the cloud. It's **off by default**; enable with:

```bash
# needs the cloud running the /sync endpoints + a real account
$env:DESKTOP_SYNC="1"
$env:DESKTOP_CLOUD_API="https://your-cloud/api"
$env:DESKTOP_SYNC_EMAIL="you@company.com"; $env:DESKTOP_SYNC_PASSWORD="…"
npm start
```

Model: DB triggers stamp `sync_version`/`updated_at` and log local changes to `sync_outbox`;
the relay pushes the outbox to the cloud and pulls cloud changes back, resolving conflicts
last-writer-wins. Cursors persist in `%APPDATA%/WaCommerceERP/sync-cursors.json`.

Verify the engine end-to-end (needs `../dist` built, run on a **non-elevated** shell):

```bash
cd .. && npm run build
cd desktop && node test/sync-smoke.mjs      # asserts capture / no-echo / LWW convergence
```

## How it boots (desktop/src)

- `localdb.ts` — start/stop embedded Postgres, initdb on first run, ensure DB exists.
- `provision.ts` — first-run: `migration:public` + `tenant:create` against local Postgres.
- `backend.ts` — fork `../dist/main.js` pointed at local Postgres, `SERVE_STATIC_DIR` =
  Angular build; health-check `/health`. Dev forks under system Node; packaged uses
  Electron's Node.
- `main.ts` — orchestrates DB → provision → backend → `loadURL(127.0.0.1)`, with a boot
  splash and a cloud-portal fallback if local startup fails.
- `preload.ts` — `window.desktop` bridge (version, update check, menu commands, online).
