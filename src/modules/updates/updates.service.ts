import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.module';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { BuilderService } from '../builder/builder.service';

export type UpdateAudience = 'customer' | 'admin';

export interface RecordUpdate {
  schema: string;
  audience: UpdateAudience;
  recipientPhone: string;
  customerId?: string | null;
  type: string;          // order | invoice | payment | quote | reminder | marketing | delivery | update
  title: string;
  body?: string;
  link?: string;         // deep link to the specific item (optional)
  icon?: string;
}

/** Emoji per update type — used when a caller doesn't supply one. */
const TYPE_ICON: Record<string, string> = {
  order: '📦', invoice: '🧾', payment: '💰', reminder: '⏰', quote: '📝',
  marketing: '🎁', delivery: '🚚', update: '🔔',
  customer: '👤', low_stock: '📉', purchase: '🛒', // admin feed types
};

/**
 * "My Updates" inbox — the durable store behind the single-ping WhatsApp model.
 * Every customer/admin notification is recorded here; the WhatsApp message is just a
 * one-time "you have updates — tap to view" ping into the webview. This keeps paid
 * messages to one per unviewed episode while all detail lives (free) in the webview.
 */
@Injectable()
export class UpdatesService {
  private readonly logger = new Logger(UpdatesService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly cm: TenantConnectionManager,
    private readonly builder: BuilderService,
  ) {}

  private pingKey(schema: string, phone: string) {
    return `notif:ping:${schema}:${phone}`;
  }

