import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { MetaTokenService } from '../waba/meta-token.service';
import { MessageOrchestratorService } from '../whatsapp/message-orchestrator.service';
import { WhatsAppApiService } from '../whatsapp/whatsapp-api.service';

export interface AdminNotificationResult {
  sent: boolean;
  usedTemplate: boolean;
  messageId?: string;
  reason?: string;
}

/**
 * Sends notifications to the admin's personal WhatsApp number.
 *
 * Smart sending strategy:
 * - If admin has messaged within 24h (service window open) → sends free-form text/buttons/lists (FREE)
 * - If admin hasn't messaged recently (no service window) → sends approved template (PAID, ~₹0.30)
 *
 * Since admins typically interact daily (confirming orders, checking stock), the service window
 * will be open most of the time, making most admin notifications FREE.
 */
@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(WabaAccount)
    private readonly wabaAccountRepo: Repository<WabaAccount>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumberRepo: Repository<PhoneNumber>,
    private readonly metaTokenService: MetaTokenService,
    private readonly orchestrator: MessageOrchestratorService,
    private readonly whatsappApi: WhatsAppApiService,
  ) {}

  /**
   * Send a new order notification to the admin.
   */
  async notifyNewOrder(
    tenantId: string,
    order: { id: string; customerName: string; total: string; itemSummary: string },
  ): Promise<AdminNotificationResult> {
    const freeFormText = `🛒 *New Order!*\n\nOrder #${order.id}\nCustomer: ${order.customerName}\nTotal: ${order.total}\nItems: ${order.itemSummary}\n\nReply *CONFIRM* to confirm or *VIEW* for details.`;

    const buttons = [
      { id: 'confirm_order', title: 'Confirm' },
      { id: 'view_order', title: 'View Details' },
    ];

    const templateFallback = {
      name: 'admin_new_order',
      language: 'en',
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: order.id },
          { type: 'text', text: order.customerName },
          { type: 'text', text: order.total },
          { type: 'text', text: order.itemSummary },
        ],
      }],
    };

    return this.sendSmartAdmin(tenantId, freeFormText, buttons, templateFallback);
  }

  /**
   * Send a payment received notification to the admin.
   */
  async notifyPaymentReceived(
    tenantId: string,
    payment: { customerName: string; amount: string; orderId: string; method: string },
  ): Promise<AdminNotificationResult> {
    const freeFormText = `💰 *Payment Received!*\n\n${payment.customerName} paid ${payment.amount}\nOrder: #${payment.orderId}\nVia: ${payment.method}\n\nReply *VERIFY* to verify or *REJECT* if suspicious.`;

    const buttons = [
      { id: 'verify_payment', title: 'Verify' },
      { id: 'reject_payment', title: 'Reject' },
    ];

    const templateFallback = {
      name: 'admin_payment_received',
      language: 'en',
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: payment.customerName },
          { type: 'text', text: payment.amount },
          { type: 'text', text: payment.orderId },
          { type: 'text', text: payment.method },
        ],
      }],
    };

    return this.sendSmartAdmin(tenantId, freeFormText, buttons, templateFallback);
  }

  /**
   * Send a low stock alert to the admin.
   */
  async notifyLowStock(
    tenantId: string,
    product: { name: string; currentQty: number; threshold: number },
  ): Promise<AdminNotificationResult> {
    const freeFormText = `⚠️ *Low Stock Alert!*\n\n${product.name}\nRemaining: ${product.currentQty} units\nThreshold: ${product.threshold}\n\nReply *RESTOCK* to update inventory.`;

    const buttons = [
      { id: 'restock_product', title: 'Restock' },
    ];

    const templateFallback = {
      name: 'admin_low_stock',
      language: 'en',
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: product.name },
          { type: 'text', text: String(product.currentQty) },
          { type: 'text', text: String(product.threshold) },
        ],
      }],
    };

    return this.sendSmartAdmin(tenantId, freeFormText, buttons, templateFallback);
  }

  /**
   * Send a new customer notification to the admin.
   */
  async notifyNewCustomer(
    tenantId: string,
    customer: { name: string; phone: string; totalCustomers: number },
  ): Promise<AdminNotificationResult> {
    const freeFormText = `👤 *New Customer!*\n\n${customer.name} (${customer.phone}) just opted in.\nTotal customers: ${customer.totalCustomers}`;

    const templateFallback = {
      name: 'admin_new_customer',
      language: 'en',
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: customer.name },
          { type: 'text', text: customer.phone },
          { type: 'text', text: String(customer.totalCustomers) },
        ],
      }],
    };

    return this.sendSmartAdmin(tenantId, freeFormText, null, templateFallback);
  }

  /**
   * Send daily summary to admin.
   */
  async notifyDailySummary(
    tenantId: string,
    summary: { date: string; orders: number; revenue: string; newCustomers: number; messages: number },
  ): Promise<AdminNotificationResult> {
    const freeFormText = `📊 *Daily Summary — ${summary.date}*\n\n• Orders: ${summary.orders}\n• Revenue: ${summary.revenue}\n• New Customers: ${summary.newCustomers}\n• Messages: ${summary.messages}\n\nReply *DETAILS* for full report.`;

    const buttons = [
      { id: 'daily_details', title: 'Details' },
    ];

    const templateFallback = {
      name: 'admin_daily_summary',
      language: 'en',
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: summary.date },
          { type: 'text', text: String(summary.orders) },
          { type: 'text', text: summary.revenue },
          { type: 'text', text: String(summary.newCustomers) },
          { type: 'text', text: String(summary.messages) },
        ],
      }],
    };

    return this.sendSmartAdmin(tenantId, freeFormText, buttons, templateFallback);
  }

  /**
   * Send a generic admin notification with custom text.
   */
  async sendCustomNotification(
    tenantId: string,
    text: string,
    buttons?: Array<{ id: string; title: string }>,
  ): Promise<AdminNotificationResult> {
    // For custom notifications without a template, we can only send if within 24h window
    // Outside the window, this will fail silently (no template to fall back to)
    const ctx = await this.getAdminSendContext(tenantId);
    if (!ctx) return { sent: false, usedTemplate: false, reason: 'Admin WhatsApp not configured' };

    const hasWindow = await this.orchestrator.hasActiveServiceWindow(tenantId, ctx.adminPhone);

    if (!hasWindow) {
      this.logger.debug(`[AdminNotify] Skipping custom notification for tenant ${tenantId} — no 24h window and no template`);
      return { sent: false, usedTemplate: false, reason: 'Admin not within 24h window. Custom messages require admin to message first.' };
    }

    if (buttons && buttons.length > 0) {
      const result = await this.orchestrator.sendButtons(
        tenantId, ctx.phoneNumberId, ctx.accessToken, ctx.adminPhone,
        text, buttons, undefined, undefined, 'service',
      );
      return { sent: result.success, usedTemplate: false, messageId: result.messageId };
    }

    const result = await this.orchestrator.sendText(
      tenantId, ctx.phoneNumberId, ctx.accessToken, ctx.adminPhone, text, 'service',
    );
    return { sent: result.success, usedTemplate: false, messageId: result.messageId };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Smart admin send: uses free-form (with buttons) if within 24h window,
   * otherwise falls back to template.
   */
  private async sendSmartAdmin(
    tenantId: string,
    freeFormText: string,
    buttons: Array<{ id: string; title: string }> | null,
    templateFallback: { name: string; language: string; components?: any[] },
  ): Promise<AdminNotificationResult> {
    const ctx = await this.getAdminSendContext(tenantId);
    if (!ctx) {
      return { sent: false, usedTemplate: false, reason: 'Admin WhatsApp not configured or not verified' };
    }

    // Check if admin has an active service window (messaged within 24h)
    const hasWindow = await this.orchestrator.hasActiveServiceWindow(tenantId, ctx.adminPhone);

    if (hasWindow) {
      // FREE path: send interactive buttons or plain text
      this.logger.debug(`[AdminNotify] Sending free-form to admin (within 24h window) for tenant ${tenantId}`);

      if (buttons && buttons.length > 0) {
        const result = await this.orchestrator.sendButtons(
          tenantId, ctx.phoneNumberId, ctx.accessToken, ctx.adminPhone,
          freeFormText, buttons, undefined, undefined, 'service',
        );
        return { sent: result.success, usedTemplate: false, messageId: result.messageId };
      }

      const result = await this.orchestrator.sendText(
        tenantId, ctx.phoneNumberId, ctx.accessToken, ctx.adminPhone, freeFormText, 'service',
      );
      return { sent: result.success, usedTemplate: false, messageId: result.messageId };
    } else {
      // PAID path: send template (required outside 24h window)
      this.logger.debug(`[AdminNotify] Sending template "${templateFallback.name}" to admin (outside 24h window) for tenant ${tenantId}`);

      const result = await this.orchestrator.sendTemplate(
        tenantId, ctx.phoneNumberId, ctx.accessToken, ctx.adminPhone,
        templateFallback.name, templateFallback.language, templateFallback.components, 'utility',
      );
      return { sent: result.success, usedTemplate: true, messageId: result.messageId };
    }
  }

  /**
   * Get the context needed to send messages to the admin's personal number.
   */
  private async getAdminSendContext(tenantId: string): Promise<{
    adminPhone: string;
    phoneNumberId: string;
    accessToken: string;
  } | null> {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      select: ['id', 'adminWhatsappNumber', 'adminWhatsappVerified'],
    });

    if (!tenant?.adminWhatsappNumber || !tenant.adminWhatsappVerified) {
      return null;
    }

    // Get platform WABA and sender phone
    const platformWaba = await this.wabaAccountRepo.findOne({
      where: { status: 'active' },
      order: { createdAt: 'ASC' },
    });
    if (!platformWaba) return null;

    const accessToken = await this.metaTokenService.getActiveToken(platformWaba.id);
    if (!accessToken) return null;

    const senderPhone = await this.phoneNumberRepo.findOne({
      where: { wabaAccountId: platformWaba.id, status: 'active' },
      order: { createdAt: 'ASC' },
    });
    if (!senderPhone?.phoneNumberId) return null;

    // Strip + from admin number (Meta expects without +)
    const adminPhone = tenant.adminWhatsappNumber.replace(/^\+/, '');

    return {
      adminPhone,
      phoneNumberId: senderPhone.phoneNumberId,
      accessToken,
    };
  }
}
