import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.module';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { WhatsAppApiService } from './whatsapp-api.service';
import { InvoiceService, DocType } from './invoice.service';
import { BuilderService } from '../builder/builder.service';

interface AdminState {
  flow: string;
  step: string;
  data: Record<string, any>;
}

/**
 * Fixed (non-editable) admin command system. When a message arrives from a
 * tenant's verified admin WhatsApp number, this service lets the seller run
 * their store over WhatsApp: view/confirm orders, change order status, and
 * list/add/update/delete products. State for multi-step flows (e.g. add
 * product) is kept in Redis, keyed by the admin's phone number.
 */
@Injectable()
export class AdminCommandService {
  private readonly logger = new Logger(AdminCommandService.name);
  private readonly STATE_TTL = 1800; // 30 minutes

  private readonly ORDER_STATUSES: { id: string; title: string }[] = [
    { id: 'confirmed', title: '✅ Confirm' },
    { id: 'processing', title: '👨‍🍳 Processing' },
    { id: 'ready_for_delivery', title: '📦 Ready/Shipped' },
    { id: 'delivered', title: '🚚 Delivered' },
    { id: 'cancelled', title: '❌ Cancel' },
  ];

  private readonly QUOTE_STATUSES: { id: string; title: string }[] = [
    { id: 'sent', title: '📤 Mark Sent' },
    { id: 'accepted', title: '✅ Accepted' },
    { id: 'rejected', title: '❌ Rejected' },
    { id: 'converted', title: '🛒 Converted' },
  ];

  constructor(
    private readonly whatsappApi: WhatsAppApiService,
    private readonly connectionManager: TenantConnectionManager,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly invoiceService: InvoiceService,
    private readonly builder: BuilderService,
  ) {}

  // ─── Entry point ────────────────────────────────────────────────────────────
  async handle(tenant: any, message: any): Promise<void> {
    const schema = tenant.schemaName;
    const to = message.from;
    const reply = this.parseReply(message);
    const id = reply.id;
    const text = (reply.text || '').trim();

    try {
      // "help" → command guide.
      if (!id && /^(help|\?|commands|guide)$/i.test(text)) {
        await this.clearState(schema, to);
        return this.showHelp(tenant, to);
      }

      // "menu" / greeting resets to the main menu.
      if (!id && /^(menu|hi|hello|hey|start|admin|home|back)$/i.test(text)) {
        await this.clearState(schema, to);
        return this.showMainMenu(tenant, to);
      }

      // An interactive tap (id) always wins and resets any text-input flow.
      if (id) {
        await this.clearState(schema, to);
        return this.handleCommand(tenant, to, id);
      }

      // Otherwise, feed free text into any active multi-step flow.
      const state = await this.getState(schema, to);
      if (state) return this.handleStateInput(tenant, to, state, text);

      // Nothing matched → show the menu.
      return this.showMainMenu(tenant, to);
    } catch (err: any) {
      this.logger.error(`Admin command failed: ${err.message}`, err.stack);
      await this.send(tenant, to, '⚠️ Something went wrong. Send *menu* to start again.');
    }
  }

  // ─── Main menu (categories) ──────────────────────────────────────────────────
  private async showMainMenu(tenant: any, to: string): Promise<void> {
    await this.sendList(tenant, to, '🛠️ *Admin Control*\nManage your whole store from WhatsApp.', 'Open', [
      {
        title: 'Sales',
        rows: [
          { id: 'cat_orders', title: '📦 Orders', description: 'View, confirm & update status' },
          { id: 'cat_quotes', title: '📄 Quotes', description: 'View & update quotes' },
        ],
      },
      {
        title: 'Catalog',
        rows: [
          { id: 'cat_products', title: '🛍️ Products', description: 'List / add / update / delete' },
          { id: 'menu_lowstock', title: '📉 Low Stock', description: 'Items running low' },
        ],
      },
      {
        title: 'Store',
        rows: [
          { id: 'menu_customers', title: '👥 Customers', description: 'Top customers' },
          { id: 'menu_payments', title: '💳 Payments', description: 'Recent payments' },
          { id: 'menu_summary', title: '📊 Summary', description: 'Today at a glance' },
          { id: 'menu_help', title: '❓ Help', description: 'All commands & guide' },
        ],
      },
    ]);
  }

