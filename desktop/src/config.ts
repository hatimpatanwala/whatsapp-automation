/**
 * Desktop app configuration.
 *
 * Phase 1: the app boots an embedded PostgreSQL and a local copy of the NestJS
 * backend, then loads the Angular SPA from that local backend (LOCAL_APP_URL).
 * Everything runs offline. When the machine is online, the sync engine (Phase 2)
 * reconciles the local DB with the cloud.
 *
 * CLOUD_PORTAL_URL is the hosted fallback used only if the local backend fails to
 * boot, so the app still opens.
 */

// ─── Local runtime ───────────────────────────────────────────────────────────
/** Port the embedded NestJS backend listens on (127.0.0.1). */
export const LOCAL_PORT = 43110;

/** URL the window loads once the local backend is healthy (ERP Home dashboard). */
export const LOCAL_APP_URL = `http://127.0.0.1:${LOCAL_PORT}/home`;

// ─── Local database mode ─────────────────────────────────────────────────────
/**
 * 'embedded' (default): the bundled PostgreSQL under %APPDATA% — zero dependencies,
 *   what distributors get.
 * 'docker': the repo's existing docker-compose Postgres+Redis (wa-postgres/wa-redis on
 *   the standard ports) — for running the desktop over a copy of the ONLINE PORTAL's
 *   data (import a pg_dump once via `npm run import:dump`). Queues work too (real Redis).
 */
export const DB_MODE: 'embedded' | 'docker' = process.env.DESKTOP_DB === 'docker' ? 'docker' : 'embedded';

// ─── Embedded PostgreSQL ─────────────────────────────────────────────────────
export const PG_PORT = 54329; // off the default 5432 to avoid clashing with a system Postgres
export const PG_USER = 'postgres';
export const PG_PASSWORD = 'postgres';
export const DB_NAME = 'whatsapp_commerce';

// ─── Docker PostgreSQL (root docker-compose.yml services) ───────────────────
export const DOCKER_PG_PORT = 5432;
export const DOCKER_REDIS_PORT = 6379;

/**
 * The single local tenant (one distributor = one tenant). Login is email-based, so the
 * seeded owner has an email + password to log in offline. First online login later
 * reconciles with the cloud identity.
 */
export const DEFAULT_TENANT = {
  name: 'My Business',
  slug: 'local',
  ownerPhone: '+919000000000',
  ownerEmail: 'admin@wacommerce.local',
  ownerPassword: 'admin1234',
};

// ─── Sync engine (Phase 2) ───────────────────────────────────────────────────
/** Cloud API base the desktop relays to (…/api). */
export const CLOUD_API_URL = process.env.DESKTOP_CLOUD_API || 'https://staging-whatsappdemo.duckdns.org/api';

/** Master switch. ON by default (the cloud has the /sync endpoints); set
 *  DESKTOP_SYNC=0 to force a purely-offline install with no cloud sync. */
export const SYNC_ENABLED = process.env.DESKTOP_SYNC !== '0';

// (The desktop→local-backend sync key now comes from the per-install secrets file —
// see secrets.ts; DESKTOP_SYNC_KEY env still overrides for testing.)

/** How often the relay pushes/pulls when online (ms). */
export const SYNC_POLL_MS = Number(process.env.DESKTOP_SYNC_POLL_MS || 15000);

/** Cloud credentials the relay logs in with (defaults to the local owner for testing). */
export const SYNC_CLOUD_EMAIL = process.env.DESKTOP_SYNC_EMAIL || DEFAULT_TENANT.ownerEmail;
export const SYNC_CLOUD_PASSWORD = process.env.DESKTOP_SYNC_PASSWORD || DEFAULT_TENANT.ownerPassword;

// ─── Cloud fallback / dev ────────────────────────────────────────────────────
/** Hosted portal, used only if the local backend can't start. */
export const CLOUD_PORTAL_URL = 'https://staging-whatsappdemo.duckdns.org';

/**
 * Dev override: set DESKTOP_DEV_URL=http://localhost:4200 to load `ng serve` instead
 * of the local backend (skips the embedded-DB boot for fast UI iteration).
 */
export const DEV_URL = process.env.DESKTOP_DEV_URL;
export const IS_DEV = !!DEV_URL;

/** Skip the embedded backend entirely and just load a URL (dev or cloud fallback). */
export const SHELL_ONLY = IS_DEV || process.env.DESKTOP_SHELL_ONLY === '1';

/** Auto-update feed (matches publish in electron-builder.yml). */
export const UPDATE_FEED_URL =
  process.env.DESKTOP_UPDATE_FEED || 'https://staging-whatsappdemo.duckdns.org/desktop-updates/';

export const PRODUCT_NAME = 'NexusFlow';
