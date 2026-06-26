import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../whatsapp-message.service';
import { CommerceSettingsHelper } from '../helpers/commerce-settings.helper';
import { WhatsAppApiService } from '../whatsapp-api.service';
import { BuilderService } from '../../builder/builder.service';

export interface MessageContext {
  schema: string;
  tenant: any;
  from: string;
  messageId: string;
  contactName?: string;
}

@Injectable()
export class TextMessageHandler {
  private readonly logger = new Logger(TextMessageHandler.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly messageService: WhatsAppMessageService,
    private readonly commerceSettings: CommerceSettingsHelper,
    private readonly whatsappApi: WhatsAppApiService,
    private readonly builder: BuilderService,
  ) {}

  async handle(context: MessageContext, text: string): Promise<void> {
    const { schema, tenant, from, contactName } = context;

    // Ensure customer exists
    const customer = await this.getOrCreateCustomer(schema, from, contactName);

    // Ensure conversation exists
    const conversation = await this.getOrCreateConversation(schema, customer.id, from);

    // Log inbound message
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `INSERT INTO messages (conversation_id, wa_message_id, direction, type, content)
         VALUES ($1, $2, 'inbound', 'text', $3)`,
        [conversation.id, context.messageId, JSON.stringify({ body: text })],
      );
      await qr.query(
        `UPDATE conversations SET last_message_at = NOW(), context = jsonb_set(COALESCE(context, '{}'), '{last_input}', $1) WHERE id = $2`,
        [JSON.stringify(text), conversation.id],
      );
    });

    // Parse intent from text and current conversation context
    const currentFlow = conversation.context?.flow || 'main_menu';
    await this.routeByFlow(context, customer, conversation, text, currentFlow);
  }

  private async routeByFlow(
    context: MessageContext,
    customer: any,
    conversation: any,
    text: string,
    flow: string,
  ): Promise<void> {
    const { schema, tenant } = context;
    const normalizedText = text.trim().toLowerCase();

    // Main menu keywords
    if (['hi', 'hello', 'hey', 'menu', 'start'].includes(normalizedText)) {
      await this.sendMainMenu(context, conversation.id);
      return;
    }

    // "Check the order/quote" — from a builder notification button. Send the
    // read-only webview link for the customer's most recent order/quote.
    if (['check the order', 'view order', 'check order'].includes(normalizedText)) {
      await this.sendResultLink(context, customer, conversation.id, 'order');
      return;
    }
    if (['check the quote', 'view quote', 'check quote'].includes(normalizedText)) {
      await this.sendResultLink(context, customer, conversation.id, 'quote');
      return;
    }

    // Customer quote request → mint a quote builder session bound to this
    // customer and ping the admin to price it.
    if (/\b(quote|quotation)\b/.test(normalizedText)) {
      await this.handleQuoteRequest(context, customer, conversation);
      return;
    }

    if (['cart', 'my cart', 'view cart'].includes(normalizedText)) {
      const cs = await this.commerceSettings.getCommerceSettings(schema);
      if (cs.cartEnabled) {
        await this.updateFlow(schema, conversation.id, 'view_cart');
        await this.sendCartSummary(context, customer, conversation.id);
        return;
      }
    }

    if (['orders', 'my orders', 'track'].includes(normalizedText)) {
      const cs = await this.commerceSettings.getCommerceSettings(schema);
      if (cs.orderEnabled) {
        await this.sendOrderStatus(context, customer, conversation.id);
        return;
      }
    }

    if (['help', 'support'].includes(normalizedText)) {
      await this.messageService.logAndSendText(
        schema,
        tenant.phoneNumberId,
        tenant.accessToken,
        context.from,
        conversation.id,
        'How can we help you? A team member will respond shortly. You can also type "menu" to browse our catalog.',
      );
      return;
    }

    // Default: show main menu
    await this.sendMainMenu(context, conversation.id);
  }

  /** Customer requested a quote → bind a quote session + notify the admin. */
  private async handleQuoteRequest(context: MessageContext, customer: any, conversation: any): Promise<void> {
    const { schema, tenant } = context;
    let url: string;
    try {
      const session = await this.builder.createSession({
        tenantId: tenant.id,
        schemaName: schema,
        type: 'quote',
        customerId: customer.id,
        customerPhone: customer.phone,
        customerName: customer.name,
        conversationId: conversation.id,
        createdBy: 'customer_request',
      });
      url = session.url;
    } catch (e: any) {
      this.logger.warn(`quote-request session failed: ${e.message}`);
      await this.messageService.logAndSendText(
        schema, tenant.phoneNumberId, tenant.accessToken, context.from, conversation.id,
        'Thanks! Our team will get back to you with a quote shortly.',
      );
      return;
    }

    await this.messageService.logAndSendText(
      schema, tenant.phoneNumberId, tenant.accessToken, context.from, conversation.id,
      'Thanks! 🙌 We\'ve received your quote request — our team will prepare a quote for you shortly.',
    );

    if (tenant.adminWhatsappNumber && tenant.adminWhatsappVerified) {
      try {
        await this.whatsappApi.sendCtaUrl(
          tenant.phoneNumberId, tenant.accessToken, tenant.adminWhatsappNumber,
          `📄 *New quote request*\nFrom: ${customer.name || customer.phone} (${customer.phone})\n\nTap below to build the quote — your products are ready to price.`,
          'Build Quote', url,
        );
      } catch (e: any) {
        this.logger.warn(`admin quote-request notify failed: ${e.message}`);
      }
    }
  }

  /** Send the customer a read-only webview link for their latest order/quote. */
  private async sendResultLink(context: MessageContext, customer: any, conversationId: string, type: 'order' | 'quote'): Promise<void> {
    const { schema, tenant } = context;
    try {
      const res = await this.builder.createViewForLatestResult(tenant.id, schema, type, customer.id);
      if (!res) {
        await this.messageService.logAndSendText(
          schema, tenant.phoneNumberId, tenant.accessToken, context.from, conversationId,
          `You don't have a recent ${type} yet. Type "menu" to get started.`,
        );
        return;
      }
      await this.whatsappApi.sendCtaUrl(
        tenant.phoneNumberId, tenant.accessToken, context.from,
        `Here is your ${type} *${res.number}*. Tap below to view the details.`,
        type === 'quote' ? 'View quote' : 'View order', res.url,
      );
    } catch (e: any) {
      this.logger.warn(`sendResultLink failed: ${e.message}`);
    }
  }

  private async sendMainMenu(context: MessageContext, conversationId: string): Promise<void> {
    const { schema, tenant } = context;

    const settings = await this.commerceSettings.getCommerceSettings(schema);

    const buttons: Array<{ id: string; title: string }> = [];

    if (settings.catalogEnabled) {
      buttons.push({ id: 'browse_catalog', title: '🛍️ Browse Catalog' });
    }
    if (settings.cartEnabled) {
      buttons.push({ id: 'view_cart', title: '🛒 My Cart' });
    }
    if (settings.orderEnabled) {
      buttons.push({ id: 'my_orders', title: '📦 My Orders' });
    }

    // WhatsApp requires 1-3 buttons; if none enabled, show a default greeting
    if (buttons.length === 0) {
      await this.messageService.logAndSendText(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversationId,
        'Welcome! How can we help you today? Type "help" for assistance.',
      );
      await this.updateFlow(schema, conversationId, 'main_menu');
      return;
    }

    // WhatsApp allows max 3 buttons — already guaranteed by our options
    await this.messageService.logAndSendInteractiveButtons(
      schema,
      tenant.phoneNumberId,
      tenant.accessToken,
      context.from,
      conversationId,
      'Welcome! What would you like to do?',
      buttons,
      'Main Menu',
    );

    await this.updateFlow(schema, conversationId, 'main_menu');
  }

  private async sendCartSummary(context: MessageContext, customer: any, conversationId: string): Promise<void> {
    const { schema, tenant } = context;

    const cart = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const cartResult = await qr.query(
        `SELECT c.id, ci.product_id, ci.quantity, ci.unit_price, p.name as product_name
         FROM carts c
         JOIN cart_items ci ON ci.cart_id = c.id
         JOIN products p ON p.id = ci.product_id
         WHERE c.customer_id = $1 AND c.status = 'active'`,
        [customer.id],
      );
      return cartResult;
    });

    if (!cart || cart.length === 0) {
      await this.messageService.logAndSendText(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversationId,
        'Your cart is empty. Type "menu" to browse our catalog!',
      );
      return;
    }

    let total = 0;
    let cartText = '🛒 *Your Cart:*\n\n';
    cart.forEach((item: any, i: number) => {
      const itemTotal = item.quantity * parseFloat(item.unit_price);
      total += itemTotal;
      cartText += `${i + 1}. ${item.product_name} x${item.quantity} - ₹${itemTotal.toFixed(2)}\n`;
    });
    cartText += `\n*Total: ₹${total.toFixed(2)}*`;

    await this.messageService.logAndSendInteractiveButtons(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      cartText,
      [
        { id: 'checkout', title: '✅ Checkout' },
        { id: 'clear_cart', title: '🗑️ Clear Cart' },
        { id: 'browse_catalog', title: '➕ Add More' },
      ],
    );
  }

  private async sendOrderStatus(context: MessageContext, customer: any, conversationId: string): Promise<void> {
    const { schema, tenant } = context;

    const orders = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT order_number, status, total, placed_at FROM orders
         WHERE customer_id = $1 ORDER BY placed_at DESC LIMIT 5`,
        [customer.id],
      );
    });

    if (!orders || orders.length === 0) {
      await this.messageService.logAndSendText(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversationId,
        'You have no orders yet. Type "menu" to start shopping!',
      );
      return;
    }

    let text = '📦 *Your Recent Orders:*\n\n';
    orders.forEach((order: any) => {
      const status = order.status.replace(/_/g, ' ').toUpperCase();
      text += `*${order.order_number}* - ₹${order.total}\nStatus: ${status}\n\n`;
    });

    await this.messageService.logAndSendText(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      text,
    );
  }

  private async getOrCreateCustomer(schema: string, phone: string, name?: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      let customer = await qr.query(
        `SELECT * FROM customers WHERE phone = $1`,
        [phone],
      );

      if (customer.length === 0) {
        customer = await qr.query(
          `INSERT INTO customers (phone, name) VALUES ($1, $2) RETURNING *`,
          [phone, name || phone],
        );
      }

      return customer[0];
    });
  }

  private async getOrCreateConversation(schema: string, customerId: string, phone: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      let convo = await qr.query(
        `SELECT * FROM conversations WHERE customer_id = $1 AND status = 'open'`,
        [customerId],
      );

      if (convo.length === 0) {
        convo = await qr.query(
          `INSERT INTO conversations (customer_id, phone, status) VALUES ($1, $2, 'open') RETURNING *`,
          [customerId, phone],
        );
      }

      return convo[0];
    });
  }

  private async updateFlow(schema: string, conversationId: string, flow: string): Promise<void> {
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `UPDATE conversations SET context = jsonb_set(COALESCE(context, '{}'), '{flow}', $1) WHERE id = $2`,
        [JSON.stringify(flow), conversationId],
      );
    });
  }
}