  // ─── Help / command guide ─────────────────────────────────────────────────────
  private async showHelp(tenant: any, to: string): Promise<void> {
    const guide =
      '❓ *Admin Help — All Commands*\n\n' +
      'Type a word, or just send *menu* and tap options.\n\n' +
      '*Quick words*\n' +
      '• *menu* — open the main menu\n' +
      '• *help* — show this guide\n' +
      '• *back* — return to the menu\n\n' +
      '📦 *Orders*\n' +
      '• *Orders → All Orders* — see recent orders\n' +
      '• *Orders → Pending* — orders waiting to confirm\n' +
      '• Tap an order → *Confirm*, *Processing*, *Ready/Shipped*, *Delivered* or *Cancel*\n\n' +
      '📄 *Quotes*\n' +
      '• *Quotes → All / Open* — see quotes\n' +
      '• Tap a quote → mark *Sent*, *Accepted*, *Rejected* or *Converted*\n\n' +
      '🛍️ *Products*\n' +
      '• *Products → List* — view your catalog\n' +
      '• *Products → Add* — I’ll ask name → price → stock\n' +
      '• *Products → Update* — pick a product → change price / stock / name\n' +
      '• *Products → Delete* — pick a product → confirm\n\n' +
      '📊 *Store*\n' +
      '• *Low Stock* — items running low (restock via Update → Stock)\n' +
      '• *Customers* — your top customers\n' +
      '• *Payments* — recent payments\n' +
      '• *Summary* — today’s orders, revenue & alerts\n\n' +
      'You’ll also get *automatic alerts* for new orders, payments and low stock.\n\n' +
      'Send *menu* to begin.';
    await this.send(tenant, to, guide);
  }

  private async showOrdersMenu(tenant: any, to: string): Promise<void> {
    await this.sendList(tenant, to, '📦 *Orders*', 'Choose', [{
      title: 'Orders', rows: [
        { id: 'new_order', title: '✨ Create New Order', description: 'Build a new order' },
        { id: 'menu_orders', title: '📋 All Orders', description: 'Recent orders' },
        { id: 'menu_pending', title: '⏳ Pending', description: 'Confirm new orders' },
        { id: 'cancel', title: '⬅️ Back to menu' },
      ],
    }]);
  }

  private async showQuotesMenu(tenant: any, to: string): Promise<void> {
    await this.sendList(tenant, to, '📄 *Quotes*', 'Choose', [{
      title: 'Quotes', rows: [
        { id: 'new_quote', title: '✨ Create New Quote', description: 'Build a new quote' },
        { id: 'menu_quotes', title: '📋 All Quotes', description: 'Recent quotes' },
        { id: 'menu_qpending', title: '⏳ Open Quotes', description: 'Draft/sent quotes' },
        { id: 'cancel', title: '⬅️ Back to menu' },
      ],
    }]);
  }

  private async showProductsMenu(tenant: any, to: string): Promise<void> {
    await this.sendList(tenant, to, '🛍️ *Products*', 'Choose', [{
      title: 'Products', rows: [
        { id: 'prod_list', title: '📋 List Products' },
        { id: 'prod_add', title: '➕ Add Product' },
        { id: 'prod_bulk', title: '📦 Bulk Add/Update', description: 'Download, edit & re-upload' },
        { id: 'prod_update', title: '✏️ Update Product' },
        { id: 'prod_delete', title: '🗑️ Delete Product' },
        { id: 'cat_categories', title: '🏷️ Categories', description: 'List & add categories' },
        { id: 'cat_brands', title: '🔖 Brands', description: 'List & add brands' },
        { id: 'cancel', title: '⬅️ Back to menu' },
      ],
    }]);
  }

