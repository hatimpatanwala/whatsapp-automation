import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { AdminFeedService } from './admin-feed.service';
import { AdminNotificationService } from '../onboarding/admin-notification.service';
import {
  OrderCreatedEvent,
  QuoteCreatedEvent,
  CustomerCreatedEvent,
  PaymentVerifiedEvent,
  InvoiceCreatedEvent,
} from '../events/domain-events';

/**
 * Turns domain events into admin notifications — an in-app feed entry (portal bell)
 * plus a WhatsApp ping to the admin's number (when configured). Every handler is
 * best-effort and swallows its own errors so it can never break the source flow.
 */
@Injectable()
export class AdminFeedListener {
  private readonly logger = new Logger(AdminFeedListener.name);

  constructor(
    private readonly feed: AdminFeedService,
    private readonly cm: TenantConnectionManager,
    @InjectDataSource() private readonly ds: DataSource,
    @Optional() private readonly adminWa?: AdminNotificationService,
  ) {}

  private async who(schema: string, customerId: string): Promise<{ name: string; phone: string }> {
    try {
      const c = (await this.cm.executeInTenantContext(schema, (qr) => qr.query(`SELECT name, phone FROM customers WHERE id = $1`, [customerId])))[0];
      return { name: c?.name || c?.phone || 'Customer', phone: c?.phone || '' };
    } catch {
      return { name: 'Customer', phone: '' };
    }
  }

  private async tenantId(schema: string): Promise<string | null> {
    try {
      return (await this.ds.query(`SELECT id FROM public.tenants WHERE schema_name = $1`, [schema]))[0]?.id || null;
    } catch {
      return null;
    }
  }

  /** Fire a WhatsApp admin notification (no-op if the admin number isn't configured). */
  private async wa(schema: string, fn: (svc: AdminNotificationService, tenantId: string) => Promise<any>): Promise<void> {
    if (!this.adminWa) return;
    const tid = await this.tenantId(schema);
    if (!tid) return;
    try {
      await fn(this.adminWa, tid);
    } catch (e: any) {
      this.logger.debug(`admin WhatsApp notify failed: ${e?.message}`);
    }
  }

  @OnEvent('order.created')
  async onOrder(e: OrderCreatedEvent): Promise<void> {
    const w = await this.who(e.tenantSchema, e.customerId);
    const num = e.orderNumber ? `#${e.orderNumber}` : '';
    await this.feed.create(e.tenantSchema, { type: 'order', title: `New order ${num}`.trim(), body: `${w.name} · ₹${e.total}`, route: `/orders/${e.orderId}`, entityId: e.orderId });
    await this.wa(e.tenantSchema, (svc, tid) => svc.notifyNewOrder(tid, { id: e.orderId, orderNumber: e.orderNumber, customerName: w.name, total: `₹${e.total}`, itemSummary: '' }));
  }

  @OnEvent('quote.created')
  async onQuote(e: QuoteCreatedEvent): Promise<void> {
    const w = await this.who(e.tenantSchema, e.customerId);
    const num = e.quoteNumber ? `#${e.quoteNumber}` : '';
    await this.feed.create(e.tenantSchema, { type: 'quote', title: `New quote ${num}`.trim(), body: `${w.name} · ₹${e.totalAmount}`, route: `/quotes/${e.quoteId}`, entityId: e.quoteId });
    // "Review quote" routes to the quote card (view + edit link + set status to
    // "Sent" → the customer gets it → accepts → auto-converts to an order).
    await this.wa(e.tenantSchema, (svc, tid) =>
      svc.sendCustomNotification(tid, `📄 *New Quote ${num}*\n${w.name} · ₹${e.totalAmount}\n\nTap *Review* to view/edit (add discounts, change items) or *Accept* to approve — accepting converts it into an order.`,
        [
          { id: `quote_${e.quoteId}`, title: '📄 Review' },
          { id: `qstatus_${e.quoteId}_accepted`, title: '✅ Accept' },
        ]));
  }

  @OnEvent('customer.created')
  async onCustomer(e: CustomerCreatedEvent): Promise<void> {
    const w = await this.who(e.tenantSchema, e.customerId);
    await this.feed.create(e.tenantSchema, { type: 'customer', title: 'New customer', body: `${w.name}${w.phone ? ' · ' + w.phone : ''}`, route: `/customers/${e.customerId}`, entityId: e.customerId });
    await this.wa(e.tenantSchema, (svc, tid) => svc.notifyNewCustomer(tid, { name: w.name, phone: w.phone, totalCustomers: 0 }));
  }

  @OnEvent('payment.verified')
  async onPayment(e: PaymentVerifiedEvent): Promise<void> {
    await this.feed.create(e.tenantSchema, { type: 'payment', title: 'Payment received', body: '', route: '/payments', entityId: (e as any).orderId });
  }

  @OnEvent('invoice.created')
  async onInvoice(e: InvoiceCreatedEvent): Promise<void> {
    await this.feed.create(e.tenantSchema, { type: 'invoice', title: 'Invoice created', body: '', route: '/invoices', entityId: (e as any).invoiceId });
  }
}
