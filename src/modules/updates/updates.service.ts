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

  /** Record one update into the recipient's inbox (customer or admin feed). */
  async record(u: RecordUpdate): Promise<void> {
    const icon = u.icon || TYPE_ICON[u.type] || '🔔';
    try {
      if (u.audience === 'admin') {
        await this.cm.executeInTenantContext(u.schema, (qr) =>
          qr.query(
            `INSERT INTO "${u.schema}".admin_notifications (type, title, body, route) VALUES ($1,$2,$3,$4)`,
            [u.type, u.title.slice(0, 200), u.body || null, u.link || null],
          ),
        );
      } else {
        await this.cm.executeInTenantContext(u.schema, (qr) =>
          qr.query(
            `INSERT INTO "${u.schema}".customer_updates (customer_id, recipient_phone, type, title, body, link, icon)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [u.customerId || null, u.recipientPhone, u.type, u.title.slice(0, 200), u.body || null, u.link || null, icon],
          ),
        );
      }
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

  /** Count unseen updates (for the ping text + webview badge). */
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

  /** Mint (or reuse) the customer's My-Updates webview link. */
  async webviewLink(tenantId: string, schema: string, phone: string, customerId?: string | null, name?: string): Promise<string> {
    const { url } = await this.builder.createUpdatesSession({
      tenantId, schemaName: schema, customerId: customerId || null, customerPhone: phone, customerName: name || null,
    });
    return url;
  }

  // ── Webview API (token-authenticated) ────────────────────────────────────────
  private async resolve(token: string) {
    const s = await this.builder.resolveUpdatesSession(token).catch(() => null);
    if (!s) throw new UnauthorizedException('This link has expired. Please ask for a fresh one.');
    return s;
  }

  /** List the customer's updates (opening the inbox marks them SEEN + resets the ping). */
  async listForCustomer(token: string) {
    const s = await this.resolve(token);
    const schema = s.schema_name;
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
    // Opening the inbox = seen; and stop the outstanding ping so the next episode pings again.
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `UPDATE "${schema}".customer_updates SET is_seen = true
         WHERE is_seen = false AND (recipient_phone = $1 OR ($2::uuid IS NOT NULL AND customer_id = $2))`,
        [phone, customerId || null],
      ),
    ).catch(() => undefined);
    await this.resetPing(schema, phone);
    return {
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