  // ─── Command router (interactive taps) ──────────────────────────────────────
  private async handleCommand(tenant: any, to: string, id: string): Promise<void> {
    // Category submenus
    if (id === 'cat_orders') return this.showOrdersMenu(tenant, to);
    if (id === 'cat_quotes') return this.showQuotesMenu(tenant, to);
    if (id === 'cat_products') return this.showProductsMenu(tenant, to);

    if (id === 'new_order') return this.createBuilderLink(tenant, to, 'order');
    if (id === 'new_quote') return this.createBuilderLink(tenant, to, 'quote');
    if (id === 'menu_orders') return this.listOrders(tenant, to, false);
    if (id === 'menu_pending') return this.listOrders(tenant, to, true);
    if (id === 'menu_quotes') return this.listQuotes(tenant, to, false);
    if (id === 'menu_qpending') return this.listQuotes(tenant, to, true);
    if (id === 'menu_summary') return this.showSummary(tenant, to);
    if (id === 'menu_payments') return this.listPayments(tenant, to);
    if (id === 'menu_customers') return this.listCustomers(tenant, to);
    if (id === 'menu_lowstock') return this.listLowStock(tenant, to);
    if (id === 'menu_help') return this.showHelp(tenant, to);
    if (id === 'prod_list') return this.listProducts(tenant, to);
    if (id === 'prod_add') return this.startAddProduct(tenant, to);
    if (id === 'prod_bulk') return this.createBulkLink(tenant, to);
    if (id === 'cat_categories') return this.showTaxonomy(tenant, to, 'category');
    if (id === 'cat_brands') return this.showTaxonomy(tenant, to, 'brand');
    if (id === 'new_category') return this.startAddTaxonomy(tenant, to, 'category');
    if (id === 'new_brand') return this.startAddTaxonomy(tenant, to, 'brand');
    if (id === 'prod_update') return this.listProductsForAction(tenant, to, 'pupd', 'Select a product to update');
    if (id === 'prod_delete') return this.listProductsForAction(tenant, to, 'pdel', 'Select a product to delete');

    if (id.startsWith('order_')) return this.showOrder(tenant, to, id.slice('order_'.length));
    if (id.startsWith('ostatus_')) {
      const rest = id.slice('ostatus_'.length);
      const sep = rest.lastIndexOf('_');
      return this.updateOrderStatus(tenant, to, rest.slice(0, sep), rest.slice(sep + 1));
    }
    if (id.startsWith('quote_')) return this.showQuote(tenant, to, id.slice('quote_'.length));
    if (id.startsWith('qstatus_')) {
      const rest = id.slice('qstatus_'.length);
      const sep = rest.lastIndexOf('_');
      return this.updateQuoteStatus(tenant, to, rest.slice(0, sep), rest.slice(sep + 1));
    }
    if (id.startsWith('pupd_')) return this.askUpdateField(tenant, to, id.slice('pupd_'.length));
    if (id.startsWith('pupdf_')) {
      const rest = id.slice('pupdf_'.length);
      const sep = rest.lastIndexOf('_');
      return this.askUpdateValue(tenant, to, rest.slice(0, sep), rest.slice(sep + 1));
    }
    if (id.startsWith('pdel_')) return this.confirmDeleteProduct(tenant, to, id.slice('pdel_'.length));
    if (id.startsWith('pdely_')) return this.doDeleteProduct(tenant, to, id.slice('pdely_'.length));
    if (id.startsWith('inv_')) {
      const rest = id.slice('inv_'.length);
      for (const dt of ['tax_invoice', 'bill_of_supply', 'delivery_challan'] as DocType[]) {
        if (rest.endsWith(`_${dt}`)) return this.issueInvoice(tenant, to, rest.slice(0, -(dt.length + 1)), dt);
      }
    }
    if (id === 'invskip') return this.send(tenant, to, '👍 No document issued.\n\nSend *menu* for more.');
    if (id === 'pdeln' || id === 'cancel') return this.showMainMenu(tenant, to);

    return this.showMainMenu(tenant, to);
  }

  // ─── Orders ─────────────────────────────────────────────────────────────────
  private async listOrders(tenant: any, to: string, pendingOnly: boolean): Promise<void> {
    const orders = await this.query(tenant.schemaName, async (qr) =>
      qr.query(
        pendingOnly
          ? `SELECT id, order_number, status, total, currency FROM orders
             WHERE status IN ('pending','placed','confirmed','processing') ORDER BY created_at DESC LIMIT 10`
          : `SELECT id, order_number, status, total, currency FROM orders ORDER BY created_at DESC LIMIT 10`,
      ),
    );
    if (!orders.length) {
      return this.send(tenant, to, pendingOnly ? '✅ No pending orders.\n\nSend *menu* to go back.' : '📦 No orders yet.\n\nSend *menu* to go back.');
    }

    const rows = orders.map((o: any) => ({
      id: `order_${o.id}`,
      title: `#${o.order_number} · ${this.titleCase(o.status)}`.substring(0, 24),
      description: `${o.currency || '₹'}${o.total}`,
    }));
    await this.sendList(tenant, to, `📦 *${pendingOnly ? 'Pending Orders' : 'Recent Orders'}*\nTap one to view & change status.`, 'View order', [
      { title: 'Orders', rows },
    ]);
  }

  // ─── Quotes ─────────────────────────────────────────────────────────────────
  private async listQuotes(tenant: any, to: string, openOnly: boolean): Promise<void> {
    const quotes = await this.query(tenant.schemaName, async (qr) =>
      qr.query(
        openOnly
          ? `SELECT id, quote_number, status, total_amount FROM quotes
             WHERE status IN ('draft','sent') ORDER BY created_at DESC LIMIT 10`
          : `SELECT id, quote_number, status, total_amount FROM quotes ORDER BY created_at DESC LIMIT 10`,
      ),
    );
    if (!quotes.length) return this.send(tenant, to, openOnly ? '✅ No open quotes.\n\nSend *menu* to go back.' : '📄 No quotes yet.\n\nSend *menu* to go back.');
    const rows = quotes.map((q: any) => ({
      id: `quote_${q.id}`,
      title: `#${q.quote_number} · ${this.titleCase(q.status)}`.substring(0, 24),
      description: `₹${q.total_amount}`,
    }));
    await this.sendList(tenant, to, `📄 *${openOnly ? 'Open Quotes' : 'Recent Quotes'}*\nTap one to view & update.`, 'View quote', [
      { title: 'Quotes', rows },
    ]);
  }

