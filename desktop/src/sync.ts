import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  LOCAL_PORT,
  CLOUD_API_URL,
  SYNC_ENABLED,
  SYNC_POLL_MS,
  SYNC_CLOUD_EMAIL,
  SYNC_CLOUD_PASSWORD,
} from './config';
import { getSecrets } from './secrets';

/** Shared key for the local backend's /sync endpoints (env override for testing). */
const SYNC_LOCAL_KEY = process.env.DESKTOP_SYNC_KEY || getSecrets().syncLocalKey;

/**
 * Desktop sync relay (Phase 2). The Angular app and both backends stay sync-agnostic —
 * this loop shuttles change batches between the LOCAL backend (embedded Postgres) and
 * the CLOUD backend:
 *
 *   push:  GET  local /sync/changes?source=outbox  →  POST cloud /sync/apply
 *   pull:  GET  cloud /sync/changes?source=version →  POST local /sync/apply
 *
 * Cursors persist in appData so sync resumes across restarts. Cloud auth is a normal
 * email/password login (session cookie); local auth is the shared X-Sync-Key.
 */

const LOCAL_API = `http://127.0.0.1:${LOCAL_PORT}/api`;
const BATCH = 200;

interface Cursors {
  lastPushOutboxId: number;
  lastPullVersion: number;
}

interface Batch {
  changes: any[];
  cursor: number;
}

let timer: NodeJS.Timeout | null = null;
let running = false;
let cloudCookie = '';
let cloudToken = '';
let nodeId: string | undefined;

// The cloud account the relay authenticates as. Defaults to the config value, but
// is overridden by the ACTUAL user who logs into the app (setCloudCreds via IPC),
// so each device syncs the tenant of whoever signed in.
let cloudEmail = SYNC_CLOUD_EMAIL;
let cloudPassword = SYNC_CLOUD_PASSWORD;

export interface SyncState {
  enabled: boolean;
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  error: string | null;
}
const state: SyncState = {
  enabled: SYNC_ENABLED,
  online: false,
  syncing: false,
  lastSyncAt: null,
  error: null,
};

/** Snapshot for the renderer's status badge (via IPC). */
export function getSyncState(): SyncState {
  return { ...state };
}

function stateDir(): string {
  return path.join(app.getPath('appData'), 'WaCommerceERP');
}
function cursorsFile(): string {
  return path.join(stateDir(), 'sync-cursors.json');
}
function tokenFile(): string {
  return path.join(stateDir(), 'sync-token.txt');
}

function loadToken(): void {
  try {
    cloudToken = fs.readFileSync(tokenFile(), 'utf8').trim();
  } catch {
    cloudToken = '';
  }
}
function saveToken(token: string): void {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(tokenFile(), token);
  } catch (e) {
    console.error('[sync] token save failed', e);
  }
}

function loadCursors(): Cursors {
  try {
    return { lastPushOutboxId: 0, lastPullVersion: 0, ...JSON.parse(fs.readFileSync(cursorsFile(), 'utf8')) };
  } catch {
    return { lastPushOutboxId: 0, lastPullVersion: 0 };
  }
}

function saveCursors(c: Cursors): void {
  try {
    fs.mkdirSync(path.dirname(cursorsFile()), { recursive: true });
    fs.writeFileSync(cursorsFile(), JSON.stringify(c));
  } catch (e) {
    console.error('[sync] cursor save failed', e);
  }
}

/**
 * Ensure we can talk to the cloud: reuse a stored sync token, else log in once with
 * email/password and mint a token so the password isn't reused every call.
 */
async function ensureCloudAuth(): Promise<boolean> {
  if (cloudToken) return true;
  loadToken();
  if (cloudToken) return true;

  // No stored token yet — we need real credentials (set by the logged-in user).
  if (!cloudEmail || !cloudPassword) return false;

  // First time on this device: log in, then mint a token.
  try {
    const login = await fetch(`${CLOUD_API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: cloudEmail, password: cloudPassword }),
    });
    if (!login.ok) {
      console.error(`[sync] cloud login failed: ${login.status}`);
      return false;
    }
    const setCookies = (login.headers as any).getSetCookie?.() as string[] | undefined;
    if (setCookies?.length) cloudCookie = setCookies.map((c) => c.split(';')[0]).join('; ');

    const mint = await fetch(`${CLOUD_API_URL}/sync/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cloudCookie },
      body: JSON.stringify({ label: 'desktop' }),
    });
    if (mint.ok) {
      cloudToken = ((await mint.json()) as any)?.data?.token || '';
      if (cloudToken) saveToken(cloudToken);
    }
    // Even without a token we can proceed this session on the cookie.
    return !!(cloudToken || cloudCookie);
  } catch (e) {
    console.error('[sync] cloud unreachable', (e as Error).message);
    return false;
  }
}

