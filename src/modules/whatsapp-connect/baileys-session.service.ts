import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';
import * as QRCode from 'qrcode';
import { REDIS_CLIENT } from '../../config/redis.module';
import { makeDbAuthState, StoredAuth } from './db-auth-store';

export type ConnState = 'idle' | 'connecting' | 'qr' | 'open' | 'closed' | 'logged_out';

interface Session {
  sock: any;
  state: ConnState;
  qrDataUrl?: string;
  phone?: string;
  error?: string;
  lastUsed: number;
  reconnects: number;
  openWaiters: Array<{ resolve: (sock: any) => void; reject: (e: Error) => void }>;
}

export interface StatusView {
  state: ConnState;
  qrDataUrl?: string;
  phone?: string;
  error?: string;
  linked: boolean;
}

/**
 * Vyapar-style "WhatsApp Smart Connect" — links a tenant's PERSONAL WhatsApp via
 * the linked-device (QR) mechanism using Baileys (pure WebSocket, no Chromium) and
 * sends invoices/receipts through it.
 *
 * Memory discipline for the 2GB box (an open socket is ~30-80MB):
 *   - LAZY CONNECT: sockets open only during linking or on-demand for a send.
 *   - IDLE-DISCONNECT: a cron closes sockets idle > 5 min (creds persist, so the
 *     next send silently re-opens — no re-scan).
 *   - LRU CAP: at most MAX_OPEN concurrent sockets; opening beyond that evicts the
 *     least-recently-used one.
 * Auth creds live encrypted in public.whatsapp_personal_sessions (one per tenant),
 * so sessions survive restarts. Baileys is UNOFFICIAL → the linked number carries
 * a WhatsApp ToS/ban risk (surfaced in the UI); sends are throttled + opt-in.
 */
