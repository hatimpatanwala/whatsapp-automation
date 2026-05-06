import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../whatsapp-message.service';
import { MessageContext } from './text-message.handler';

@Injectable()
export class InteractiveMessageHandler {
  private readonly logger = new Logger(InteractiveMessageHandler.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly messageService: WhatsAppMessageService,
  ) {}

  async handle(context: MessageContext, interactive: any): Promise<void> {
    const { schema, tenant, from } = context;

    // Get customer and conversation
    const customer = await this.getCustomer(schema, from);
    if (!customer) return;

    const conversation = await this.getConversation(schema, customer.id);
    if (!conversation) return;

    // Log inbound message
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `INSERT INTO messages (conversation_id, wa_message_id, direction, type, content)
         VALUES ($1, $2, 'inbound', 'interactive', $3)`,
        [conversation.id, context.messageId, JSON.stringify(interactive)],
      );
    });

    // Parse interactive response
    let actionId: string;
    let actionTitle: string;

    if (interactive.type === 'button_reply') {
      actionId = interactive.button_reply.id;
      actionTitle = interactive.button_reply.title;
    } else if (interactive.type === 'list_reply') {
      actionId = interactive.list_reply.id;
      actionTitle = interactive.list_reply.title;
    } else {
      return;
    }

    this.logger.debug(`Interactive action: ${actionId} from ${from}`);

    // Route by action
    await this.routeAction(context, customer, conversation, actionId, actionTitle);
  }

  private async routeAction(
    context: MessageContext,
    customer: any,
    conversation: any,
    actionId: string,
    actionTitle: string,
  ): Promise<void> {
    const { schema, tenant } = context;

    // Parse action prefix
    const [prefix, ...rest] = actionId.split(':');
    const param = rest.join(':');

    switch (prefix) {
      case 'browse_catalog':
        await this.sendCategories(context, conversation.id);
        break;

      case 'category':
        await this.sendProductsInCategory(context, conversation.id, param);
        break;

      case 'product':
        await this.sendProductDetail(context, customer, conversation.id, param);
        break;

      case 'add_to_cart':
        await this.addToCart(context, customer, conversation.id, param);
        break;

      case 'view_cart':
        await this.sendCartView(context, customer, conversation.id);
        break;

      case 'checkout':
        await this.initiateCheckout(context, customer, conversation.id);
        break;

      case 'confirm_order':
        await this.confirmOrder(context, customer, conversation.id);
        break;

      case 'select_address':
        await this.selectAddress(context, customer, conversation.id, param);
        break;

      case 'my_orders':
        await this.sendOrders(context, customer, conversation.id);
        break;

      case 'clear_cart':
        await this.clearCart(context, customer, conversation.id);
        break;

      default:
        await this.messageService.logAndSendText(
          schema, tenant.phoneNumberId, tenant.accessToken,
          context.from, conversation.id,
          'Sorry, I didn\'t understand that. Type "menu" to see options.',
        );
    }
  }

  private async sendCategories(context: MessageContext, conversationId: string): Promise<void> {
    const { schema, tenant } = context;

    const categories = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT id, name, slug FROM categories WHERE is_active = true ORDER BY sort_order LIMIT 10`,
      );
    });

    if (!categories || categories.length === 0) {
      await this.messageService.logAndSendText(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversationId,
        'No categories available at the moment.',
      );
      return;
    }

    const sections = [{
      title: 'Categories',
      rows: categories.map((cat: any) => ({
        id: `category:${cat.id}`,
        title: cat.name.substring(0, 24),
        description: `Browse ${cat.name}`,
      })),
    }];

    await this.messageService.logAndSendInteractiveList(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      'Choose a category to browse products:',
      'View Categories',
      sections,
      '🛍️ Our Catalog',
    );
  }

  private async sendProductsInCategory(
    context: MessageContext,
    conversationId: string,
    categoryId: string,
  ): Promise<void> {
    const { schema, tenant } = context;

    const products = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT id, name, base_price, sale_price FROM products
         WHERE category_id = $1 AND is_active = true ORDER BY sort_order LIMIT 10`,
        [categoryId],
      );
    });

    if (!products || products.length === 0) {
      await this.messageService.logAndSendText(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversationId,
        'No products in this category right now.',
      );
      return;
    }

    const sections = [{
      title: 'Products',
      rows: products.map((p: any) => {
        const price = p.sale_price || p.base_price;
        return {
          id: `product:${p.id}`,
          title: p.name.substring(0, 24),
          description: `₹${price}`,
        };
      }),
    }];

    await this.messageService.logAndSendInteractiveList(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      'Select a product to view details:',
      'View Products',
      sections,
    );
  }

  private async sendProductDetail(
    context: MessageContext,
    customer: any,
    conversationId: string,
    productId: string,
  ): Promise<void> {
    const { schema, tenant } = context;

    const product = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(
        `SELECT p.*, i.stock_quantity, i.reserved_quantity
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id AND i.variant_id IS NULL
         WHERE p.id = $1`,
        [productId],
      );
      return result[0];
    });

    if (!product) return;

    const price = product.sale_price || product.base_price;
    const available = (product.stock_quantity || 0) - (product.reserved_quantity || 0);
    const inStock = available > 0;

    let text = `*${product.name}*\n\n`;
    if (product.description) text += `${product.description}\n\n`;
    text += `💰 Price: ₹${price}\n`;
    text += inStock ? `✅ In Stock (${available} available)` : `❌ Out of Stock`;

    const buttons: Array<{ id: string; title: string }> = [];
    if (inStock) {
      buttons.push({ id: `add_to_cart:${productId}`, title: '🛒 Add to Cart' });
    }
    buttons.push({ id: 'browse_catalog', title: '◀️ Back' });

    await this.messageService.logAndSendInteractiveButtons(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      text, buttons,
    );
  }

  private async addToCart(
    context: MessageContext,
    customer: any,
    conversationId: string,
    productId: string,
  ): Promise<void> {
    const { schema, tenant } = context;

    await this.connectionManager.executeInTransaction(schema, async (qr) => {
      // Get or create active cart
      let cart = await qr.query(
        `SELECT id FROM carts WHERE customer_id = $1 AND status = 'active'`,
        [customer.id],
      );

      if (cart.length === 0) {
        cart = await qr.query(
          `INSERT INTO carts (customer_id, status) VALUES ($1, 'active') RETURNING id`,
          [customer.id],
        );
      }
      const cartId = cart[0].id;

      // Get product price
      const product = await qr.query(
        `SELECT id, name, base_price, sale_price FROM products WHERE id = $1`,
        [productId],
      );
      if (!product[0]) return;

      const price = product[0].sale_price || product[0].base_price;

      // Check if already in cart
      const existing = await qr.query(
        `SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2`,
        [cartId, productId],
      );

      if (existing.length > 0) {
        await qr.query(
          `UPDATE cart_items SET quantity = quantity + 1 WHERE id = $1`,
          [existing[0].id],
        );
      } else {
        await qr.query(
          `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price) VALUES ($1, $2, 1, $3)`,
          [cartId, productId, price],
        );
      }
    });

    await this.messageService.logAndSendInteractiveButtons(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      '✅ Added to cart!',
      [
        { id: 'view_cart', title: '🛒 View Cart' },
        { id: 'browse_catalog', title: '➕ Continue Shopping' },
      ],
    );
  }

  private async sendCartView(context: MessageContext, customer: any, conversationId: string): Promise<void> {
    const { schema, tenant } = context;

    const items = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT ci.*, p.name as product_name FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
         JOIN products p ON p.id = ci.product_id
         WHERE c.customer_id = $1 AND c.status = 'active'`,
        [customer.id],
      );
    });

    if (!items || items.length === 0) {
      await this.messageService.logAndSendText(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversationId,
        'Your cart is empty! Browse our catalog to add items.',
      );
      return;
    }

    let total = 0;
    let text = '🛒 *Your Cart:*\n\n';
    items.forEach((item: any, i: number) => {
      const itemTotal = item.quantity * parseFloat(item.unit_price);
      total += itemTotal;
      text += `${i + 1}. ${item.product_name} x${item.quantity} — ₹${itemTotal.toFixed(2)}\n`;
    });
    text += `\n*Total: ₹${total.toFixed(2)}*`;

    await this.messageService.logAndSendInteractiveButtons(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      text,
      [
        { id: 'checkout', title: '✅ Checkout' },
        { id: 'clear_cart', title: '🗑️ Clear Cart' },
      ],
    );
  }

  private async initiateCheckout(context: MessageContext, customer: any, conversationId: string): Promise<void> {
    const { schema, tenant } = context;

    // Check for addresses
    const addresses = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT id, label, full_address FROM addresses WHERE customer_id = $1 LIMIT 3`,
        [customer.id],
      );
    });

    if (!addresses || addresses.length === 0) {
      await this.messageService.logAndSendText(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversationId,
        '📍 Please share your delivery address to proceed.\n\nSend your full address as a text message (include city, pincode, and any landmark).',
      );
      await this.updateFlow(schema, conversationId, 'awaiting_address');
      return;
    }

    // Show address selection
    const sections = [{
      title: 'Saved Addresses',
      rows: addresses.map((addr: any) => ({
        id: `select_address:${addr.id}`,
        title: addr.label.substring(0, 24),
        description: addr.full_address.substring(0, 72),
      })),
    }];

    await this.messageService.logAndSendInteractiveList(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      'Select a delivery address:',
      'Choose Address',
      sections,
      '📍 Delivery Address',
    );
  }

  private async selectAddress(context: MessageContext, customer: any, conversationId: string, addressId: string): Promise<void> {
    const { schema, tenant } = context;

    // Store selected address in conversation context
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `UPDATE conversations SET context = jsonb_set(COALESCE(context, '{}'), '{selected_address_id}', $1) WHERE id = $2`,
        [JSON.stringify(addressId), conversationId],
      );
    });

    // Show order confirmation
    await this.messageService.logAndSendInteractiveButtons(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      '✅ Address selected. Ready to place your order?',
      [
        { id: 'confirm_order', title: '✅ Place Order' },
        { id: 'view_cart', title: '◀️ Back to Cart' },
      ],
    );
  }

  private async confirmOrder(context: MessageContext, customer: any, conversationId: string): Promise<void> {
    const { schema, tenant } = context;

    // This would trigger the full order creation flow
    // For now, send a confirmation message
    await this.messageService.logAndSendText(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      '🎉 Order placement is being processed. You will receive a confirmation shortly with payment details.',
    );

    await this.updateFlow(schema, conversationId, 'order_pending');
  }

  private async clearCart(context: MessageContext, customer: any, conversationId: string): Promise<void> {
    const { schema, tenant } = context;

    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `UPDATE carts SET status = 'abandoned' WHERE customer_id = $1 AND status = 'active'`,
        [customer.id],
      );
    });

    await this.messageService.logAndSendText(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      '🗑️ Cart cleared. Type "menu" to start fresh!',
    );
  }

  private async sendOrders(context: MessageContext, customer: any, conversationId: string): Promise<void> {
    const { schema, tenant } = context;

    const orders = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT order_number, status, total FROM orders WHERE customer_id = $1 ORDER BY placed_at DESC LIMIT 5`,
        [customer.id],
      );
    });

    if (!orders || orders.length === 0) {
      await this.messageService.logAndSendText(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversationId,
        'No orders found. Start shopping now!',
      );
      return;
    }

    let text = '📦 *Recent Orders:*\n\n';
    orders.forEach((o: any) => {
      text += `*${o.order_number}* — ₹${o.total}\nStatus: ${o.status.replace(/_/g, ' ')}\n\n`;
    });

    await this.messageService.logAndSendText(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId, text,
    );
  }

  private async getCustomer(schema: string, phone: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(`SELECT * FROM customers WHERE phone = $1`, [phone]);
      return result[0];
    });
  }

  private async getConversation(schema: string, customerId: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(
        `SELECT * FROM conversations WHERE customer_id = $1 AND status = 'open'`, [customerId],
      );
      return result[0];
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
