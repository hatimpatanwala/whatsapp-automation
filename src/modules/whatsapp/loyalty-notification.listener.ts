import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderStatusChangedEvent } from '../events/domain-events';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { LoyaltyService } from '../promotions/loyalty.service';
import { SmartNotificationService } from './smart-notification.service';

/**
 * When an order is CONFIRMED, accrue it against the customer's cumulative
 * (loyalty) schemes. If a target is crossed, the customer earns a personal
 * coupon — we announce it over WhatsApp (window-aware) so they can use it next
 * time. Accrual is idempotent per (scheme, order), so re-delivery is safe.
 */
@Injectable()
export class LoyaltyNotificationListener {
  private readonly logger = new Logger(LoyaltyNotificationListener.name);

  // Statuses that count an order toward loyalty. 'confirmed' = admin accepted it.
  private static readonly ACCRUE_ON = new Set(['confirmed']);

  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly conn: TenantConnectionManager,
    private readonly smart: SmartNotificationService,
  ) {}

  @OnEvent('order.status_changed')
  async onOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    if (!LoyaltyNotificationListener.ACCRUE_ON.has(event.newStatus)) return;
    if (!event.customerId) return;

    try {
      const awards = await this.loyalty.accrueOrder(event.tenantSchema, event.orderId, event.customerId);
      if (!awards.length) return;

      const tenant = await this.conn.executeGlobal(async (qr) =>
        (await qr.query(`SELECT id FROM tenants WHERE schema_name = $1`, [event.tenantSchema]))[0]);
      const customer = await this.conn.executeInTenantContext(event.tenantSchema, async (qr) =>
        (await qr.query(`SELECT name, phone FROM customers WHERE id = $1`, [event.customerId]))[0]);
      if (!tenant?.id || !customer?.phone) return;

      for (const a of awards) {
        const detail =
          `🎉 ${customer.name ? customer.name + ', y' : 'Y'}ou earned a reward from *${a.schemeName}*!\n\n` +
          `Here's your coupon: *${a.couponCode}* — ${a.label}.\n` +
          `Apply it on your next order. Enjoy! 🛍️`;
        await this.smart.notify({
          tenantId: tenant.id,
          schema: event.tenantSchema,
          recipientPhone: customer.phone,
          recipientName: customer.name,
          audience: 'customer',
          channel: 'marketing',
          summary: `You earned ${a.label} (${a.couponCode})`,
          detail,
        }).catch((e) => this.logger.warn(`loyalty notify failed: ${e.message}`));
      }
      this.logger.log(`Granted ${awards.length} loyalty reward(s) for order ${event.orderId}`);
    } catch (err: any) {
      this.logger.error(`Loyalty accrual failed for order ${event.orderId}: ${err.message}`);
    }
  }
}
