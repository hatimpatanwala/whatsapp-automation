import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../whatsapp-message.service';
import { CommerceSettingsHelper } from '../helpers/commerce-settings.helper';
import { MessageContext } from './text-message.handler';

@Injectable()
export class InteractiveMessageHandler {
  private readonly logger = new Logger(InteractiveMessageHandler.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly messageService: WhatsAppMessageService,
    private readonly commerceSettings: CommerceSettingsHelper,
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

    const settings = await this.commerceSettings.getCommerceSettings(schema);

    switch (prefix) {
      case 'browse_catalog':
        if (!settings.catalogEnabled) { await this.sendDisabledMessage(context, conversation.id, 'Catalog browsing'); break; }
        await this.sendCategories(context, conversation.id);
        break;

      case 'category':
        if (!settings.catalogEnabled) { await this.sendDisabledMessage(context, conversation.id, 'Catalog browsing'); break; }
        await this.sendProductsInCategory(context, conversation.id, param);
        break;

      case 'product':
        if (!settings.catalogEnabled) { await this.sendDisabledMessage(context, conversation.id, 'Product browsing'); break; }
        await this.sendProductDetail(context, customer, conversation.id, param);
        break;

      case 'add_to_cart':
        if (!settings.cartEnabled) { await this.sendDisabledMessage(context, conversation.id, 'Cart'); break; }
        await this.addToCart(context, customer, conversation.id, param);
        break;

      case 'view_cart':
        if (!settings.cartEnabled) { await this.sendDisabledMessage(context, conversation.id, 'Cart'); break; }
        await this.sendCartView(context, customer, conversation.id);
        break;

      case 'checkout':
        if (!settings.orderEnabled) { await this.sendDisabledMessage(context, conversation.id, 'Ordering'); break; }
        await this.initiateCheckout(context, customer, conversation.id);
        break;

      case 'confirm_order':
        if (!settings.orderEnabled) { await this.sendDisabledMessage(context, conversation.id, 'Ordering'); break; }
        await this.confirmOrder(context, customer, conversation.id);
        break;

      case 'select_address':
        if (!settings.orderEnabled) { await this.sendDisabledMessage(context, conversation.id, 'Ordering'); break; }
        await this.selectAddress(context, customer, conversation.id, param);
        break;

      case 'my_orders':
        if (!settings.orderEnabled) { await this.sendDisabledMessage(context, conversation.id, 'Orders'); break; }
        await this.sendOrders(context, customer, conversation.id);
        break;

      case 'clear_cart':
        if (!settings.cartEnabled) { await this.sendDisabledMessage(context, conversation.id, 'Cart'); break; }
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
        `SELECT c.id, c.name, c.slug, c.image_url,
                COUNT(p.id) as product_count
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id AND p.is_active = true
         WHERE c.is_active = true
         GROUP BY c.id, c.name, c.slug, c.image_url, c.sort_order
         ORDER BY c.sort_order LIMIT 10`,
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
        description: `${cat.product_count} product${cat.product_count !== 1 ? 's' : ''} available`,
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
        `SELECT p.id, p.name, p.slug, p.base_price, p.sale_price, p.thumbnail, p.images,
                p.description, c.name as category_name,
                COALESCE(i.stock_quantity, 0) - COALESCE(i.reserved_quantity, 0) as available_stock
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN inventory i ON i.product_id = p.id AND i.variant_id IS NULL
         WHERE p.category_id = $1 AND p.is_active = true ORDER BY p.sort_order LIMIT 10`,
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

    // Try native Meta product list if catalog is synced
    const settings = await this.commerceSettings.getCommerceSettings(schema);
    if (settings.catalogId) {
      const productItems = products.map((p: any) => ({
        product_retailer_id: p.slug || p.id,
      }));
      const categoryName = products[0].category_name || 'Products';

      try {
        await this.messageService.logAndSendMultiProduct(
          schema, tenant.phoneNumberId, tenant.accessToken,
          context.from, conversationId,
          settings.catalogId,
          [{ title: categoryName, product_items: productItems }],
          `🛍️ ${categoryName}`,
          'Tap a product to view details and add to cart',
        );
        return;
      } catch (err: any) {
        this.logger.warn(`Native product list failed, using fallback: ${err.message}`);
      }
    }

    // Fallback: send image cards for each product (max 5 to avoid spam)
    const displayProducts = products.slice(0, 5);
    for (const p of displayProducts) {
      const price = p.sale_price || p.base_price;
      const originalPrice = p.sale_price ? `~₹${p.base_price}~ ` : '';
      const imageUrl = p.thumbnail || (p.images && p.images[0]);
      const inStock = (p.available_stock || 0) > 0;
      const stockLabel = inStock ? `✅ In Stock` : `❌ Out of Stock`;

      if (imageUrl) {
        const caption = `*${p.name}*\n${originalPrice}💰 ₹${price}\n${stockLabel}`;
        await this.messageService.logAndSendImage(
          schema, tenant.phoneNumberId, tenant.accessToken,
          context.from, conversationId, imageUrl, caption,
        );
      }

      const buttons: Array<{ id: string; title: string }> = [];
      if (inStock) {
        buttons.push({ id: `product:${p.id}`, title: '📋 View & Add' });
      } else {
        buttons.push({ id: `product:${p.id}`, title: '📋 View Details' });
      }

      if (buttons.length > 0) {
        await this.messageService.logAndSendInteractiveButtons(
          schema, tenant.phoneNumberId, tenant.accessToken,
          context.from, conversationId,
          imageUrl ? `Tap below to view *${p.name}*` : `*${p.name}*\n${originalPrice}💰 ₹${price}\n${stockLabel}`,
          buttons,
        );
      }
    }

    // If more products, show a "see more" list
    if (products.length > 5) {
      const remaining = products.slice(5);
      const sections = [{
        title: 'More Products',
        rows: remaining.map((p: any) => ({
          id: `product:${p.id}`,
          title: p.name.substring(0, 24),
          description: `₹${p.sale_price || p.base_price}`,
        })),
      }];

      await this.messageService.logAndSendInteractiveList(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversationId,
        `+${remaining.length} more products:`,
        'See More',
        sections,
      );
    }
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

    // Try native Meta product card if catalog is synced
    const settings = await this.commerceSettings.getCommerceSettings(schema);
    if (settings.catalogId) {
      try {
        await this.messageService.logAndSendProduct(
          schema, tenant.phoneNumberId, tenant.accessToken,
          context.from, conversationId,
          settings.catalogId,
          product.slug || product.id,
          product.description || undefined,
        );
        return;
      } catch (err: any) {
        this.logger.warn(`Native product card failed, using fallback: ${err.message}`);
      }
    }

    // Fallback: image + details + quantity buttons
    const price = product.sale_price || product.base_price;
    const originalPrice = product.sale_price ? `~₹${product.base_price}~ ` : '';
    const available = (product.stock_quantity || 0) - (product.reserved_quantity || 0);
    const inStock = available > 0;
    const imageUrl = product.thumbnail || (product.images && product.images[0]);

    // Send product image with details as caption
    if (imageUrl) {
      let caption = `*${product.name}*\n\n`;
      if (product.description) caption += `${product.description}\n\n`;
      caption += `${originalPrice}💰 *₹${price}*\n`;
      caption += inStock ? `✅ In Stock (${available} available)` : `❌ Out of Stock`;

      await this.messageService.logAndSendImage(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversationId, imageUrl, caption,
      );
    }

    if (inStock) {
      // Send quantity selection buttons (WhatsApp allows max 3 buttons)
      const maxQty = Math.min(available, 10);
      const bodyText = imageUrl
        ? `Select quantity for *${product.name}*:`
        : `*${product.name}*\n${product.description || ''}\n\n${originalPrice}💰 *₹${price}*\n✅ In Stock (${available} available)\n\nSelect quantity:`;

      const qtyButtons: Array<{ id: string; title: string }> = [
        { id: `add_to_cart:${productId}:1`, title: '🛒 Add 1' },
      ];
      if (maxQty >= 2) {
        qtyButtons.push({ id: `add_to_cart:${productId}:2`, title: '🛒 Add 2' });
      }
      if (maxQty >= 3) {
        qtyButtons.push({ id: `add_to_cart:${productId}:3`, title: '🛒 Add 3' });
      }

      await this.messageService.logAndSendInteractiveButtons(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversationId,
        bodyText, qtyButtons,
      );

      // If more quantities are possible, offer a list for larger quantities
      if (maxQty > 3) {
        const rows = [];
        for (let qty = 4; qty <= Math.min(maxQty, 10); qty++) {
          rows.push({
            id: `add_to_cart:${productId}:${qty}`,
            title: `Add ${qty} units`,
            description: `₹${(price * qty).toFixed(2)} total`,
          });
        }

        await this.messageService.logAndSendInteractiveList(
          schema, tenant.phoneNumberId, tenant.accessToken,
          context.from, conversationId,
          'Need more? Select a larger quantity:',
          'More Quantities',
          [{ title: 'Quantity', rows }],
        );
      }
    } else {
      // Out of stock — just show back button
      const bodyText = imageUrl
        ? `❌ *${product.name}* is currently out of stock.`
        : `*${product.name}*\n${product.description || ''}\n\n💰 ₹${price}\n❌ Out of Stock`;

      await this.messageService.logAndSendInteractiveButtons(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversationId,
        bodyText,
        [{ id: 'browse_catalog', title: '◀️ Back to Catalog' }],
      );
    }
  }

  private async addToCart(
    context: MessageContext,
    customer: any,
    conversationId: string,
    param: string,
  ): Promise<void> {
    const { schema, tenant } = context;

    // Parse param: "productId" or "productId:quantity"
    const parts = param.split(':');
    const productId = parts[0];
    const quantity = Math.max(1, Math.min(parseInt(parts[1]) || 1, 99));

    let productName = '';

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

      productName = product[0].name;
      const price = product[0].sale_price || product[0].base_price;

      // Check if already in cart
      const existing = await qr.query(
        `SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2`,
        [cartId, productId],
      );

      if (existing.length > 0) {
        await qr.query(
          `UPDATE cart_items SET quantity = quantity + $1 WHERE id = $2`,
          [quantity, existing[0].id],
        );
      } else {
        await qr.query(
          `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`,
          [cartId, productId, quantity, price],
        );
      }
    });