  private async showQuote(tenant: any, to: string, quoteId: string): Promise<void> {
    const result = await this.query(tenant.schemaName, async (qr) => {
      const q = (await qr.query(`SELECT * FROM quotes WHERE id = $1`, [quoteId]))[0];
      if (!q) return null;
      const items = await qr.query(
        `SELECT description, quantity, line_total FROM quote_items WHERE quote_id = $1 ORDER BY sort_order`,
        [quoteId],
      );
      return { q, items };
    });
    if (!result) return this.send(tenant, to, 'Quote not found. Send *menu*.');
    const { q, items } = result;
    const lines = items.map((i: any) => `• ${i.description} ×${i.quantity} — ₹${i.line_total}`).join('\n');
    const body = `📄 *Quote #${q.quote_number}*\n${q.title ? q.title + '\n' : ''}Status: *${this.titleCase(q.status)}*\n\n${lines || 'No items'}\n\n*Total: ₹${q.total_amount}*`;
    await this.sendList(tenant, to, body, 'Update status',
      [{ title: 'Set status to', rows: this.QUOTE_STATUSES.map((s) => ({ id: `qstatus_${q.id}_${s.id}`, title: s.title })) }]);
  }

  private async updateQuoteStatus(tenant: any, to: string, quoteId: string, status: string): Promise<void> {
    const valid = this.QUOTE_STATUSES.map((s) => s.id);
    if (!valid.includes(status)) return this.send(tenant, to, 'Invalid status. Send *menu*.');
    const updated = await this.query(tenant.schemaName, async (qr) => {
      const extra = status === 'sent' ? ', sent_at = NOW()'
        : status === 'accepted' ? ', accepted_at = NOW()'
          : status === 'converted' ? ', converted_at = NOW()'
            : '';
      const rows = await qr.query(
        `UPDATE quotes SET status = $1, updated_at = NOW()${extra} WHERE id = $2 RETURNING quote_number`,
        [status, quoteId],
      );
      return rows[0];
    });
    if (!updated) return this.send(tenant, to, 'Quote not found. Send *menu*.');
    await this.send(tenant, to, `✅ Quote #${updated.quote_number} is now *${this.titleCase(status)}*.\n\nSend *menu* for more.`);
  }

  // ─── Customers & low stock ──────────────────────────────────────────────────
  private async listCustomers(tenant: any, to: string): Promise<void> {
    const customers = await this.query(tenant.schemaName, async (qr) =>
      qr.query(
        `SELECT name, phone, total_orders, total_spent FROM customers ORDER BY total_spent DESC NULLS LAST LIMIT 10`,
      ),
    );
    if (!customers.length) return this.send(tenant, to, '👥 No customers yet. Send *menu*.');
    const lines = customers
      .map((c: any) => `• *${c.name || c.phone}* — ${c.total_orders || 0} orders · ₹${c.total_spent || 0}`)
      .join('\n');
    await this.send(tenant, to, `👥 *Top Customers*\n\n${lines}\n\nSend *menu* to go back.`);
  }

  private async listLowStock(tenant: any, to: string): Promise<void> {
    const items = await this.query(tenant.schemaName, async (qr) =>
      qr.query(
        `SELECT p.name, i.stock_quantity AS stock, i.low_stock_threshold AS threshold
         FROM inventory i JOIN products p ON p.id = i.product_id
         WHERE i.track_inventory = true AND i.stock_quantity <= i.low_stock_threshold
         ORDER BY i.stock_quantity ASC LIMIT 15`,
      ),
    );
    if (!items.length) return this.send(tenant, to, '✅ All items are well stocked.\n\nSend *menu* to go back.');
    const lines = items.map((i: any) => `• *${i.name}* — ${i.stock} left (≤ ${i.threshold})`).join('\n');
    await this.send(tenant, to, `📉 *Low Stock*\n\n${lines}\n\nUse *✏️ Update Product → Stock* to restock.\nSend *menu* to go back.`);
  }

  private async showOrder(tenant: any, to: string, orderId: string): Promise<void> {
    const result = await this.query(tenant.schemaName, async (qr) => {
      const o = (await qr.query(`SELECT * FROM orders WHERE id = $1`, [orderId]))[0];
      if (!o) return null;
      const items = await qr.query(
        `SELECT product_name, quantity, total_price FROM order_items WHERE order_id = $1`,
        [orderId],
      );
      return { o, items };
    });
    if (!result) return this.send(tenant, to, 'Order not found. Send *menu*.');

    const { o, items } = result;
    const lines = items.map((i: any) => `• ${i.product_name} ×${i.quantity} — ${o.currency || '₹'}${i.total_price}`).join('\n');
    const body = `📦 *Order #${o.order_number}*\nStatus: *${this.titleCase(o.status)}*\n\n${lines || 'No items'}\n\n*Total: ${o.currency || '₹'}${o.total}*`;

    await this.sendList(tenant, to, body, 'Update status',
      [{ title: 'Set status to', rows: this.ORDER_STATUSES.map((s) => ({ id: `ostatus_${o.id}_${s.id}`, title: s.title })) }]);
  }

