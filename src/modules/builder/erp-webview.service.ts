import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { BuilderService } from './builder.service';
import { ErpInvoiceService } from '../erp/invoicing/erp-invoice.service';
import { buildEwayBillPdf } from '../erp/compliance/eway-pdf';

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
      const exists = (await qr.query(`SELECT id, sale_price FROM products WHERE id = $1`, [id]))[0];
      if (!exists) throw new NotFoundException('Product not found');

      const sets: string[] = [];
      const params: any[] = [];
      let p = 1;
      if (patch.name != null && String(patch.name).trim()) { sets.push(`name = $${p++}`); params.push(String(patch.name).trim()); }
      if (patch.price != null && !isNaN(Number(patch.price))) {
        // The catalog (and this editor's Price field) shows COALESCE(sale_price, base_price).
        // Write whichever column is actually displayed so the edit reflects: if a sale price
        // is set, update it; otherwise update base_price. Writing only base_price left an
        // existing sale_price masking the change, so the edit silently appeared to do nothing.
        const priceCol = exists.sale_price != null ? 'sale_price' : 'base_price';
        sets.push(`${priceCol} = $${p++}`); params.push(Number(patch.price));
      }
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

  async customers(token: string, search?: string, segment?: string): Promise<any[]> {
    const { schema } = await this.ctx(token);
    const term = (search || '').trim();
    return this.q(schema, async (qr) => {
      const params: any[] = [];
      const conds: string[] = [];
      if (term) { params.push(`%${term}%`); conds.push(`(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`); }
      let orderBy = `(c.last_order_at IS NULL), c.last_order_at DESC NULLS LAST, c.total_spent DESC NULLS LAST`;
      switch (segment) {
        case 'top': conds.push('c.total_spent > 0'); orderBy = 'c.total_spent DESC NULLS LAST'; break;
        case 'repeat': conds.push('c.total_orders > 1'); orderBy = 'c.total_orders DESC'; break;
        case 'new': conds.push(`c.created_at >= NOW() - INTERVAL '30 days'`); orderBy = 'c.created_at DESC'; break;
        case 'inactive': conds.push(`(c.last_order_at IS NULL OR c.last_order_at < NOW() - INTERVAL '60 days')`); orderBy = 'c.last_order_at ASC NULLS FIRST'; break;
        case 'dues': conds.push(`EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = c.id AND i.year IS NOT NULL AND i.balance_due > 0)`); orderBy = 'c.total_spent DESC NULLS LAST'; break;
        default: break; // 'all'
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return qr.query(
        `SELECT c.id, c.name, c.phone, COALESCE(c.total_spent, 0) AS total_spent, COALESCE(c.total_orders, 0) AS order_count, c.last_order_at
           FROM customers c ${where}
          ORDER BY ${orderBy}
          LIMIT 60`,
        params,
      );
    });
  }

  /** Full customer view for the console — profile + ledger + recent orders & invoices. */
  async customerDetail(token: string, id: string): Promise<any> {
    const { schema } = await this.ctx(token);
    return this.q(schema, async (qr) => {
      const customer = (await qr.query(
        `SELECT id, name, phone, COALESCE(total_spent, 0) AS total_spent, COALESCE(total_orders, 0) AS order_count, last_order_at
           FROM customers WHERE id = $1`,
        [id],
      ))[0];
      if (!customer) throw new NotFoundException('Customer not found');
      const symbol =
        (await qr.query(`SELECT symbol FROM erp_currencies WHERE is_base = true LIMIT 1`).catch(() => []))[0]?.symbol || '₹';
      const orders = await qr.query(
        `SELECT id, order_number, status, total, created_at FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [id],
      );
      const invoices = await qr.query(
        `SELECT invoice_number, total, amount_paid, balance_due, payment_status, COALESCE(issued_at, created_at) AS date
           FROM invoices WHERE customer_id = $1 ORDER BY COALESCE(issued_at, created_at) DESC LIMIT 20`,
        [id],
      );
      // Ledger from AR invoices (year IS NOT NULL) — billed − paid = outstanding.
      const arInvoices = await qr.query(
        `SELECT invoice_number, total, amount_paid, balance_due, COALESCE(issued_at, created_at) AS date
           FROM invoices WHERE customer_id = $1 AND year IS NOT NULL ORDER BY COALESCE(issued_at, created_at) ASC`,
        [id],
      );
      const entries: any[] = [];
      for (const inv of arInvoices) {
        entries.push({ date: inv.date, ref: inv.invoice_number, description: 'Invoice raised', debit: Number(inv.total) || 0, credit: 0 });
        const paid = Number(inv.amount_paid) || 0;
        if (paid > 0) entries.push({ date: inv.date, ref: inv.invoice_number, description: 'Payment received', debit: 0, credit: paid });
      }
      let balance = 0;
      for (const e of entries) { balance += e.debit - e.credit; e.balance = balance; }
      const billed = arInvoices.reduce((s: number, i: any) => s + (Number(i.total) || 0), 0);
      const paid = arInvoices.reduce((s: number, i: any) => s + (Number(i.amount_paid) || 0), 0);
      const outstanding = arInvoices.reduce((s: number, i: any) => s + (Number(i.balance_due) || 0), 0);
      return { customer, currency: symbol, ledger: { summary: { billed, paid, outstanding }, entries }, orders, invoices };
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

  // ── Tax rates (percentage, e.g. 18 = 18%) ───────────────────────────────────

  async taxRates(token: string): Promise<any[]> {
    const { schema } = await this.ctx(token);
    return this.q(schema, (qr) =>
      qr.query(`SELECT id, name, rate, is_default, enabled FROM erp_tax_rates WHERE removed = false ORDER BY is_default DESC, rate ASC`),
    );
  }

  async createTaxRate(token: string, body: { name?: string; rate?: number }): Promise<any> {
    const { schema } = await this.ctx(token);
    const name = String(body?.name || '').trim();
    const rate = Number(body?.rate);
    if (!name || isNaN(rate)) throw new BadRequestException('Name and rate (%) are required');
    return this.q(schema, async (qr) =>
      (await qr.query(`INSERT INTO erp_tax_rates (name, rate) VALUES ($1, $2) RETURNING id, name, rate, is_default, enabled`, [name, rate]))[0],
    );
  }

  async updateTaxRate(token: string, id: string, body: { name?: string; rate?: number; enabled?: boolean }): Promise<any> {
    const { schema } = await this.ctx(token);
    return this.q(schema, async (qr) => {
      const sets: string[] = [];
      const params: any[] = [];
      let p = 1;
      if (body.name != null && String(body.name).trim()) { sets.push(`name = $${p++}`); params.push(String(body.name).trim()); }
      if (body.rate != null && !isNaN(Number(body.rate))) { sets.push(`rate = $${p++}`); params.push(Number(body.rate)); }
      if (body.enabled != null) { sets.push(`enabled = $${p++}`); params.push(!!body.enabled); }
      if (sets.length) { params.push(id); await qr.query(`UPDATE erp_tax_rates SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${p}`, params); }
      return (await qr.query(`SELECT id, name, rate, is_default, enabled FROM erp_tax_rates WHERE id = $1`, [id]))[0];
    });
  }

  // ── E-way bills (list; create/manage happens in the portal) ─────────────────
  async ewayBills(token: string): Promise<any[]> {
    const { schema } = await this.ctx(token);
    return this.q(schema, (qr) =>
      qr.query(
        `SELECT id, eway_number, invoice_number, value, status, transport_mode, vehicle_number, valid_until, created_at
           FROM eway_bills WHERE removed = false ORDER BY created_at DESC LIMIT 50`,
      ),
    );
  }

  /** Standard-format e-way bill PDF for the console (token-authenticated). */
  async ewayPdf(token: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const { schema } = await this.ctx(token);
    const { eway, invoice, settings } = await this.q(schema, async (qr) => {
      const eway = (await qr.query(`SELECT * FROM eway_bills WHERE id = $1 AND removed = false`, [id]))[0];
      if (!eway) throw new NotFoundException('E-way bill not found');
      let invoice: any = null;
      if (eway.invoice_id) invoice = (await qr.query(`SELECT * FROM invoices WHERE id = $1`, [eway.invoice_id]))[0] || null;
      const rows = await qr.query(
        `SELECT key, value FROM settings WHERE key IN ('business_name','invoice_legal_name','invoice_address','invoice_gstin','erp_currency','currency')`,
      );
      const m: Record<string, any> = {};
      for (const r of rows) m[r.key] = r.value;
      const settings = {
        businessName: m.invoice_legal_name || m.business_name || 'Your Business',
        address: m.invoice_address || undefined,
        gstin: m.invoice_gstin || undefined,
        currency: m.erp_currency || m.currency || 'INR',
      };
      return { eway, invoice, settings };
    });
    const buffer = await buildEwayBillPdf(eway, invoice, settings);
    const filename = `eway-${String(eway.eway_number).replace(/[^\w.-]/g, '_')}.pdf`;
    return { buffer, filename };
  }

  // ── Portal deep-link: open the FULL web portal (logged in) at a specific page ─
  async portalLink(token: string, to: string): Promise<{ url: string }> {
    const { schema, tenantId } = await this.ctx(token);
    return this.builder.createPortalLoginSession({ tenantId, schemaName: schema, view: to || '/dashboard' });
  }
}
