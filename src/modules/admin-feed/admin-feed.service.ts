import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

/** In-app admin notification feed (portal bell) — one row per notable event. */
@Injectable()
export class AdminFeedService {
  constructor(private readonly cm: TenantConnectionManager) {}

  /** Best-effort create — never throws (must not break the event that triggered it). */
  async create(
    schema: string,
    n: { type: string; title: string; body?: string; route?: string; entityId?: string },
  ): Promise<void> {
    await this.cm
      .executeInTenantContext(schema, (qr) =>
        qr.query(
          `INSERT INTO admin_notifications (type, title, body, route, entity_id) VALUES ($1,$2,$3,$4,$5)`,
          [n.type, (n.title || '').slice(0, 200), n.body ?? null, n.route ?? null, n.entityId ?? null],
        ),
      )
      .catch(() => undefined);
  }

  async list(schema: string, limit = 30): Promise<{ items: any[]; unread: number }> {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const items = await qr.query(
        `SELECT id, type, title, body, route, entity_id, is_read, created_at
           FROM admin_notifications ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      const unread = Number((await qr.query(`SELECT COUNT(*)::int AS n FROM admin_notifications WHERE is_read = false`))[0]?.n || 0);
      return { items, unread };
    });
  }

  async markRead(schema: string, id?: string): Promise<{ ok: true }> {
    await this.cm.executeInTenantContext(schema, (qr) =>
      id
        ? qr.query(`UPDATE admin_notifications SET is_read = true WHERE id = $1`, [id])
        : qr.query(`UPDATE admin_notifications SET is_read = true WHERE is_read = false`),
    );
    return { ok: true };
  }
}