  private async updateOrderStatus(tenant: any, to: string, orderId: string, status: string): Promise<void> {
    const valid = this.ORDER_STATUSES.map((s) => s.id);
    if (!valid.includes(status)) return this.send(tenant, to, 'Invalid status. Send *menu*.');

    const updated = await this.query(tenant.schemaName, async (qr) => {
      const extra =
        status === 'confirmed' ? ', confirmed_at = NOW()'
          : status === 'delivered' ? ', delivered_at = NOW()'
            : '';
      const rows = await qr.query(
        `UPDATE orders SET status = $1, updated_at = NOW()${extra} WHERE id = $2 RETURNING order_number`,
        [status, orderId],
      );
      return rows[0];
    });
    if (!updated) return this.send(tenant, to, 'Order not found. Send *menu*.');

    // On confirmation, offer to generate a billing document for the order.
    if (status === 'confirmed' && this.invoiceService) {
      await this.send(tenant, to, `✅ Order #${updated.order_number} is now *Confirmed*.`);
      await this.sendButtons(tenant, to, '🧾 Generate a document for this order?', [
        { id: `inv_${orderId}_tax_invoice`, title: '🧾 GST Invoice' },
        { id: `inv_${orderId}_bill_of_supply`, title: '📄 Bill of Supply' },
        { id: `inv_${orderId}_delivery_challan`, title: '🚚 Delivery Memo' },
      ]);
      return;
    }
    await this.send(tenant, to, `✅ Order #${updated.order_number} is now *${this.titleCase(status)}*.\n\nSend *menu* for more.`);
  }

  /** Generate the chosen billing document, send it to the customer, and show the admin a copy. */
  private async issueInvoice(tenant: any, to: string, orderId: string, docType: DocType): Promise<void> {
    if (!this.invoiceService) return this.send(tenant, to, 'Invoicing is not available right now.');
    const res = await this.invoiceService.generateAndSend(tenant, orderId, docType);
    if (!res.ok) return this.send(tenant, to, `⚠️ ${res.reason || 'Could not generate the document.'}\n\nSend *menu* for more.`);
    // Send the admin the PDF copy too.
    if (res.pdfMediaId) {
      await this.whatsappApi.sendDocument(tenant.phoneNumberId, tenant.accessToken, to, { id: res.pdfMediaId }, res.pdfFilename || 'invoice.pdf', `${res.invoiceNumber}`).catch(() => undefined);
    }
    await this.send(tenant, to, `✅ Generated *${res.invoiceNumber}* and sent it to the customer.\n\n${res.text}\n\nSend *menu* for more.`);
  }

  // ─── Products ───────────────────────────────────────────────────────────────
  private async listProducts(tenant: any, to: string): Promise<void> {
    const products = await this.productsWithStock(tenant.schemaName, 20);
    if (!products.length) return this.send(tenant, to, '🛍️ No products yet. Use *➕ Add Product* from the menu.');
    const lines = products
      .map((p: any) => `• *${p.name}* — ${p.currency || '₹'}${p.price}${p.track ? ` · stock ${p.stock}` : ''}${p.is_active ? '' : ' (inactive)'}`)
      .join('\n');
    await this.send(tenant, to, `🛍️ *Products* (${products.length})\n\n${lines}\n\nSend *menu* to go back.`);
  }

  private async listProductsForAction(tenant: any, to: string, prefix: string, body: string): Promise<void> {
    const products = await this.productsWithStock(tenant.schemaName, 10);
    if (!products.length) return this.send(tenant, to, 'No products yet. Use *➕ Add Product*.');
    const rows = products.map((p: any) => ({
      id: `${prefix}_${p.id}`,
      title: p.name.substring(0, 24),
      description: `${p.currency || '₹'}${p.price}${p.track ? ` · stock ${p.stock}` : ''}`,
    }));
    await this.sendList(tenant, to, body, 'Select product', [{ title: 'Products', rows }]);
  }

  // — Add product (multi-step) —
  private async startAddProduct(tenant: any, to: string): Promise<void> {
    await this.setState(tenant.schemaName, to, { flow: 'add_product', step: 'name', data: {} });
    await this.send(tenant, to, '➕ *Add Product*\n\nSend the *product name*.\n(Send *menu* anytime to cancel.)');
  }

  private async askUpdateField(tenant: any, to: string, productId: string): Promise<void> {
    await this.sendList(tenant, to, 'What would you like to change?', 'Choose field', [
      {
        title: 'Field',
        rows: [
          { id: `pupdf_${productId}_price`, title: '💰 Price' },
          { id: `pupdf_${productId}_stock`, title: '📦 Stock' },
          { id: `pupdf_${productId}_name`, title: '🏷️ Name' },
        ],
      },
    ]);
  }

  private async askUpdateValue(tenant: any, to: string, productId: string, field: string): Promise<void> {
    await this.setState(tenant.schemaName, to, { flow: 'update_product', step: 'value', data: { productId, field } });
    const prompt = field === 'price' ? 'Send the new *price* (number).'
      : field === 'stock' ? 'Send the new *stock quantity* (number).'
        : 'Send the new *name*.';
    await this.send(tenant, to, `✏️ ${prompt}\n(Send *menu* to cancel.)`);
  }

