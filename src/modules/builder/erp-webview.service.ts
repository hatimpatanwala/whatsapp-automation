import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { BuilderService } from './builder.service';
import { ErpInvoiceService } from '../erp/invoicing/erp-invoice.service';

/** Order statuses an admin can set from the console (mirrors the WhatsApp flow). */
const ORDER_STATUSES = ['confirmed', 'processing', 'ready_for_delivery', 'delivered', 'cancelled'];

/**
 * Backs the ERP Console webview (`/m/erp`) — the token-authenticated mobile
 * admin app opened from WhatsApp. It reads/writes the tenant's ERP data (orders,
 * invoices, catalog, customers, dashboard) after validating the `erp` session
 * token. Reuses ErpInvoiceService for invoice reads + payments so the numbers
 * stay identical to the panel; everything else is raw parameterised SQL through
 * the schema-per-tenant connection manager.
 */
@Injectable()
export class ErpWebviewService {
  constructor(
    private readonly builder: BuilderService,
    private readonly cm: TenantConnectionManager,
    private readonly erpInvoices: ErpInvoiceService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  private async ctx(token: string): Promise<{ schema: string; tenantId: string }> {
    const { schemaName, tenantId } = await this.builder.getErpSession(token);
    return { schema: schemaName, tenantId };
  }

  private q<T = any>(schema: string, fn: (qr: any) => Promise<T>): Promise<T> {
    return this.cm.executeInTenantContext(schema, fn);
  }

  // ── Session + dashboard ─────────────────────────────────────────────────────

  async session(token: string): Promise<any> {
    const { schema, tenantId } = await this.ctx(token);
    const store = (await this.ds.query(`SELECT name FROM public.tenants WHERE id = $1`, [tenantId]))[0];
    return this.q(schema, async (qr) => {
      const symbol =
        (await qr.query(`SELECT symbol FROM erp_currencies WHERE is_base = true LIMIT 1`).catch(() => []))[0]?.symbol ||
        '₹';
      const counts = (await qr.query(`SELECT
          (SELECT COUNT(*)::int FROM orders WHERE status NOT IN ('delivered','cancelled')) AS open_orders,
          (SELECT COUNT(*)::int FROM invoices WHERE year IS NOT NULL AND payment_status <> 'paid') AS unpaid_invoices,
          (SELECT COUNT(*)::int FROM inventory WHERE track_inventory = true AND stock_quantity <= low_stock_threshold) AS low_stock`))[0];
      return { store: store?.name || 'My Store', currency: symbol, counts };
    });
  }

  async dashboard(token: string): Promise<any> {
    const { schema } = await this.ctx(token);
    return this.q(schema, async (qr) => {
      const symbol =
        (await qr.query(`SELECT symbol FROM erp_currencies WHERE is_base = true LIMIT 1`).catch(() => []))[0]?.symbol ||
        '₹';
      const recv = (await qr.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(balance_due * exchange_rate),0)::float AS amt
           FROM invoices WHERE year IS NOT NULL AND payment_status <> 'paid'`,
      ))[0];
      const salesToday = (await qr.query(
        `SELECT COALESCE(SUM(base_total),0)::float AS amt, COUNT(*)::int AS n
           FROM invoices WHERE year IS NOT NULL AND issued_at::date = CURRENT_DATE`,
      ))[0];
      const salesMonth = (await qr.query(
        `SELECT COALESCE(SUM(base_total),0)::float AS amt
           FROM invoices WHERE year IS NOT NULL AND issued_at >= date_trunc('month', NOW())`,
      ))[0];
      const orders = (await qr.query(
        `SELECT COUNT(*)::int AS open FROM orders WHERE status NOT IN ('delivered','cancelled')`,
      ))[0];
      const lowStock = await qr.query(
        `SELECT p.name, i.stock_quantity AS stock
           FROM inventory i JOIN products p ON p.id = i.product_id
          WHERE i.track_inventory = true AND i.stock_quantity <= i.low_stock_threshold
          ORDER BY i.stock_quantity ASC LIMIT 8`,
      );
      const topProducts = await qr.query(
        `SELECT product_name AS name, SUM(quantity)::int AS qty, SUM(total_price)::float AS revenue
           FROM order_items GROUP BY product_name ORDER BY revenue DESC NULLS LAST LIMIT 5`,
      ).catch(() => []);
      return {
        currency: symbol,
        receivables: { count: recv.n, amount: recv.amt },
        salesToday: { count: salesToday.n, amount: salesToday.amt },
        salesThisMonth: salesMonth.amt,
        openOrders: orders.open,
        lowStock,
        topProducts,
      };
    });
  }

  // ── Orders ──────────────────────────────────────────────────────────────────

  async orders(token: string, status?: string): Promise<any[]> {
    const { schema } = await this.ctx(token);
    return this.q(schema, async (qr) => {
      const params: any[] = [];
      let where = '';
      if (status && status !== 'all') {
        if (status === 'open') {
          where = `WHERE o.status NOT IN ('delivered','cancelled')`;
        } else {
          where = `WHERE o.status = $1`;
          params.push(status);
        }
      }
      return qr.query(
        `SELECT o.id, o.order_number, o.status, o.total, o.currency, o.created_at,
                c.name AS customer_name, c.phone AS customer_phone
           FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
           ${where}
          ORDER BY o.created_at DESC LIMIT 50`,
        params,
      );
    });
  }

  async order(token: string, id: string): Promise<any> {
    const { schema } = await this.ctx(token);
    return this.q(schema, async (qr) => {
      const o = (await qr.query(
        `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
           FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = $1`,
        [id],
      ))[0];
      if (!o) throw new NotFoundException('Order not found');
      const items = await qr.query(
        `SELECT product_name, quantity, unit_price, total_price FROM order_items WHERE order_id = $1`,
        [id],
      );
      return { ...o, items };
    });
  }

  async setOrderStatus(token: string, id: string, status: string): Promise<any> {
    if (!ORDER_STATUSES.includes(status)) throw new BadRequestException('Invalid status');
    const { schema } = await this.ctx(token);
    return this.q(schema, async (qr) => {
      const extra =
        status === 'confirmed' ? ', confirmed_at = NOW()' : status === 'delivered' ? ', delivered_at = NOW()' : '';
      const row = (await qr.query(
        `UPDATE orders SET status = $1, updated_at = NOW()${extra} WHERE id = $2 RETURNING order_number, status`,
        [status, id],
      ))[0];
      if (!row) throw new NotFoundException('Order not found');
      return row;
    });
  }

  // ── Invoices (reuse ErpInvoiceService so panel + WhatsApp stay in sync) ──────

  async invoices(token: string, paymentStatus?: string): Promise<any> {
    const { schema } = await this.ctx(token);
    return this.erpInvoices.list(schema, { paymentStatus: paymentStatus || undefined, limit: 50 });
  }

  async invoice(token: string, id: string): Promise<any> {
    const { schema } = await this.ctx(token);
    return this.erpInvoices.findById(schema, id);
  }

  async paymentModes(token: string): Promise<any[]> {
    const { schema } = await this.ctx(token);
    return this.q(schema, async (qr) =>
      qr.query(`SELECT id, name, is_default FROM payment_modes WHERE enabled = true ORDER BY is_default DESC, name`),
    );
  }

  async payInvoice(
    token: string,
    id: string,
    body: { amount: number; paymentModeId?: string; ref?: string },
  ): Promise<any> {
    const { schema } = await this.ctx(token);
    return this.erpInvoices.recordPayment(schema, id, {
      amount: Number(body?.amount),
      paymentModeId: body?.paymentModeId || undefined,
      ref: body?.ref || undefined,
    });
  }

  // ── Catalog / products ──────────────────────────────────────────────────────

  async products(token: string, search?: string): Promise<any[]> {
    const { schema } = await this.ctx(token);
    const term = (search || '').trim();
    return this.q(schema, async (qr) => {
      const params: any[] = [];
      let where = 'WHERE 1=1';
      if (term) {
        where += ` AND (p.name ILIKE $1 OR p.slug ILIKE $1)`;
        params.push(`%${term}%`);
      }
      return qr.query(
        `SELECT p.id, p.name, p.slug AS sku, p.is_active, p.currency,
                COALESCE(p.sale_price, p.base_price) AS price, p.base_price,
                b.name AS brand,
                COALESCE(i.stock_quantity, 0) AS stock, COALESCE(i.track_inventory, false) AS track
           FROM products p
           LEFT JOIN inventory i ON i.product_id = p.id AND i.variant_id IS NULL
           LEFT JOIN brands b ON b.id = p.brand_id
           ${where}
          ORDER BY p.created_at DESC LIMIT 60`,
        params,
      );
    });
  }

  /** Update a product's price / name / active flag and/or stock. */
  async updateProduct(
    token: string,
    id: string,
    patch: { name?: string; price?: number; stock?: number; active?: boolean },
  ): Promise<any> {
    const { schema } = await this.ctx(token);
    return this.q(schema, async (qr) => {
      const exists = (await qr.query(`SELECT id FROM products WHERE id = $1`, [id]))[0];
      if (!exists) throw new NotFoundException('Product not found');

      const sets: string[] = [];
      const params: any[] = [];
      let p = 1;
      if (patch.name != null && String(patch.name).trim()) { sets.push(`name = $${p++}`); params.push(String(patch.name).trim()); }
      if (patch.price != null && !isNaN(Number(patch.price))) { sets.push(`base_price = $${p++}`); params.push(Number(patch.price)); }
      if (patch.active != null) { sets.push(`is_active = $${p++}`); params.push(!!patch.active); }
      if (sets.length) {
        params.push(id);
        await qr.query(`UPDATE products SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${p}`, params);
      }

      if (patch.stock != null && !isNaN(Number(patch.stock))) {
        const stock = Number(patch.stock);
        const inv = (await qr.query(`SELECT id FROM inventory WHERE product_id = $1 AND variant_id IS NULL`, [id]))[0];
        if (inv) {
          await qr.query(
            `UPDATE inventory SET stock_quantity = $1, track_inventory = true, updated_at = NOW() WHERE product_id = $2 AND variant_id IS NULL`,
            [stock, id],
          );
        } else {
          await qr.query(
            `INSERT INTO inventory (product_id, stock_quantity, track_inventory) VALUES ($1, $2, true)`,
            [id, stock],
          );
        }
      }

      const row = (await qr.query(
        `SELECT p.id, p.name, p.is_active, p.currency, COALESCE(p.sale_price, p.base_price) AS price, p.base_price,
                COALESCE(i.stock_quantity, 0) AS stock, COALESCE(i.track_inventory, false) AS track
           FROM products p LEFT JOIN inventory i ON i.product_id = p.id AND i.variant_id IS NULL
          WHERE p.id = $1`,
        [id],
      ))[0];
      return row;
    });
  }

  // ── Customers (read) ────────────────────────────────────────────────────────

  async customers(token: string, search?: string): Promise<any[]> {
    const { schema } = await this.ctx(token);
    const term = (search || '').trim();
    return this.q(schema, async (qr) => {
      const params: any[] = [];
      let where = '';
      if (term) { where = `WHERE name ILIKE $1 OR phone ILIKE $1`; params.push(`%${term}%`); }
      return qr.query(
        `SELECT id, name, phone, COALESCE(total_spent, 0) AS total_spent, COALESCE(total_orders, 0) AS order_count, last_order_at
           FROM customers ${where}
          ORDER BY (last_order_at IS NULL), last_order_at DESC NULLS LAST, total_spent DESC NULLS LAST
          LIMIT 50`,
        params,
      );
    });
  }

  // ── Create actions: mint the focused builder/invoice webviews from the console ─

  async newBuilder(token: string, type: 'order' | 'quote'): Promise<{ url: string }> {
    const { schema, tenantId } = await this.ctx(token);
    const { url } = await this.builder.createSession({ tenantId, schemaName: schema, type });
    return { url };
  }

  async newInvoice(token: string): Promise<{ url: string }> {
    const { schema, tenantId } = await this.ctx(token);
    const { url } = await this.builder.createInvoiceSession({ tenantId, schemaName: schema });
    return { url };
  }
}