  /**
   * Record one CUSTOMER update into their inbox. Admin updates are owned by
   * AdminFeedService (the portal bell → admin_notifications), so we don't re-insert
   * them here (that would double-write); admin pings just read that table.
   */
  async record(u: RecordUpdate): Promise<void> {
    if (u.audience === 'admin') return;
    const icon = u.icon || TYPE_ICON[u.type] || '🔔';
    try {
      await this.cm.executeInTenantContext(u.schema, (qr) =>
        qr.query(
          `INSERT INTO "${u.schema}".customer_updates (customer_id, recipient_phone, type, title, body, link, icon)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [u.customerId || null, u.recipientPhone, u.type, u.title.slice(0, 200), u.body || null, u.link || null, icon],
        ),
      );
    } catch (e: any) {
      this.logger.warn(`record update failed (${u.type}) for ${u.recipientPhone}: ${e?.message}`);
    }
  }

  /**
   * Should we send a WhatsApp ping now? True only if none is outstanding for this
   * recipient (atomic NX). Resets when they open the inbox or message us — so the
   * next fresh episode pings again, but a burst of updates only pings once.
   */
  async shouldPing(schema: string, phone: string): Promise<boolean> {
    const r = await this.redis.set(this.pingKey(schema, phone), '1', 'EX', 7 * 24 * 3600, 'NX');
    return r === 'OK';
  }
  async resetPing(schema: string, phone: string): Promise<void> {
    await this.redis.del(this.pingKey(schema, phone)).catch(() => undefined);
  }

  /** Count unseen CUSTOMER updates (for the ping text + webview badge). */
  async unseenCount(schema: string, phone: string, customerId?: string | null): Promise<number> {
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT COUNT(*)::int AS n FROM "${schema}".customer_updates
         WHERE is_seen = false AND (recipient_phone = $1 OR ($2::uuid IS NOT NULL AND customer_id = $2))`,
        [phone, customerId || null],
      ),
    ).catch(() => [{ n: 0 }]);
    return rows?.[0]?.n || 0;
  }

  /** Count unseen ADMIN updates (admin_notifications is tenant-global — one admin). */
  async unseenCountAdmin(schema: string): Promise<number> {
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT COUNT(*)::int AS n FROM "${schema}".admin_notifications WHERE is_seen = false`),
    ).catch(() => [{ n: 0 }]);
    return rows?.[0]?.n || 0;
  }

  /** Mint (or reuse) the customer's My-Updates webview link. */
  async webviewLink(tenantId: string, schema: string, phone: string, customerId?: string | null, name?: string): Promise<string> {
    const { url } = await this.builder.createUpdatesSession({
      tenantId, schemaName: schema, customerId: customerId || null, customerPhone: phone, customerName: name || null,
    });
    return url;
  }

  /** Mint the admin's My-Updates webview link. */
  async adminWebviewLink(tenantId: string, schema: string, adminPhone?: string): Promise<string> {
    const { url } = await this.builder.createAdminUpdatesSession({ tenantId, schemaName: schema, adminPhone: adminPhone || null });
    return url;
  }

  // ── Webview API (token-authenticated; customer OR admin session) ──────────────
  private async resolve(token: string) {
    const s = await this.builder.resolveUpdatesSessionAny(token).catch(() => null);
    if (!s) throw new UnauthorizedException('This link has expired. Please ask for a fresh one.');
    return s;
  }

  /** List the recipient's updates (opening the inbox marks them SEEN + resets the ping). */
  async listForToken(token: string) {
    const s = await this.resolve(token);
    const schema = s.schema_name;
    const isAdmin = s.mode === 'admin-upd';

    if (isAdmin) {
      const rows = await this.cm.executeInTenantContext(schema, (qr) =>
        qr.query(
          `SELECT id, type, title, body, route AS link, is_read, is_seen, created_at
           FROM "${schema}".admin_notifications ORDER BY created_at DESC LIMIT 300`,
        ),
      );
      await this.cm.executeInTenantContext(schema, (qr) =>
        qr.query(`UPDATE "${schema}".admin_notifications SET is_seen = true WHERE is_seen = false`),
      ).catch(() => undefined);
      await this.resetPing(schema, s.customer_phone || 'admin');
      return {
        audience: 'admin',
        name: 'Admin',
        updates: rows.map((r: any) => ({
          id: r.id, type: r.type, title: r.title, body: r.body, link: r.link,
          icon: TYPE_ICON[r.type] || '🔔', isRead: r.is_read, createdAt: r.created_at,
        })),
      };
    }

    const phone = s.customer_phone;
    const customerId = s.customer_id;
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT id, type, title, body, link, icon, is_read, is_seen, created_at
         FROM "${schema}".customer_updates
         WHERE recipient_phone = $1 OR ($2::uuid IS NOT NULL AND customer_id = $2)
         ORDER BY created_at DESC LIMIT 300`,
        [phone, customerId || null],
      ),
    );
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `UPDATE "${schema}".customer_updates SET is_seen = true
         WHERE is_seen = false AND (recipient_phone = $1 OR ($2::uuid IS NOT NULL AND customer_id = $2))`,
        [phone, customerId || null],
      ),
    ).catch(() => undefined);
    await this.resetPing(schema, phone);
    return {
      audience: 'customer',
      name: s.customer_name || null,
      updates: rows.map((r: any) => ({
        id: r.id, type: r.type, title: r.title, body: r.body, link: r.link,
        icon: r.icon || TYPE_ICON[r.type] || '🔔', isRead: r.is_read, createdAt: r.created_at,
      })),
    };
  }

  /** Mark one update read (clicked). */
  async markRead(token: string, id: string) {
    const s = await this.resolve(token);
    if (s.mode === 'admin-upd') {
      // admin_notifications has no read_at column.
      await this.cm.executeInTenantContext(s.schema_name, (qr) =>
        qr.query(`UPDATE "${s.schema_name}".admin_notifications SET is_read = true WHERE id = $1`, [id]),
      );
      return { ok: true };
    }
    await this.cm.executeInTenantContext(s.schema_name, (qr) =>
      qr.query(
        `UPDATE "${s.schema_name}".customer_updates SET is_read = true, read_at = NOW()
         WHERE id = $1 AND (recipient_phone = $2 OR customer_id = $3)`,
        [id, s.customer_phone, s.customer_id || null],
      ),
    );
    return { ok: true };
  }

  /** Mark all read. */
  async markAllRead(token: string) {
    const s = await this.resolve(token);
    if (s.mode === 'admin-upd') {
      await this.cm.executeInTenantContext(s.schema_name, (qr) =>
        qr.query(`UPDATE "${s.schema_name}".admin_notifications SET is_read = true WHERE is_read = false`),
      );
      return { ok: true };
    }
    await this.cm.executeInTenantContext(s.schema_name, (qr) =>
      qr.query(
        `UPDATE "${s.schema_name}".customer_updates SET is_read = true, read_at = NOW()
         WHERE is_read = false AND (recipient_phone = $1 OR ($2::uuid IS NOT NULL AND customer_id = $2))`,
        [s.customer_phone, s.customer_id || null],
      ),
    );
    return { ok: true };
  }
}
