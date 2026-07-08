import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { firstRow } from '../erp/common/sql-result.util';
import { ErpInvoiceService } from '../erp/invoicing/erp-invoice.service';
import { OrderService } from '../order/order.service';
import { EntryContextService } from '../entry/entry-context.service';
import { PromotionsEngine, CartItemInput } from '../promotions/promotions-engine.service';
import { customerSegmentFlags } from '../promotions/customer-segments';
import { CartService } from '../order/cart.service';
import { PlanFeatureService } from '../erp/common/plan-feature.service';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * SFA — the salesman's WhatsApp webview. The admin registers salesmen (name +
 * WhatsApp number); each gets a long-lived access token opening /m/sales. In the
 * field the salesman can: browse customers with outstanding, punch orders on a
 * customer's behalf, see every pending invoice, COLLECT payment with instrument
 * details (cash / cheque no+date / UPI / online + txn ref), and when the customer
 * can't pay, record a PROMISE-TO-PAY for a date — surfaced as the follow-up list
 * when that date arrives.
 */
@Injectable()
export class SfaService {
  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly invoices: ErpInvoiceService,
    private readonly orders: OrderService,
    private readonly ctx: EntryContextService,
    private readonly promos: PromotionsEngine,
    private readonly carts: CartService,
    private readonly planFeatures: PlanFeatureService,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  // ─── Admin: manage salesmen ─────────────────────────────────────────────────
  listSalesmen(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT id, name, phone, route, area, access_token, is_active, created_at
                FROM "${schema}".salesmen ORDER BY created_at DESC`),
    );
  }

  async addSalesman(schema: string, s: { name: string; phone: string; route?: string; area?: string }) {
    if (!s?.name?.trim() || !s?.phone?.trim()) throw new BadRequestException('Name and WhatsApp number are required');
    const token = randomBytes(24).toString('hex');
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `INSERT INTO "${schema}".salesmen (name, phone, route, area, access_token)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, is_active = true
         RETURNING id, access_token`,
        [s.name.trim(), s.phone.trim(), s.route?.trim() || null, s.area?.trim() || null, token],
      );
      return rows[0];
    });
  }

  async updateSalesman(schema: string, id: string, body: { isActive?: boolean; rotateToken?: boolean }) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const token = body.rotateToken ? randomBytes(24).toString('hex') : null;
      const row = firstRow(await qr.query(
        `UPDATE "${schema}".salesmen SET
           is_active = COALESCE($2, is_active),
           access_token = COALESCE($3, access_token)
         WHERE id = $1 RETURNING id, access_token, is_active`,
        [id, body.isActive ?? null, token],
      ));
      if (!row) throw new NotFoundException('Salesman not found');
      return row;
    });
  }

  // ─── Webview auth: schema + token → salesman ────────────────────────────────
  async auth(schema: string, token: string) {
    if (!/^tenant_[a-z0-9_]+$/.test(schema) || !token) throw new UnauthorizedException('Invalid link');
    // The salesman field app is a plan feature — a link stops working the moment
    // the business's `sfa` entitlement is turned off (plan downgrade / override).
    if (!(await this.tenantHasSfa(schema))) {
      throw new UnauthorizedException('The salesman module is not enabled for this business.');
    }
    const s = await this.cm.executeInTenantContext(schema, async (qr) =>
      (await qr.query(
        `SELECT id, name, phone, route, area FROM "${schema}".salesmen WHERE access_token = $1 AND is_active = true`,
        [token],
      ))[0],
    );
    if (!s) throw new UnauthorizedException('Link expired or salesman deactivated');
    return s;
  }

  /** Resolve the tenant behind a schema and check the `sfa` plan feature. */
  private async tenantHasSfa(schema: string): Promise<boolean> {
    const tenant = await this.tenants.findOne({ where: { schemaName: schema }, select: ['id'] });
    if (!tenant) return false;
    return this.planFeatures.hasFeatures(tenant.id, ['sfa']);
  }

  // ─── Field operations ───────────────────────────────────────────────────────
  async home(schema: string, salesmanId: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const [tot] = await qr.query(
        `SELECT COALESCE(SUM(balance_due),0) AS pending, COUNT(*) FILTER (WHERE balance_due > 0) AS bills
         FROM "${schema}".invoices WHERE payment_status IN ('unpaid','partial')`,
      );
      const promises = await qr.query(
        `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone, i.invoice_number
         FROM "${schema}".payment_promises p
         LEFT JOIN "${schema}".customers c ON c.id = p.customer_id
         LEFT JOIN "${schema}".invoices i ON i.id = p.invoice_id
         WHERE p.status = 'open' AND p.promise_date <= CURRENT_DATE
         ORDER BY p.promise_date ASC LIMIT 20`,
      );
      const collectedToday = await qr.query(
        `SELECT COALESCE(SUM(amount),0) AS amt, COUNT(*) AS n FROM "${schema}".payments
         WHERE collected_by = $1 AND created_at::date = CURRENT_DATE`,
        [salesmanId],
      );
      return {
        pendingTotal: round2(Number(tot?.pending) || 0),
        pendingBills: Number(tot?.bills) || 0,
        promisesDue: promises,
        collectedToday: { amount: round2(Number(collectedToday[0]?.amt) || 0), count: Number(collectedToday[0]?.n) || 0 },
      };
    });
  }

  customers(schema: string, q: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT c.id, COALESCE(c.display_name, c.name) AS name, c.phone, c.area, c.route,
                COALESCE(ar.outstanding, 0) AS outstanding, COALESCE(ar.open_bills, 0) AS open_bills
         FROM "${schema}".customers c
         LEFT JOIN LATERAL (
           SELECT SUM(balance_due) AS outstanding, COUNT(*) FILTER (WHERE balance_due > 0) AS open_bills
           FROM "${schema}".invoices i WHERE i.customer_id = c.id
         ) ar ON true
         WHERE c.deleted_at IS NULL AND ($1 = '%%' OR c.name ILIKE $1 OR c.phone ILIKE $1 OR c.area ILIKE $1 OR c.route ILIKE $1)
         ORDER BY ar.outstanding DESC NULLS LAST LIMIT 50`,
        [`%${q}%`],
      ),
    );
  }

  async customerDetail(schema: string, customerId: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const c = (await qr.query(
        `SELECT id, COALESCE(display_name, name) AS name, phone, billing_address, area, route, credit_limit, credit_days
         FROM "${schema}".customers WHERE id = $1`, [customerId],
      ))[0];
      if (!c) throw new NotFoundException('Customer not found');
      const bills = await qr.query(
        `SELECT id, invoice_number, issued_at, due_date, total, balance_due, payment_status
         FROM "${schema}".invoices
         WHERE customer_id = $1 AND balance_due > 0 ORDER BY issued_at ASC`, [customerId],
      );
      const promises = await qr.query(
        `SELECT * FROM "${schema}".payment_promises WHERE customer_id = $1 AND status = 'open' ORDER BY promise_date`, [customerId],
      );
      return { ...c, bills, promises };
    });
  }

  /** Row → salesman-language summary. Keeps scope/audience so callers can match per product/customer. */
  private summarizeScheme(s: any) {
    const cfg = typeof s.conditions === 'string' ? JSON.parse(s.conditions) : (s.conditions || {});
    let benefit = '';
    if (s.action === 'discount' || s.action === 'qty_discount') {
      benefit = cfg.discountType === 'amount' ? `₹${cfg.discountValue} off` : `${Number(cfg.discountValue) || 0}% off`;
      if (cfg.minQty) benefit += ` on ${cfg.minQty}+ qty`;
      if (cfg.minCartValue) benefit += ` on orders above ₹${cfg.minCartValue}`;
    } else if (s.action === 'buy_x_get_x_free') {
      benefit = `Buy ${cfg.buyQty || 1}, get ${cfg.getQty || 1} free`;
    } else if (s.action === 'buy_x_get_y_free') {
      benefit = `Buy ${cfg.buyQty || 1}, get a free gift`;
    }
    const on = s.scope === 'all' ? 'everything' : (s.scope_names || []).filter(Boolean).join(', ') || s.scope;
    return {
      id: s.id, name: s.name, description: s.description, action: s.action,
      benefit, appliesTo: on, combinable: s.combinable,
      validUntil: s.valid_until, minQty: cfg.minQty || null, minCartValue: cfg.minCartValue || null,
      scope: s.scope, scopeIds: s.scope_ids || [], audience: s.audience || 'all',
    };
  }

  private activeSchemeRows(schema: string, qr: any, audienceSql: string, params: any[] = []) {
    return qr.query(
      `SELECT s.*,
              CASE WHEN s.scope = 'product' THEN (SELECT array_agg(p.name) FROM "${schema}".products p WHERE p.id = ANY(s.scope_ids))
                   WHEN s.scope = 'category' THEN (SELECT array_agg(c.name) FROM "${schema}".categories c WHERE c.id = ANY(s.scope_ids))
                   WHEN s.scope = 'brand' THEN (SELECT array_agg(b.name) FROM "${schema}".brands b WHERE b.id = ANY(s.scope_ids))
              END AS scope_names
       FROM "${schema}".schemes s
       WHERE s.status = 'active' AND s.type = 'instant'
         AND (s.valid_from IS NULL OR s.valid_from <= NOW())
         AND (s.valid_until IS NULL OR s.valid_until >= NOW())
         AND (${audienceSql})
       ORDER BY s.weight DESC, s.created_at DESC`,
      params,
    );
  }

  /** Catalog cards: image, prices (MRP/wholesale), live stock, and the schemes running ON each item. */
  async products(schema: string, q: string) {
    const [rows, schemes] = await Promise.all([
      this.cm.executeInTenantContext(schema, (qr) =>
        qr.query(
          `SELECT p.id, p.name, p.thumbnail, p.uom, p.category_id, p.brand_id,
                  COALESCE(p.sale_price, p.base_price) AS price, p.base_price, p.mrp,
                  p.wholesale_price, p.wholesale_min_qty, p.sale_discount_pct,
                  COALESCE(inv.available, 0) + COALESCE(ws.qty, 0) AS stock
           FROM "${schema}".products p
           LEFT JOIN LATERAL (
             SELECT SUM(stock_quantity - reserved_quantity) AS available
             FROM "${schema}".inventory i WHERE i.product_id = p.id
           ) inv ON true
           LEFT JOIN LATERAL (
             SELECT SUM(quantity) AS qty FROM "${schema}".erp_stock s WHERE s.product_id = p.id
           ) ws ON true
           WHERE p.is_active = true AND p.deleted_at IS NULL AND COALESCE(p.item_type, 'product') <> 'service'
             AND ($1 = '%%' OR p.name ILIKE $1 OR p.metadata->>'barcode' ILIKE $1)
           ORDER BY p.name LIMIT 60`,
          [`%${q}%`],
        ),
      ),
      this.schemes(schema),
    ]);
    const general = schemes.filter((s: any) => s.audience === 'all');
    return rows.map((r: any) => {
      const offers = general.filter((s: any) =>
        s.scope === 'all'
        || (s.scope === 'product' && s.scopeIds.includes(r.id))
        || (s.scope === 'category' && r.category_id && s.scopeIds.includes(r.category_id))
        || (s.scope === 'brand' && r.brand_id && s.scopeIds.includes(r.brand_id)),
      );
      return {
        ...r,
        badge: offers[0]?.benefit || null,
        offers: offers.slice(0, 3).map((s: any) => ({ id: s.id, name: s.name, benefit: s.benefit })),
      };
    });
  }

  /** Active schemes, summarized in the salesman's language (what to pitch to the customer). */
  schemes(schema: string): Promise<any[]> {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await this.activeSchemeRows(schema, qr, `1=1`);
      return rows.map((s: any) => this.summarizeScheme(s));
    });
  }

  /** Offers THIS customer can get — general + targeted-to-them + their segments. */
  customerSchemes(schema: string, customerId: string): Promise<any[]> {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await this.activeSchemeRows(
        schema, qr,
        `s.audience = 'all'
         OR (s.audience = 'specific' AND EXISTS (
               SELECT 1 FROM "${schema}".scheme_customers sc WHERE sc.scheme_id = s.id AND sc.customer_id = $1))
         OR s.audience = 'segment'`,
        [customerId],
      );
      const segFlags = await customerSegmentFlags(qr, customerId);
      return rows
        .filter((s: any) => s.audience !== 'segment' || (segFlags as any)[s.audience_segment])
        .map((s: any) => ({ ...this.summarizeScheme(s), exclusive: s.audience !== 'all' }));
    });
  }

  // ─── Customer's WhatsApp cart (salesman can view + edit it) ────────────────
  customerCart(schema: string, customerId: string) {
    return this.carts.getActiveCart(schema, customerId);
  }
  addToCustomerCart(schema: string, customerId: string, productId: string, quantity: number) {
    if (!productId || !(Number(quantity) > 0)) throw new BadRequestException('Product and quantity are required');
    return this.carts.addItem(schema, customerId, productId, null, Number(quantity));
  }
  setCustomerCartQty(schema: string, customerId: string, itemId: string, quantity: number) {
    return this.carts.updateItemQuantity(schema, customerId, itemId, Number(quantity) || 0);
  }
  async clearCustomerCart(schema: string, customerId: string) {
    await this.carts.clearCart(schema, customerId);
    return { cleared: true };
  }

  /** Live cart evaluation — savings preview while the salesman builds the order. */
  async evaluate(schema: string, customerId: string | undefined, items: CartItemInput[]) {
    const r = await this.promos.evaluateCart(schema, items || [], customerId);
    // The recommended freeItems share references with applicable[].freeItems and
    // the response serializer nulls repeated object references — return copies.
    return JSON.parse(JSON.stringify(r));
  }

  /** Every open bill across customers, oldest due first — the collection run. */
  pending(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT i.id, i.invoice_number, i.issued_at, i.due_date, i.total, i.balance_due, i.payment_status,
                i.customer_id, COALESCE(c.display_name, c.name) AS customer_name, c.phone AS customer_phone
         FROM "${schema}".invoices i
         LEFT JOIN "${schema}".customers c ON c.id = i.customer_id
         WHERE i.balance_due > 0
         ORDER BY i.due_date ASC NULLS LAST, i.issued_at ASC LIMIT 200`,
      ),
    );
  }

  /**
   * Punch an order on the customer's behalf. Active schemes apply automatically:
   * the recommended set's discount lands on the order and free goods ride along
   * as ₹0 lines — the same maths the storefront cart uses.
   */
  async takeOrder(schema: string, salesman: any, body: { customerId: string; items: Array<{ productId?: string; productName?: string; quantity: number; unitPrice: number }>; notes?: string }) {
    if (!body?.customerId || !body?.items?.length) throw new BadRequestException('Customer and items are required');

    const evalRes = await this.promos.evaluateCart(schema, body.items as CartItemInput[], body.customerId);
    const applied = evalRes.applicable.filter((a) => evalRes.recommendedIds.includes(a.schemeId));
    const freeLines = evalRes.freeItems.map((f) => ({
      productId: f.productId,
      productName: `${f.name} (FREE — scheme)`,
      quantity: f.quantity,
      unitPrice: 0,
    }));

    const noteBits = [`SFA order by ${salesman.name}`];
    if (applied.length) noteBits.push(`Schemes: ${applied.map((a) => `${a.name} (${a.label})`).join('; ')}`);
    if (body.notes) noteBits.push(body.notes);

    const order = await this.orders.createDirect(schema, {
      customerId: body.customerId,
      items: [...body.items, ...freeLines],
      discount: evalRes.discountTotal || 0,
      notes: noteBits.join(' — '),
    } as any);
    return {
      id: order?.id,
      orderNumber: order?.order_number ?? order?.orderNumber,
      schemeDiscount: evalRes.discountTotal || 0,
      freeItems: evalRes.freeItems,
      appliedSchemes: applied.map((a) => ({ name: a.name, label: a.label, saving: a.saving })),
    };
  }

  /** Collect against an invoice — cash / cheque(no+date) / UPI / online(txn ref). */
  async collect(schema: string, salesman: any, body: {
    invoiceId: string; amount: number; method: string; instrumentNo?: string; instrumentDate?: string; note?: string; promiseId?: string;
  }) {
    const method = ['cash', 'cheque', 'upi', 'online'].includes(body?.method) ? body.method : 'cash';
    if (method === 'cheque' && !body.instrumentNo?.trim()) throw new BadRequestException('Cheque number is required');
    const r = await this.invoices.recordPayment(schema, body.invoiceId, {
      amount: Number(body.amount),
      method,
      instrumentNo: body.instrumentNo?.trim(),
      instrumentDate: body.instrumentDate,
      collectedBy: salesman.id,
      description: `Collected by ${salesman.name} (${method}${body.instrumentNo ? ' ' + body.instrumentNo : ''})${body.note ? ' — ' + body.note : ''}`,
    });
    // A kept promise closes automatically when its money arrives.
    if (body.promiseId) {
      await this.cm.executeInTenantContext(schema, (qr) =>
        qr.query(`UPDATE "${schema}".payment_promises SET status = 'kept', updated_at = NOW() WHERE id = $1`, [body.promiseId]),
      );
    }
    return { paid: true, invoiceStatus: r?.invoice?.payment_status, balance: r?.invoice?.balance_due };
  }

  /** Customer can't pay today → record when they WILL (promise-to-pay). */
  async promise(schema: string, salesman: any, body: { customerId: string; invoiceId?: string; amount: number; promiseDate: string; note?: string }) {
    if (!body?.customerId || !body?.promiseDate || !(Number(body.amount) > 0)) {
      throw new BadRequestException('Customer, amount and promise date are required');
    }
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `INSERT INTO "${schema}".payment_promises (customer_id, invoice_id, salesman_id, amount, promise_date, note)
         VALUES ($1,$2,$3,$4,$5::date,$6) RETURNING id, promise_date`,
        [body.customerId, body.invoiceId ?? null, salesman.id, round2(Number(body.amount)), body.promiseDate, body.note?.trim() || null],
      );
      return rows[0];
    });
  }

  promises(schema: string, scope: 'due' | 'open' | 'all' = 'due') {
    const where = scope === 'due'
      ? `WHERE p.status = 'open' AND p.promise_date <= CURRENT_DATE`
      : scope === 'open' ? `WHERE p.status = 'open'` : '';
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone, i.invoice_number, i.balance_due
         FROM "${schema}".payment_promises p
         LEFT JOIN "${schema}".customers c ON c.id = p.customer_id
         LEFT JOIN "${schema}".invoices i ON i.id = p.invoice_id
         ${where} ORDER BY p.promise_date ASC LIMIT 100`,
      ),
    );
  }

  async updatePromise(schema: string, id: string, status: 'kept' | 'broken' | 'open') {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const row = firstRow(await qr.query(
        `UPDATE "${schema}".payment_promises SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, status`,
        [id, status],
      ));
      if (!row) throw new NotFoundException('Promise not found');
      return row;
    });
  }
}
