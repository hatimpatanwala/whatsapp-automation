import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AdminFeedService } from './admin-feed.service';
import { SmartNotificationService } from '../whatsapp/smart-notification.service';
import { OrderAssignedEvent } from '../events/domain-events';

/**
 * When an order is assigned to an employee, ping that employee on WhatsApp to
 * start preparing it, and drop an in-app note in the admin feed.
 *
 * The employee ping is `windowOnly` — it's delivered free-form inside their open
 * service window (opened when they last messaged the bot, e.g. during OTP
 * verification) and otherwise held until they message again. No template is sent.
 */
@Injectable()
export class OrderAssignmentListener {
  private readonly logger = new Logger(OrderAssignmentListener.name);

  constructor(
    private readonly feed: AdminFeedService,
    @InjectDataSource() private readonly ds: DataSource,
    @Optional() private readonly smart?: SmartNotificationService,
  ) {}

  @OnEvent('order.assigned')
  async onAssigned(e: OrderAssignedEvent): Promise<void> {
    // In-app feed entry for the admin.
    try {
      await this.feed.create(e.tenantSchema, {
        type: 'order_assigned',
        title: `Order #${e.orderNumber} assigned`,
        body: `Assigned to ${e.employeeName}`,
        route: `/orders/${e.orderId}`,
        entityId: e.orderId,
      });
    } catch (err: any) {
      this.logger.debug(`assignment feed entry failed: ${err?.message}`);
    }

    // WhatsApp the employee to start preparing.
    if (!this.smart || !e.employeePhone) return;
    try {
      const tid = (await this.ds.query(`SELECT id FROM public.tenants WHERE schema_name = $1`, [e.tenantSchema]))[0]?.id;
      if (!tid) return;
      await this.smart.notify({
        tenantId: tid,
        schema: e.tenantSchema,
        recipientPhone: e.employeePhone,
        audience: 'admin',
        channel: 'utility',
        windowOnly: true,
        summary: `Order #${e.orderNumber} assigned to you`,
        detail: `📦 *Order #${e.orderNumber}* has been assigned to you.\nPlease start preparing it — tap *View order* for the details.`,
        recipientName: e.employeeName,
        buttons: [{ id: `sorder_${e.orderId}`, title: '👁️ View order' }],
      });
    } catch (err: any) {
      this.logger.debug(`assignment employee ping failed: ${err?.message}`);
    }
  }
}