  private async confirmDeleteProduct(tenant: any, to: string, productId: string): Promise<void> {
    const p = await this.query(tenant.schemaName, async (qr) =>
      (await qr.query(`SELECT name FROM products WHERE id = $1`, [productId]))[0]);
    if (!p) return this.send(tenant, to, 'Product not found. Send *menu*.');
    await this.sendButtons(tenant, to, `🗑️ Delete *${p.name}*? This can’t be undone.`, [
      { id: `pdely_${productId}`, title: 'Yes, delete' },
      { id: 'pdeln', title: 'Cancel' },
    ]);
  }

  private async doDeleteProduct(tenant: any, to: string, productId: string): Promise<void> {
    const p = await this.query(tenant.schemaName, async (qr) => {
      const row = (await qr.query(`SELECT name FROM products WHERE id = $1`, [productId]))[0];
      if (!row) return null;
      await qr.query(`DELETE FROM inventory WHERE product_id = $1`, [productId]);
      await qr.query(`DELETE FROM products WHERE id = $1`, [productId]);
      return row;
    });
    if (!p) return this.send(tenant, to, 'Product not found. Send *menu*.');
    await this.send(tenant, to, `🗑️ Deleted *${p.name}*.\n\nSend *menu* for more.`);
  }

  // ─── Multi-step text input ──────────────────────────────────────────────────
  private async handleStateInput(tenant: any, to: string, state: AdminState, text: string): Promise<void> {
    const schema = tenant.schemaName;

    if (state.flow === 'add_product') {
      if (state.step === 'name') {
        if (!text) return this.send(tenant, to, 'Please send a product name.');
        state.data.name = text.substring(0, 200);
        state.step = 'price';
        await this.setState(schema, to, state);
        return this.send(tenant, to, `Got it. Now send the *price* for *${state.data.name}* (number).`);
      }
      if (state.step === 'price') {
        const price = this.parseNumber(text);
        if (price === null) return this.send(tenant, to, 'Please send a valid price, e.g. 199');
        state.data.price = price;
        state.step = 'stock';
        await this.setState(schema, to, state);
        return this.send(tenant, to, 'And the *stock quantity* (number, send 0 if not tracking).');
      }
      if (state.step === 'stock') {
        const stock = this.parseNumber(text);
        if (stock === null) return this.send(tenant, to, 'Please send a valid quantity, e.g. 25');
        await this.clearState(schema, to);
        const name = await this.createProduct(schema, state.data.name, state.data.price, stock);
        return this.send(tenant, to, `✅ Added *${name}* — ${tenant.currency || '₹'}${state.data.price}, stock ${stock}.\n\nSend *menu* for more.`);
      }
    }

    if (state.flow === 'update_product') {
      const { productId, field } = state.data;
      if (field === 'price' || field === 'stock') {
        const val = this.parseNumber(text);
        if (val === null) return this.send(tenant, to, `Please send a valid ${field} (number).`);
        await this.clearState(schema, to);
        const name = await this.updateProductField(schema, productId, field, val);
        if (!name) return this.send(tenant, to, 'Product not found. Send *menu*.');
        return this.send(tenant, to, `✅ Updated *${name}* — ${field} set to ${val}.\n\nSend *menu* for more.`);
      }
      // name
      if (!text) return this.send(tenant, to, 'Please send a name.');
      await this.clearState(schema, to);
      const name = await this.updateProductField(schema, productId, 'name', text.substring(0, 200));
      if (!name) return this.send(tenant, to, 'Product not found. Send *menu*.');
      return this.send(tenant, to, `✅ Renamed to *${text}*.\n\nSend *menu* for more.`);
    }

    if (state.flow === 'add_category' || state.flow === 'add_brand') {
      const kind: 'category' | 'brand' = state.flow === 'add_category' ? 'category' : 'brand';
      if (!text) return this.send(tenant, to, `Please send a ${kind} name.`);
      await this.clearState(schema, to);
      await this.createTaxonomy(schema, kind, text.substring(0, 120));
      await this.send(tenant, to, `✅ Added ${kind} *${text}*.`);
      return this.showTaxonomy(tenant, to, kind);
    }

    await this.clearState(schema, to);
    return this.showMainMenu(tenant, to);
  }

