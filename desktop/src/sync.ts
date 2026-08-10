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
  /** Current stage of an in-flight run. */
  phase: 'idle' | 'connecting' | 'push' | 'pull' | 'done';
  /** 0..100 progress of the current phase (best-effort). */
  percent: number;
  /** Rows pushed to the cloud this run. */
  uploaded: number;
  /** Rows pulled from the cloud this run. */
  downloaded: number;
  /** Table the last processed batch belonged to (for a human-readable hint). */
  currentTable: string | null;
  lastSyncAt: string | null;
  error: string | null;
  /** Local changes still queued to upload (>0 ⇒ more work; a resume is pending). */
  pendingUpload: number;
}
const state: SyncState = {
  enabled: SYNC_ENABLED,
  online: false,
  syncing: false,
  phase: 'idle',
  percent: 0,
  uploaded: 0,
  downloaded: 0,
  currentTable: null,
  lastSyncAt: null,
  error: null,
  pendingUpload: 0,
};

// Denominators captured at the start of each phase so we can show a percentage.
let pushTotalStart = 0;
let pullStart = 0;
let pullHead = 0;

// Live progress fan-out: the main process subscribes and forwards each snapshot to
// the renderer (window.desktop badge) so the progress bar animates in real time
// rather than only on the 2s poll.
type SyncListener = (s: SyncState) => void;
const listeners = new Set<SyncListener>();
export function onSyncState(cb: SyncListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function emit(): void {
  const snap = getSyncState();
  for (const cb of listeners) {
    try {
      cb(snap);
    } catch {
      /* a bad listener must never break sync */
    }
  }
}

/** Snapshot for the renderer's status badge (via IPC). */
export function getSyncState(): SyncState {
  return { ...state };
}

function lastTable(changes: any[]): string | null {
  const c = changes[changes.length - 1];
  return c?.table ?? c?.table_name ?? null;
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

/** How many local changes are still queued to upload (progress denominator + resume hint). */
async function localOutboxCount(): Promise<number> {
  try {
    const res = await fetch(`${LOCAL_API}/sync/status`, { headers: authHeaders(true) });
    if (!res.ok) return 0;
    return Number(((await res.json()) as any)?.data?.outboxCount ?? 0);
  } catch {
    return 0;
  }
}

/** The cloud's highest sync_version (head) — the target the pull cursor climbs toward. */
async function cloudHeadVersion(): Promise<number> {
  try {
    const res = await fetch(`${CLOUD_API_URL}/sync/status`, { headers: authHeaders(false) });
    if (!res.ok) return 0;
    return Number(((await res.json()) as any)?.data?.maxVersion ?? 0);
  } catch {
    return 0;
  }
}

/** Drain the local outbox to the cloud. */
async function push(cursors: Cursors): Promise<void> {
  state.phase = 'push';
  pushTotalStart = await localOutboxCount();
  emit();
  for (;;) {
    const batch = await readChanges(LOCAL_API, 'outbox', cursors.lastPushOutboxId, true);
    if (!batch.changes.length) break;
    await applyChanges(CLOUD_API_URL, batch.changes, false);
    cursors.lastPushOutboxId = batch.cursor;
    saveCursors(cursors);
    state.uploaded += batch.changes.length;
    state.currentTable = lastTable(batch.changes) ?? state.currentTable;
    state.percent = pushTotalStart > 0 ? Math.min(99, Math.round((state.uploaded / pushTotalStart) * 100)) : 100;
    emit();
    if (batch.changes.length < BATCH) break;
  }
}

/** Drain cloud changes into the local DB. */
async function pull(cursors: Cursors): Promise<void> {
  state.phase = 'pull';
  pullStart = cursors.lastPullVersion;
  pullHead = await cloudHeadVersion();
  state.percent = 0;
  emit();
  for (;;) {
    const batch = await readChanges(CLOUD_API_URL, 'version', cursors.lastPullVersion, false);
    if (!batch.changes.length) break;
    await applyChanges(LOCAL_API, batch.changes, true);
    cursors.lastPullVersion = batch.cursor;
    saveCursors(cursors);
    state.downloaded += batch.changes.length;
    state.currentTable = lastTable(batch.changes) ?? state.currentTable;
    const span = pullHead - pullStart;
    state.percent = span > 0 ? Math.min(99, Math.round(((cursors.lastPullVersion - pullStart) / span) * 100)) : 100;
    emit();
    if (batch.changes.length < BATCH) break;
  }
}

async function tick(): Promise<void> {
  if (running) return; // never overlap
  running = true;
  state.syncing = true;
  state.phase = 'connecting';
  state.percent = 0;
  state.uploaded = 0;
  state.downloaded = 0;
  state.currentTable = null;
  emit();
  try {
    if (!(await ensureCloudAuth())) {
      state.online = false;
      state.phase = 'idle';
      state.error = state.error || 'Could not reach the cloud. Check your connection and try again.';
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
    state.phase = 'done';
    state.percent = 100;
    // Anything still queued means the run stopped short — surfaced as a resume hint.
    state.pendingUpload = await localOutboxCount();
  } catch (e) {
    // A failed tick (e.g. went offline mid-sync) leaves the persisted cursors where
    // they were, so the next run (auto every interval, or the "Sync now" button)
    // resumes from exactly this point — no data is lost, nothing is re-done.
    const msg = (e as Error).message;
    console.error('[sync] tick error:', msg);
    state.error = friendlyError(msg);
    state.phase = 'idle';
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(msg)) state.online = false;
    if (msg.includes('401')) {
      cloudCookie = '';
      cloudToken = ''; // force re-auth (token may have been revoked)
    }
  } finally {
    running = false;
    state.syncing = false;
    emit();
  }
}

/** Turn a raw fetch/HTTP error into something a user can act on. */
function friendlyError(msg: string): string {
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network|ETIMEDOUT/i.test(msg))
    return 'Lost connection while syncing. It will resume automatically — or click to retry now.';
  if (msg.includes('401') || /auth/i.test(msg)) return 'Your session expired. Sign in again to continue syncing.';
  if (/50\d/.test(msg)) return 'The server had a problem. Sync paused — click to retry (it resumes where it stopped).';
  return `Sync interrupted (${msg}). Click to resume where it stopped.`;
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

/**
 * Re-download the ENTIRE cloud dataset from scratch ("Full resync" / "sync complete
 * database"). Resets only the pull cursor to 0 — every cloud row is re-fetched and
 * re-applied (upserts are idempotent, so this repairs any gaps from an interrupted
 * sync without duplicating anything). The upload cursor is left alone so local work
 * isn't re-sent.
 */
export async function fullResync(): Promise<SyncState> {
  if (!SYNC_ENABLED) return { ...state };
  const c = loadCursors();
  c.lastPullVersion = 0;
  saveCursors(c);
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