async function readChanges(base: string, source: 'outbox' | 'version', since: number, local: boolean): Promise<Batch> {
  const url = `${base}/sync/changes?source=${source}&since=${since}&limit=${BATCH}`;
  const res = await fetch(url, { headers: authHeaders(local) });
  if (!res.ok) throw new Error(`readChanges ${source} → ${res.status}`);
  const body = (await res.json()) as any;
  return { changes: body?.data?.changes ?? [], cursor: body?.data?.cursor ?? since };
}

async function applyChanges(base: string, changes: any[], local: boolean): Promise<void> {
  const res = await fetch(`${base}/sync/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(local) },
    body: JSON.stringify({ nodeId, changes }),
  });
  if (!res.ok) throw new Error(`applyChanges → ${res.status}`);
}

function authHeaders(local: boolean): Record<string, string> {
  if (local) return { 'x-sync-key': SYNC_LOCAL_KEY };
  return cloudToken ? { 'x-sync-token': cloudToken } : { cookie: cloudCookie };
}

/** Drain the local outbox to the cloud. */
async function push(cursors: Cursors): Promise<void> {
  for (;;) {
    const batch = await readChanges(LOCAL_API, 'outbox', cursors.lastPushOutboxId, true);
    if (!batch.changes.length) break;
    await applyChanges(CLOUD_API_URL, batch.changes, false);
    cursors.lastPushOutboxId = batch.cursor;
    saveCursors(cursors);
    if (batch.changes.length < BATCH) break;
  }
}

/** Drain cloud changes into the local DB. */
async function pull(cursors: Cursors): Promise<void> {
  for (;;) {
    const batch = await readChanges(CLOUD_API_URL, 'version', cursors.lastPullVersion, false);
    if (!batch.changes.length) break;
    await applyChanges(LOCAL_API, batch.changes, true);
    cursors.lastPullVersion = batch.cursor;
    saveCursors(cursors);
    if (batch.changes.length < BATCH) break;
  }
}

async function tick(): Promise<void> {
  if (running) return; // never overlap
  running = true;
  state.syncing = true;
  try {
    if (!(await ensureCloudAuth())) {
      state.online = false;
      return; // offline / auth failed → try next tick
    }
    state.online = true;
    if (!nodeId) {
      const res = await fetch(`${LOCAL_API}/sync/status`, { headers: authHeaders(true) });
      if (res.ok) nodeId = ((await res.json()) as any)?.data?.nodeId;
    }
    const cursors = loadCursors();
    await push(cursors);
    await pull(cursors);
    state.lastSyncAt = new Date().toISOString();
    state.error = null;
  } catch (e) {
    // A failed tick (e.g. went offline mid-sync) just retries next interval.
    const msg = (e as Error).message;
    console.error('[sync] tick error:', msg);
    state.error = msg;
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(msg)) state.online = false;
    if (msg.includes('401')) {
      cloudCookie = '';
      cloudToken = ''; // force re-auth (token may have been revoked)
    }
  } finally {
    running = false;
    state.syncing = false;
  }
}

/**
 * Point the relay at the account that just logged into the app. When a DIFFERENT
 * user signs in we drop the cached token/cookie so we re-auth (and re-scope) as
 * them, then sync immediately. Called from the renderer via IPC on every login.
 */
export function setCloudCreds(email: string, password: string): void {
  const e = (email || '').trim();
  if (!e) return;
  if (e.toLowerCase() !== (cloudEmail || '').toLowerCase()) {
    cloudToken = '';
    cloudCookie = '';
    try { fs.rmSync(tokenFile(), { force: true }); } catch { /* fine */ }
  }
  cloudEmail = e;
  cloudPassword = password || '';
}

/** Run one push+pull cycle right now (the "Sync now" button / on-login trigger). */
export async function syncNow(): Promise<SyncState> {
  if (!SYNC_ENABLED) return { ...state };
  await tick();
  return { ...state };
}

export function startSync(): void {
  if (!SYNC_ENABLED) {
    console.log('[sync] disabled (set DESKTOP_SYNC=0 to disable)');
    return;
  }
  if (timer) return;
  console.log(`[sync] relay starting — cloud=${CLOUD_API_URL}, every ${SYNC_POLL_MS}ms`);
  timer = setInterval(() => void tick(), SYNC_POLL_MS);
  void tick(); // run one immediately (uses a stored token if a prior login left one)
}

export function stopSync(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