  // ─── Payments & summary ─────────────────────────────────────────────────────
  private async listPayments(tenant: any, to: string): Promise<void> {
    const payments = await this.query(tenant.schemaName, async (qr) =>
      qr.query(
        `SELECT p.amount, p.currency, p.method, p.status, o.order_number
         FROM payments p LEFT JOIN orders o ON o.id = p.order_id
         ORDER BY p.created_at DESC LIMIT 10`,
      ),
    );
    if (!payments.length) return this.send(tenant, to, '💳 No payments yet. Send *menu*.');
    const lines = payments
      .map((p: any) => `• ${p.currency || '₹'}${p.amount} · ${this.titleCase(p.method || '')} · *${this.titleCase(p.status)}*${p.order_number ? ` · #${p.order_number}` : ''}`)
      .join('\n');
    await this.send(tenant, to, `💳 *Recent Payments*\n\n${lines}\n\nSend *menu* to go back.`);
  }

  private async showSummary(tenant: any, to: string): Promise<void> {
    const s = await this.query(tenant.schemaName, async (qr) => {
      const today = (await qr.query(
        `SELECT COUNT(*)::int AS orders, COALESCE(SUM(total),0) AS revenue
         FROM orders WHERE created_at::date = CURRENT_DATE`,
      ))[0];
      const pending = (await qr.query(
        `SELECT COUNT(*)::int AS c FROM orders WHERE status IN ('pending','placed','confirmed','processing')`,
      ))[0];
      const lowStock = (await qr.query(
        `SELECT COUNT(*)::int AS c FROM inventory WHERE track_inventory = true AND stock_quantity <= low_stock_threshold`,
      ))[0];
      return { today, pending: pending.c, lowStock: lowStock.c };
    });
    await this.send(
      tenant, to,
      `📊 *Today's Summary*\n\n• Orders today: *${s.today.orders}*\n• Revenue today: *${tenant.currency || '₹'}${s.today.revenue}*\n• Open orders: *${s.pending}*\n• Low-stock items: *${s.lowStock}*\n\nSend *menu* for actions.`,
    );
  }

  // ─── Data helpers ───────────────────────────────────────────────────────────
  private async productsWithStock(schema: string, limit: number): Promise<any[]> {
    return this.query(schema, async (qr) =>
      qr.query(
        `SELECT p.id, p.name, p.is_active, p.currency,
                COALESCE(p.sale_price, p.base_price) AS price,
                i.stock_quantity AS stock, COALESCE(i.track_inventory, false) AS track
         FROM products p LEFT JOIN inventory i ON i.product_id = p.id
         ORDER BY p.created_at DESC LIMIT $1`,
        [limit],
      ),
    );
  }

  private async createProduct(schema: string, name: string, price: number, stock: number): Promise<string> {
    return this.query(schema, async (qr) => {
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60) || 'product'}-${Math.floor(Math.random() * 100000)}`;
      const prod = (await qr.query(
        `INSERT INTO products (name, slug, base_price, currency, is_active)
         VALUES ($1, $2, $3, 'INR', true) RETURNING id, name`,
        [name, slug, price],
      ))[0];
      await qr.query(
        `INSERT INTO inventory (product_id, stock_quantity, track_inventory)
         VALUES ($1, $2, $3)`,
        [prod.id, stock, stock > 0],
      );
      return prod.name;
    });
  }

  private async updateProductField(schema: string, productId: string, field: string, value: any): Promise<string | null> {
    return this.query(schema, async (qr) => {
      const p = (await qr.query(`SELECT name FROM products WHERE id = $1`, [productId]))[0];
      if (!p) return null;
      if (field === 'price') {
        await qr.query(`UPDATE products SET base_price = $1, updated_at = NOW() WHERE id = $2`, [value, productId]);
      } else if (field === 'name') {
        await qr.query(`UPDATE products SET name = $1, updated_at = NOW() WHERE id = $2`, [value, productId]);
        return value;
      } else if (field === 'stock') {
        const exists = (await qr.query(`SELECT id FROM inventory WHERE product_id = $1`, [productId]))[0];
        if (exists) {
          await qr.query(`UPDATE inventory SET stock_quantity = $1, track_inventory = true, updated_at = NOW() WHERE product_id = $2`, [value, productId]);
        } else {
          await qr.query(`INSERT INTO inventory (product_id, stock_quantity, track_inventory) VALUES ($1, $2, true)`, [productId, value]);
        }
      }
      return p.name;
    });
  }

  // ─── Low-level helpers ──────────────────────────────────────────────────────
  private parseReply(message: any): { id?: string; text?: string } {
    if (message.type === 'interactive') {
      const i = message.interactive;
      if (i?.button_reply) return { id: i.button_reply.id, text: i.button_reply.title };
      if (i?.list_reply) return { id: i.list_reply.id, text: i.list_reply.title };
    }
    if (message.type === 'text') return { text: message.text?.body };
    return {};
  }

  private parseNumber(text: string): number | null {
    const n = Number(String(text).replace(/[^0-9.]/g, ''));
    return isNaN(n) ? null : n;
  }

  private titleCase(s: string): string {
    return (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private query<T = any>(schema: string, fn: (qr: any) => Promise<T>): Promise<T> {
    return this.connectionManager.executeInTenantContext(schema, fn);
  }

  /** Mint a Builder session and send the admin a CTA URL button to open it. */
  private async createBuilderLink(tenant: any, to: string, type: 'order' | 'quote'): Promise<void> {
    try {
      const { url } = await this.builder.createSession({
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        type,
        createdBy: to,
      });
      const label = type === 'quote' ? 'Quote' : 'Order';
      await this.whatsappApi.sendCtaUrl(
        tenant.phoneNumberId,
        tenant.accessToken,
        to,
        `✨ *Create New ${label}*\n\nTap below to open the builder — pick products, set quantity & price, then submit. This link works for 2 hours.`,
        `Open ${label} Builder`,
        url,
      );
    } catch (err: any) {
      this.logger.error(`createBuilderLink failed: ${err.message}`);
      await this.send(tenant, to, '⚠️ Could not open the builder right now. Send *menu* and try again.');
    }
  }

  // ─── Categories & Brands ────────────────────────────────────────────────────
  private async showTaxonomy(tenant: any, to: string, kind: 'category' | 'brand'): Promise<void> {
    const table = kind === 'category' ? 'categories' : 'brands';
    const label = kind === 'category' ? 'Categories' : 'Brands';
    const rows = await this.query(tenant.schemaName, async (qr) =>
      qr.query(`SELECT name FROM ${table} WHERE is_active = true ORDER BY sort_order, name LIMIT 50`));
    const list = rows.length ? rows.map((r: any, i: number) => `${i + 1}. ${r.name}`).join('\n') : '_None yet._';
    await this.sendButtons(tenant, to, `🏷️ *${label}*\n\n${list}`, [
      { id: kind === 'category' ? 'new_category' : 'new_brand', title: `➕ Add ${kind === 'category' ? 'Category' : 'Brand'}` },
    ]);
  }

  private async startAddTaxonomy(tenant: any, to: string, kind: 'category' | 'brand'): Promise<void> {
    await this.setState(tenant.schemaName, to, {
      flow: kind === 'category' ? 'add_category' : 'add_brand',
      step: 'name',
      data: {},
    });
    await this.send(tenant, to, `Send the new ${kind} *name*.\n(Send *menu* to cancel.)`);
  }

  private async createTaxonomy(schema: string, kind: 'category' | 'brand', name: string): Promise<void> {
    const table = kind === 'category' ? 'categories' : 'brands';
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await this.query(schema, async (qr) => {
      const dup = await qr.query(`SELECT 1 FROM ${table} WHERE slug = $1 LIMIT 1`, [base]);
      const slug = dup.length ? `${base}-${Date.now().toString(36)}` : base;
      if (kind === 'category') {
        await qr.query(`INSERT INTO categories (name, slug, sort_order, translations) VALUES ($1, $2, 0, '{}')`, [name, slug]);
      } else {
        await qr.query(`INSERT INTO brands (name, slug, sort_order) VALUES ($1, $2, 0)`, [name, slug]);
      }
    });
  }

  /** Mint a bulk-products session and send the admin a CTA URL button. */
  private async createBulkLink(tenant: any, to: string): Promise<void> {
    try {
      const { url } = await this.builder.createBulkSession({
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        createdBy: to,
      });
      await this.whatsappApi.sendCtaUrl(
        tenant.phoneNumberId,
        tenant.accessToken,
        to,
        '📦 *Bulk Products*\n\nTap below to download all your products, edit prices/stock or add new ones, then upload to update everything at once. This link works for 2 hours.',
        'Open Bulk Editor',
        url,
      );
    } catch (err: any) {
      this.logger.error(`createBulkLink failed: ${err.message}`);
      await this.send(tenant, to, '⚠️ Could not open the bulk editor right now. Send *menu* and try again.');
    }
  }

  private async send(tenant: any, to: string, text: string): Promise<void> {
    await this.whatsappApi.sendTextMessage(tenant.phoneNumberId, tenant.accessToken, to, text);
  }

  private async sendButtons(tenant: any, to: string, body: string, buttons: { id: string; title: string }[]): Promise<void> {
    await this.whatsappApi.sendInteractiveButtons(tenant.phoneNumberId, tenant.accessToken, to, body, buttons.slice(0, 3));
  }

  private async sendList(
    tenant: any, to: string, body: string, buttonText: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
  ): Promise<void> {
    await this.whatsappApi.sendInteractiveList(tenant.phoneNumberId, tenant.accessToken, to, body, buttonText, sections);
  }

  private stateKey(schema: string, phone: string): string {
    return `admin:cmd:${schema}:${phone}`;
  }
  private async getState(schema: string, phone: string): Promise<AdminState | null> {
    try { const v = await this.redis.get(this.stateKey(schema, phone)); return v ? JSON.parse(v) : null; } catch { return null; }
  }
  private async setState(schema: string, phone: string, state: AdminState): Promise<void> {
    try { await this.redis.set(this.stateKey(schema, phone), JSON.stringify(state), 'EX', this.STATE_TTL); } catch {}
  }
  private async clearState(schema: string, phone: string): Promise<void> {
    try { await this.redis.del(this.stateKey(schema, phone)); } catch {}
  }
}
