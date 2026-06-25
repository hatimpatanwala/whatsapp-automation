import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.module';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { SmartNotificationService } from '../whatsapp/smart-notification.service';

/**
 * Abandoned-cart reminders, delivered cost-efficiently.
 *
 * A cart counts as abandoned when it still has items and nothing was added for
 * `commerce_abandoned_cart_hours` (default 3h, per-tenant configurable). Reminders
 * are sent ONLY inside an open service window (free-form, free) — never as a
 * paid template. If the window is closed the reminder is held and delivered the
 * next time the customer messages. Each abandonment episode is reminded once.
 */
@Injectable()
export class AbandonedCartService {
  private readonly logger = new Logger(AbandonedCartService.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    @Optional() private readonly smartNotification: SmartNotificationService,
  ) {}

  // Every 30 minutes — frequent enough to catch a service window before it closes.
  @Cron('0 */30 * * * *')
  async scanAll(): Promise<void> {
    if (!this.smartNotification) return;
    let tenants: any[] = [];
    try {
      tenants = await this.connectionManager.executeGlobal((qr) =>
        qr.query(`SELECT id, schema_name FROM tenants WHERE status = 'active'`));
    } catch (err: any) {
      this.logger.warn(`abandoned-cart scan: tenant list failed: ${err.message}`);
      return;
    }
    for (const t of tenants) {
      try { await this.scanTenant(t.id, t.schema_name); }
      catch (err: any) { this.logger.warn(`abandoned-cart scan failed for ${t.schema_name}: ${err.message}`); }
    }
  }

  private async scanTenant(tenantId: string, schema: string): Promise<void> {
    const hours = await this.getThresholdHours(schema);
    if (hours <= 0) return; // disabled for this tenant

    const carts = await this.connectionManager.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT c.id AS cart_id, cust.phone, cust.name,
                COUNT(ci.id)::int AS item_count,
                COALESCE(SUM(ci.quantity * ci.unit_price), 0) AS cart_total,
                EXTRACT(EPOCH FROM MAX(ci.created_at))::bigint AS last_epoch
         FROM carts c
         JOIN cart_items ci ON ci.cart_id = c.id
         JOIN customers cust ON cust.id = c.customer_id
         WHERE c.status = 'active' AND cust.phone IS NOT NULL
         GROUP BY c.id, cust.phone, cust.name
         HAVING MAX(ci.created_at) < NOW() - make_interval(hours => $1)
         LIMIT 200`,
        [hours],
      ));

    for (const cart of carts) {
      // One reminder per abandonment episode: the key includes the last-activity
      // timestamp, so adding more items later (which moves last_activity forward)
      // allows a fresh reminder if it's abandoned again.
      const key = `cart:reminded:${schema}:${cart.cart_id}:${cart.last_epoch}`;
      const reserved = await this.redis.set(key, '1', 'EX', 7 * 24 * 3600, 'NX');
      if (!reserved) continue;

      const phone = String(cart.phone).replace(/^\+/, '');
      const name = cart.name || 'there';
      const total = Number(cart.cart_total || 0).toFixed(0);
      const detail = `🛒 Hi ${name}, you still have ${cart.item_count} item(s) worth ₹${total} in your cart. Reply *menu* to pick up where you left off before they sell out!`;

      await this.smartNotification.notify({
        tenantId, schema, recipientPhone: phone, audience: 'customer', channel: 'marketing',
        windowOnly: true, recipientName: name,
        summary: `🛒 ${cart.item_count} item(s) left in your cart`,
        detail,
      }).catch(() => undefined);
    }
  }

  private async getThresholdHours(schema: string): Promise<number> {
    try {
      const rows = await this.connectionManager.executeInTenantContext(schema, (qr) =>
        qr.query(`SELECT value FROM settings WHERE key = 'commerce_abandoned_cart_hours'`));
      if (rows[0]?.value !== undefined) {
        const n = parseInt(typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value, 10);
        if (!Number.isNaN(n)) return n;
      }
    } catch { /* fall through to default */ }
    return this.config.get<number>('ABANDONED_CART_HOURS', 3);
  }
}