    const qtyText = quantity > 1 ? `${quantity}x ` : '';
    await this.messageService.logAndSendInteractiveButtons(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      `✅ Added ${qtyText}*${productName || 'item'}* to cart!`,
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
        `SELECT ci.*, p.name as product_name, p.thumbnail,
                p.images, p.slug as product_slug
         FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
         JOIN products p ON p.id = ci.product_id
         WHERE c.customer_id = $1 AND c.status = 'active'`,
        [customer.id],
      );
    });

    if (!items || items.length === 0) {
      await this.messageService.logAndSendInteractiveButtons(
        schema, tenant.phoneNumberId, tenant.accessToken,
        context.from, conversationId,
        'Your cart is empty! Browse our catalog to add items.',
        [{ id: 'browse_catalog', title: '🛍️ Browse Catalog' }],
      );
      return;
    }

    let total = 0;
    let text = '🛒 *Your Cart:*\n\n';
    items.forEach((item: any, i: number) => {
      const itemTotal = item.quantity * parseFloat(item.unit_price);
      total += itemTotal;
      text += `${i + 1}. *${item.product_name}* × ${item.quantity} — ₹${itemTotal.toFixed(2)}\n`;
    });
    text += `\n💰 *Total: ₹${total.toFixed(2)}*`;
    text += `\n\n_${items.length} item${items.length > 1 ? 's' : ''} in cart_`;

    await this.messageService.logAndSendInteractiveButtons(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      text,
      [
        { id: 'checkout', title: '✅ Checkout' },
        { id: 'clear_cart', title: '🗑️ Clear Cart' },
        { id: 'browse_catalog', title: '➕ Add More' },
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

  private async sendDisabledMessage(context: MessageContext, conversationId: string, featureName: string): Promise<void> {
    const { schema, tenant } = context;
    await this.messageService.logAndSendText(
      schema, tenant.phoneNumberId, tenant.accessToken,
      context.from, conversationId,
      `${featureName} is not available at the moment. Please contact us for assistance.`,
    );
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