@Injectable()
export class BaileysSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(BaileysSessionService.name);
  private readonly sessions = new Map<string, Session>();
  private baileys: any;
  private baileysTried = false;
  /** Concurrent-open socket cap (memory guard). Low default for the 512MB container. */
  private readonly maxOpen: number;
  private static readonly IDLE_MS = 5 * 60 * 1000;
  private static readonly OPEN_TIMEOUT_MS = 40_000;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    this.maxOpen = Math.max(1, Number(this.config.get<string>('WA_MAX_SESSIONS')) || 3);
  }

  private get secret(): string {
    return this.config.get<string>('WA_CONNECT_SECRET') || this.config.get<string>('SESSION_SECRET') || 'dev-secret';
  }

  enabled(): boolean {
    return this.config.get<string>('WA_SMART_CONNECT_ENABLED') !== 'false';
  }

  // ── Baileys dynamic load ─────────────────────────────────────────────────────
  // Baileys is ESM-only and this app builds to CommonJS, so a plain `import()` would
  // be downleveled to require() → ERR_REQUIRE_ESM. `new Function` keeps it a NATIVE
  // dynamic import that Node resolves as ESM at runtime. Absent/failed → feature off.
  private static readonly nativeImport: (s: string) => Promise<any> =
    new Function('s', 'return import(s)') as any;

  private async lib(): Promise<any | null> {
    if (this.baileysTried) return this.baileys || null;
    this.baileysTried = true;
    try {
      const mod: any = await BaileysSessionService.nativeImport('@whiskeysockets/baileys');
      this.baileys = mod?.makeWASocket || mod?.default?.makeWASocket ? (mod.makeWASocket ? mod : mod.default) : (mod?.default || mod);
      return this.baileys;
    } catch (e: any) {
      this.logger.warn(`Baileys not available — Smart Connect disabled: ${e?.message}`);
      return null;
    }
  }

  // ── DB auth persistence (public table) ───────────────────────────────────────
  private async loadAuth(tenantId: string): Promise<StoredAuth | null> {
    const rows = await this.ds.query(
      `SELECT creds_enc, keys_enc FROM public.whatsapp_personal_sessions WHERE tenant_id = $1`,
      [tenantId],
    );
    const r = rows?.[0];
    return r?.creds_enc && r?.keys_enc ? { creds: r.creds_enc, keys: r.keys_enc } : null;
  }

  private async saveAuth(tenantId: string, auth: StoredAuth) {
    await this.ds.query(
      `INSERT INTO public.whatsapp_personal_sessions (tenant_id, creds_enc, keys_enc, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET creds_enc = EXCLUDED.creds_enc, keys_enc = EXCLUDED.keys_enc, updated_at = NOW()`,
      [tenantId, auth.creds, auth.keys],
    );
  }

  private async setState(tenantId: string, state: ConnState, phone?: string, error?: string) {
    await this.ds.query(
      `INSERT INTO public.whatsapp_personal_sessions (tenant_id, state, phone, last_error, last_connected_at, updated_at)
       VALUES ($1,$2,$3,$4, CASE WHEN $2='open' THEN NOW() END, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         state = EXCLUDED.state,
         phone = COALESCE(EXCLUDED.phone, public.whatsapp_personal_sessions.phone),
         last_error = EXCLUDED.last_error,
         last_connected_at = COALESCE(EXCLUDED.last_connected_at, public.whatsapp_personal_sessions.last_connected_at),
         updated_at = NOW()`,
      [tenantId, state, phone || null, error || null],
    ).catch(() => undefined);
  }

  private async wipeAuth(tenantId: string) {
    await this.ds.query(
      `UPDATE public.whatsapp_personal_sessions SET creds_enc = NULL, keys_enc = NULL, state = 'logged_out', updated_at = NOW() WHERE tenant_id = $1`,
      [tenantId],
    ).catch(() => undefined);
  }

  async isLinked(tenantId: string): Promise<boolean> {
    const rows = await this.ds.query(
      `SELECT 1 FROM public.whatsapp_personal_sessions WHERE tenant_id = $1 AND creds_enc IS NOT NULL`,
      [tenantId],
    );
    return rows.length > 0;
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  /** Begin linking (or reconnecting). Returns immediately; poll status for the QR. */
  async start(tenantId: string): Promise<StatusView> {
    if (!this.enabled()) return { state: 'closed', linked: false, error: 'Smart Connect is disabled' };
    const lib = await this.lib();
    if (!lib) return { state: 'closed', linked: false, error: 'WhatsApp engine unavailable on this server' };
    const existing = this.sessions.get(tenantId);
    if (existing && (existing.state === 'open' || existing.state === 'qr' || existing.state === 'connecting')) {
      return this.viewFor(tenantId, existing);
    }
    void this.connect(tenantId).catch((e) => this.logger.warn(`connect ${tenantId}: ${e?.message}`));
    return { state: 'connecting', linked: await this.isLinked(tenantId) };
  }

  async status(tenantId: string): Promise<StatusView> {
    const s = this.sessions.get(tenantId);
    if (s) return this.viewFor(tenantId, s);
    // Not in memory (idle-disconnected or another node) — fall back to Redis/DB.
    const qr = await this.redis.get(`wa:qr:${tenantId}`).catch(() => null);
    const linked = await this.isLinked(tenantId);
    const rows = await this.ds.query(`SELECT state, phone FROM public.whatsapp_personal_sessions WHERE tenant_id = $1`, [tenantId]);
    const dbState = rows?.[0]?.state as ConnState | undefined;
    return {
      state: qr ? 'qr' : (linked ? 'open' : (dbState || 'idle')),
      qrDataUrl: qr || undefined,
      phone: rows?.[0]?.phone || undefined,
      linked,
    };
  }

  private viewFor(tenantId: string, s: Session): StatusView {
    return { state: s.state, qrDataUrl: s.qrDataUrl, phone: s.phone, error: s.error, linked: s.state === 'open' || !!s.phone };
  }

  /** Ensure an OPEN socket (silent re-link from stored creds) for sending. */
  async ensureOpen(tenantId: string): Promise<any> {
    const s = this.sessions.get(tenantId);
    if (s?.state === 'open' && s.sock) { s.lastUsed = Date.now(); return s.sock; }
    if (!(await this.isLinked(tenantId))) throw new Error('WhatsApp is not linked. Connect it first.');
    return new Promise((resolve, reject) => {
      const sess = this.sessions.get(tenantId);
      if (sess) sess.openWaiters.push({ resolve, reject });
      const timer = setTimeout(() => reject(new Error('WhatsApp connection timed out')), BaileysSessionService.OPEN_TIMEOUT_MS);
      const wrapResolve = (sock: any) => { clearTimeout(timer); resolve(sock); };
      this.connect(tenantId, wrapResolve).catch((e) => { clearTimeout(timer); reject(e); });
    });
  }

  async sendText(tenantId: string, phone: string, text: string) {
    const sock = await this.ensureOpen(tenantId);
    return sock.sendMessage(this.jid(phone), { text });
  }

  async sendDocument(tenantId: string, phone: string, buffer: Buffer, fileName: string, caption?: string) {
    const sock = await this.ensureOpen(tenantId);
    return sock.sendMessage(this.jid(phone), {
      document: buffer,
      mimetype: 'application/pdf',
      fileName,
      caption: caption || undefined,
    });
  }

  async disconnect(tenantId: string) {
    const s = this.sessions.get(tenantId);
    try { await s?.sock?.logout?.(); } catch { /* ignore */ }
    try { s?.sock?.end?.(undefined); } catch { /* ignore */ }
    this.sessions.delete(tenantId);
    await this.redis.del(`wa:qr:${tenantId}`).catch(() => undefined);
    await this.wipeAuth(tenantId);
    return { disconnected: true };
  }

  // ── Connection core ──────────────────────────────────────────────────────────
  private async connect(tenantId: string, onOpen?: (sock: any) => void): Promise<void> {
    const lib = await this.lib();
    if (!lib) throw new Error('WhatsApp engine unavailable');
    const makeWASocket = lib.default || lib.makeWASocket;
    const { DisconnectReason, Browsers } = lib;

    await this.evictIfNeeded();

    const stored = await this.loadAuth(tenantId);
    const { state, saveCreds } = makeDbAuthState(lib, stored, this.secret, (auth) => this.saveAuth(tenantId, auth));

    const silent: any = { level: 'silent', trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child() { return silent; } };
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: Browsers?.appropriate ? Browsers.appropriate('Chrome') : ['WA Commerce', 'Chrome', '1.0'],
      markOnlineOnConnect: false, // don't steal presence from the user's phone
      syncFullHistory: false,
      logger: silent,
    });

    const session: Session = this.sessions.get(tenantId) || { sock, state: 'connecting', lastUsed: Date.now(), reconnects: 0, openWaiters: [] };
    session.sock = sock;
    session.state = 'connecting';
    session.lastUsed = Date.now();
    if (onOpen) session.openWaiters.push({ resolve: onOpen, reject: () => undefined });
    this.sessions.set(tenantId, session);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u: any) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
          session.state = 'qr';
          session.qrDataUrl = dataUrl;
          await this.redis.set(`wa:qr:${tenantId}`, dataUrl, 'EX', 90).catch(() => undefined);
          await this.setState(tenantId, 'qr');
        } catch { /* ignore QR render errors */ }
      }
      if (connection === 'open') {
        session.state = 'open';
        session.reconnects = 0;
        session.qrDataUrl = undefined;
        session.phone = (sock.user?.id || '').split(':')[0].split('@')[0] || session.phone;
        session.error = undefined;
        await this.redis.del(`wa:qr:${tenantId}`).catch(() => undefined);
        await this.setState(tenantId, 'open', session.phone);
        // Resolve anyone waiting to send.
        const waiters = session.openWaiters.splice(0);
        for (const w of waiters) w.resolve(sock);
        this.logger.log(`WhatsApp linked/open for tenant ${tenantId} (${session.phone})`);
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason?.loggedOut;
        if (loggedOut) {
          session.state = 'logged_out';
          await this.wipeAuth(tenantId);
          await this.redis.del(`wa:qr:${tenantId}`).catch(() => undefined);
          this.rejectWaiters(session, new Error('WhatsApp was logged out — please re-link.'));
          this.sessions.delete(tenantId);
          this.logger.warn(`WhatsApp logged out for tenant ${tenantId} — creds wiped`);
        } else if (session.reconnects < 4) {
          session.reconnects++;
          session.state = 'connecting';
          const delay = Math.min(30_000, 2_000 * 2 ** session.reconnects);
          setTimeout(() => this.connect(tenantId).catch(() => undefined), delay);
        } else {
          session.state = 'closed';
          session.error = 'Connection lost';
          await this.setState(tenantId, 'closed', undefined, 'Connection lost');
          this.rejectWaiters(session, new Error('WhatsApp connection failed'));
          this.sessions.delete(tenantId);
        }
      }
    });
  }

  private rejectWaiters(session: Session, err: Error) {
    const waiters = session.openWaiters.splice(0);
    for (const w of waiters) w.reject(err);
  }

  private jid(phone: string): string {
    const digits = String(phone || '').replace(/[^\d]/g, '');
    return `${digits}@s.whatsapp.net`;
  }

  /** LRU eviction to keep concurrent OPEN sockets ≤ MAX_OPEN (memory guard). */
  private async evictIfNeeded() {
    const open = [...this.sessions.entries()].filter(([, s]) => s.state === 'open' || s.state === 'connecting');
    if (open.length < this.maxOpen) return;
    open.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const [victimId, victim] = open[0];
    try { victim.sock?.end?.(undefined); } catch { /* ignore */ }
    this.sessions.delete(victimId);
    this.logger.log(`LRU-evicted idle WhatsApp socket for tenant ${victimId}`);
  }

  /** Close sockets idle beyond IDLE_MS — creds persist so a send silently re-opens. */
  @Cron(CronExpression.EVERY_MINUTE)
  reapIdle() {
    const now = Date.now();
    for (const [tenantId, s] of this.sessions) {
      if (s.state === 'qr' || s.state === 'connecting') continue; // linking in progress
      if (now - s.lastUsed > BaileysSessionService.IDLE_MS) {
        try { s.sock?.end?.(undefined); } catch { /* ignore */ }
        this.sessions.delete(tenantId);
      }
    }
  }

  async onModuleDestroy() {
    for (const [, s] of this.sessions) {
      try { s.sock?.end?.(undefined); } catch { /* ignore */ }
    }
    this.sessions.clear();
  }
}
