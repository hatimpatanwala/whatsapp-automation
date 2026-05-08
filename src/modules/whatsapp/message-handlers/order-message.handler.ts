import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../whatsapp-message.service';
import { CommerceSettingsHelper } from '../helpers/commerce-settings.helper';
import { EventBusService } from '../../events/event-bus.service';
import { MessageContext } from './text-message.handler';

/**
 * Handles WhatsApp native order messages (type: 'order').
 * When a customer uses WhatsApp's built-in cart and places an order,
 * Meta sends an order-type message with product_items.
 *
 * Payload shape:
 * {
 *   "type": "order",
 *   "order": {
 *     "catalog_id": "...",
 *     "product_items": [
 *       { "product_retailer_id": "...", "quantity": 1, "item_price": 100, "currency": "INR" }
 *     ],
 *     "text": "optional customer message"
 *   }
 * }
 */
@Injectable()
export class OrderMessageHandler {
  private readonly logger = new Logger(OrderMessageHandler.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly messageService: WhatsAppMessageService,
    private readonly commerceSettings: CommerceSettingsHelper,
    private readonly eventBus: EventBusService,
  ) {}

  async handle(context: MessageContext, order: any): Promise<void> {
    const { schema, tenant, from, contactName } = context;

    // Check if commerce ordering is enabled
    const settings = await this.commerceSettings.getCommerceSettings(schema);
    if (!settings.orderEnabled) {
      this.logger.log(`[COMMERCE] Order from ${from} in ${schema} — ordering disabled, sending rejection`);
      const customer = await this.getOrCreateCustomer(schema, from, contactName);
      const conversation = await this.getOrCreateConversation(schema, customer.id, from);
      await this.messageService.logAndSendText(
        schema, tenant.phoneNumberId, tenant.accessToken,
        from, conversation.id,
        'Sorry, ordering is currently disabled. Please contact us for assistance.',
      );
      return;
    }

    const customer = await this.getOrCreateCustomer(schema, from, contactName);
    const conversation = await this.getOrCreateConversation(schema, customer.id, from);

    // Log the inbound order message
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `INSERT INTO messages (conversation_id, wa_message_id, direction, type, content, status)
         VALUES ($1, $2, 'inbound', 'order', $3, 'received')`,
        [conversation.id, context.messageId, JSON.stringify(order)],
      );
    });

    const productItems = order.product_items || [];
    const customerText = order.text || '';

    if (productItems.length === 0) {
      await this.messageService.logAndSendText(
        schema, tenant.phoneNumberId, tenant.accessToken,
        from, conversation.id,
        'We received your order but it appears to be empty. Please try again.',
      );
      return;
    }

    // Resolve product_retailer_id to our product records and build order
    const orderResult = await this.connectionManager.executeInTransaction(schema, async (qr) => {
      // Map product_retailer_id → product (use slug or id)
      const resolvedItems: Array<{
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        currency: string;
      }> = [];

      let subtotal = 0;

      for (const item of productItems) {
        const retailerId = item.product_retailer_id;
        const quantity = item.quantity || 1;
        const itemPrice = parseFloat(item.item_price) / 1000; // Meta sends price in thousandths

        // Try to find product by slug first, then by id
        const products = await qr.query(
          `SELECT id, name, base_price, sale_price FROM products
           WHERE (slug = $1 OR id::text = $1) AND is_active = true LIMIT 1`,
          [retailerId],
        );

        if (products.length > 0) {
          const product = products[0];
          const price = itemPrice > 0 ? itemPrice : parseFloat(product.sale_price || product.base_price);
          resolvedItems.push({
            productId: product.id,
            productName: product.name,
            quantity,
            unitPrice: price,
            currency: item.currency || 'INR',
          });
          subtotal += price * quantity;
        } else {
          // Product not found — still include in order with the retailer ID as name
          resolvedItems.push({
            productId: retailerId,
            productName: `Product ${retailerId}`,
            quantity,
            unitPrice: itemPrice,
            currency: item.currency || 'INR',
          });
          subtotal += itemPrice * quantity;
        }
      }

      // Generate order number
      const orderPrefix = await this.getSettingValue(qr, schema, 'order_prefix', 'ORD-');
      const countResult = await qr.query(`SELECT COUNT(*)::int as count FROM orders`);
      const orderNumber = `${orderPrefix}${String((countResult[0]?.count || 0) + 1).padStart(5, '0')}`;

      // Create the order
      const orderRows = await qr.query(
        `INSERT INTO orders (order_number, customer_id, status, subtotal, total, currency, notes, placed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, order_number`,
        [
          orderNumber,
          customer.id,
          settings.autoCheckout ? 'confirmed' : 'pending',
          subtotal,
          subtotal, // No delivery fee from WhatsApp native cart
          resolvedItems[0]?.currency || 'INR',
          customerText || null,
        ],
      );

      const orderId = orderRows[0].id;

      // Insert order items
      for (const item of resolvedItems) {
        await qr.query(
          `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, item.productId, item.productName, item.quantity, item.unitPrice, item.unitPrice * item.quantity],
        );
      }

      // Update customer stats
      await qr.query(
        `UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + $1, last_order_at = NOW() WHERE id = $2`,
        [subtotal, customer.id],
      );

      return {
        orderId,
        orderNumber,
        items: resolvedItems,
        subtotal,
        status: settings.autoCheckout ? 'confirmed' : 'pending',
      };
    });

    // Emit order created event
    this.eventBus.emit({
      type: 'order.created',
      schema,
      orderId: orderResult.orderId,
      orderNumber: orderResult.orderNumber,
      customerId: customer.id,
      customerPhone: from,
      source: 'whatsapp_native_cart',
    } as any);

    // Send order confirmation to customer
    let confirmText = `🎉 *Order Received!*\n\n`;
    confirmText += `Order: *${orderResult.orderNumber}*\n`;
    confirmText += `Status: *${orderResult.status === 'confirmed' ? 'Confirmed' : 'Pending'}*\n\n`;

    orderResult.items.forEach((item, i) => {
      confirmText += `${i + 1}. ${item.productName} x${item.quantity} — ₹${(item.unitPrice * item.quantity).toFixed(2)}\n`;
    });

    confirmText += `\n*Total: ₹${orderResult.subtotal.toFixed(2)}*`;

    if (orderResult.status === 'pending') {
      confirmText += `\n\nYour order is being reviewed. We'll confirm it shortly!`;
    } else {
      confirmText += `\n\nYour order has been confirmed! We'll update you on the delivery.`;
    }

    await this.messageService.logAndSendText(
      schema, tenant.phoneNumberId, tenant.accessToken,
      from, conversation.id,
      confirmText,
    );

    this.logger.log(`[COMMERCE] Order ${orderResult.orderNumber} created from WhatsApp native cart for ${from} in ${schema}`);
  }

  private async getSettingValue(qr: any, schema: string, key: string, defaultValue: string): Promise<string> {
    const rows = await qr.query(`SELECT value FROM settings WHERE key = $1`, [key]);
    if (rows[0]) {
      try { return JSON.parse(rows[0].value); } catch { return rows[0].value; }
    }
    return defaultValue;
  }

  private async getOrCreateCustomer(schema: string, phone: string, name?: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      let customer = await qr.query(`SELECT * FROM customers WHERE phone = $1`, [phone]);
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
}
