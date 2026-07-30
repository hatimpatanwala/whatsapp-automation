import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
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
import { CreditNoteService } from '../erp/vyapar/return-note';
import { PushService } from './push.service';

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
    private readonly creditNotes: CreditNoteService,
    private readonly push: PushService,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  // ─── Admin: manage salesmen ─────────────────────────────────────────────────
  listSalesmen(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT id, name, phone, route, area, access_token, is_active, created_at
                FROM "${schema}".salesmen ORDER BY created_at DESC`),
    );
  }

  async addSalesman(
    schema: string,
    s: { name: string; phone: string; route?: string; area?: string; code?: string; email?: string; password?: string; createLogin?: boolean },
  ) {
    if (!s?.name?.trim() || !s?.phone?.trim()) throw new BadRequestException('Name and WhatsApp number are required');
    const token = randomBytes(24).toString('hex');
    const phone = s.phone.trim();
    const email = s.email?.trim()?.toLowerCase() || null;
    return this.cm.executeInTenantContext(schema, async (qr) => {
      // One identity per phone/email across the platform: a salesman's number/email
      // must not already belong to a NON-salesman platform user (owner/admin/staff),
      // otherwise the two identities clash (and a login upsert would clobber them).
      const clash = await qr.query(
        `SELECT u.id FROM "${schema}".users u
         WHERE (u.phone = $1 OR ($2::text IS NOT NULL AND lower(u.email) = $2))
           AND NOT EXISTS (SELECT 1 FROM "${schema}".salesmen sm WHERE sm.user_id = u.id)
         LIMIT 1`,
        [phone, email],
      );
      if (clash.length) {
        throw new BadRequestException('This phone or email already belongs to a platform user (owner/admin/staff). Salesman identities must be unique — use a different number/email.');
      }
      const rows = await qr.query(
        `INSERT INTO "${schema}".salesmen (name, phone, route, area, access_token, code, email)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, route = EXCLUDED.route, area = EXCLUDED.area,
           code = EXCLUDED.code, email = COALESCE(EXCLUDED.email, "${schema}".salesmen.email), is_active = true
         RETURNING id, access_token`,
        [s.name.trim(), phone, s.route?.trim() || null, s.area?.trim() || null, token, s.code?.trim() || null, email],
      );
      const salesman = rows[0];
      // Unify identity: optionally back the salesman with an email/password login so
      // the same person can also sign into the portal (and the mobile app), seeing
      // the same beat/visits/orders as their WhatsApp field app.
      if (s.createLogin && s.email?.trim() && s.password?.trim()) {
        const userId = await this.ensureSalesmanLogin(qr, schema, salesman.id, {
          name: s.name.trim(), phone: s.phone.trim(), email: s.email.trim().toLowerCase(), password: s.password.trim(),
        });
        await qr.query(`UPDATE "${schema}".salesmen SET user_id = $2 WHERE id = $1`, [salesman.id, userId]);
      }
      return salesman;
    });
  }

  /** Create (or update) a Salesman-role users login and link it to the salesman row. */
  private async ensureSalesmanLogin(
    qr: any, schema: string, salesmanId: string,
    u: { name: string; phone: string; email: string; password: string },
  ): Promise<string> {
    const role = (await qr.query(`SELECT id FROM "${schema}".roles WHERE lower(name) = 'salesman' LIMIT 1`))[0];
    const hash = await bcrypt.hash(u.password, 12);
    const rows = await qr.query(
      `INSERT INTO "${schema}".users (phone, email, password_hash, name, role, role_id, is_active)
       VALUES ($1,$2,$3,$4,'seller',$5,true)
       ON CONFLICT (phone) DO UPDATE SET
         email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, name = EXCLUDED.name,
         role_id = EXCLUDED.role_id, is_active = true, updated_at = NOW()
       RETURNING id`,
      [u.phone, u.email, hash, u.name, role?.id || null],
    );
    return rows[0].id;
  }

  /**
   * Portal/app login path: resolve the salesman behind the signed-in user. If a
   * Salesman-role user has no salesman row yet (e.g. created via the Team screen),
   * lazily create + link one so their field-sales identity always exists.
   */
  async resolveByUser(schema: string, userId: string) {
    if (!(await this.tenantHasSfa(schema))) {
      throw new UnauthorizedException('The salesman module is not enabled for this business.');
    }
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const s = (await qr.query(
        `SELECT id, name, phone, route, area, code FROM "${schema}".salesmen WHERE user_id = $1 AND is_active = true`,
        [userId],
      ))[0];
      // Do NOT auto-register the logged-in user as a salesman — that pollutes the
      // salesmen roster/reports and clashes with RBAC. A salesman must be created
      // explicitly by a manager (which links the login). Non-salesmen (owners,
      // admins, staff) simply don't have the field app.
      if (!s) throw new UnauthorizedException('You are not registered as a salesman on this account.');
      return s;
    });
  }

  /** Non-throwing check used to decide whether to show the salesman field app. */
  isSalesmanUser(schema: string, userId: string): Promise<boolean> {
    if (!userId) return Promise.resolve(false);
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const r = await qr.query(
        `SELECT 1 FROM "${schema}".salesmen WHERE user_id = $1 AND is_active = true LIMIT 1`,
        [userId],
      );
      return r.length > 0;
    }).catch(() => false);
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
      source: 'salesman',
      placedByName: salesman.name,
      salesmanId: salesman.id,
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

  // ─── Beats (the customers a salesman covers) ────────────────────────────────
  /** Assigned customers for a salesman, with outstanding + last-visit context. */
  beat(schema: string, salesmanId: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT b.id AS beat_id, b.day_of_week, b.sort_order,
                c.id AS customer_id, COALESCE(c.display_name, c.name) AS name, c.phone, c.area, c.route,
                COALESCE(ar.outstanding, 0) AS outstanding, COALESCE(ar.open_bills, 0) AS open_bills,
                lv.last_visit_at,
                EXISTS (
                  SELECT 1 FROM "${schema}".salesman_visits vt
                  WHERE vt.customer_id = c.id AND vt.salesman_id = b.salesman_id
                    AND vt.checkin_at::date = CURRENT_DATE
                ) AS visited_today
         FROM "${schema}".salesman_beats b
         JOIN "${schema}".customers c ON c.id = b.customer_id AND c.deleted_at IS NULL
         LEFT JOIN LATERAL (
           SELECT SUM(balance_due) AS outstanding, COUNT(*) FILTER (WHERE balance_due > 0) AS open_bills
           FROM "${schema}".invoices i WHERE i.customer_id = c.id
         ) ar ON true
         LEFT JOIN LATERAL (
           SELECT MAX(checkin_at) AS last_visit_at FROM "${schema}".salesman_visits v
           WHERE v.customer_id = c.id AND v.salesman_id = b.salesman_id
         ) lv ON true
         WHERE b.salesman_id = $1
         ORDER BY b.sort_order, name`,
        [salesmanId],
      ),
    );
  }

  /** Replace a salesman's beat with the given customer set (manager action). */
  async setBeat(schema: string, salesmanId: string, customerIds: string[]) {
    const ids = Array.from(new Set((customerIds || []).filter(Boolean)));
    return this.cm.executeInTenantContext(schema, async (qr) => {
      await qr.query(`DELETE FROM "${schema}".salesman_beats WHERE salesman_id = $1`, [salesmanId]);
      let i = 0;
      for (const cid of ids) {
        await qr.query(
          `INSERT INTO "${schema}".salesman_beats (salesman_id, customer_id, sort_order)
           VALUES ($1,$2,$3) ON CONFLICT (salesman_id, customer_id) DO NOTHING`,
          [salesmanId, cid, i++],
        );
      }
      return { count: ids.length };
    });
  }

  /** Capture a NEW outlet from the field (retailer KYC) and add it to the rep's beat. */
  async createOutlet(schema: string, salesmanId: string, body: {
    name?: string; phone?: string; gstin?: string; billingAddress?: string; area?: string; route?: string; addToBeat?: boolean;
  }) {
    const name = (body?.name || '').trim();
    const phone = (body?.phone || '').trim();
    if (!name) throw new BadRequestException('Outlet name is required');
    if (!phone) throw new BadRequestException('Phone is required');
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const row = firstRow(await qr.query(
        `INSERT INTO "${schema}".customers (phone, name, display_name, gstin, billing_address, area, route, is_erp_client)
         VALUES ($1,$2,$2,$3,$4,$5,$6,true)
         ON CONFLICT (phone) DO UPDATE SET
           name = COALESCE("${schema}".customers.name, EXCLUDED.name),
           display_name = COALESCE("${schema}".customers.display_name, EXCLUDED.display_name),
           gstin = COALESCE(EXCLUDED.gstin, "${schema}".customers.gstin),
           billing_address = COALESCE(EXCLUDED.billing_address, "${schema}".customers.billing_address),
           area = COALESCE(EXCLUDED.area, "${schema}".customers.area),
           route = COALESCE(EXCLUDED.route, "${schema}".customers.route),
           updated_at = NOW()
         RETURNING id, COALESCE(display_name, name) AS name, phone, area, route`,
        [phone, name, body.gstin?.trim() || null, body.billingAddress?.trim() || null, body.area?.trim() || null, body.route?.trim() || null],
      ));
      if (body.addToBeat !== false && salesmanId && row?.id) {
        await qr.query(
          `INSERT INTO "${schema}".salesman_beats (salesman_id, customer_id, sort_order)
           VALUES ($1,$2, COALESCE((SELECT MAX(sort_order) + 1 FROM "${schema}".salesman_beats WHERE salesman_id = $1), 0))
           ON CONFLICT (salesman_id, customer_id) DO NOTHING`,
          [salesmanId, row.id],
        );
      }
      return row;
    });
  }

  // ─── Attendance (day-start / day-end punches) ───────────────────────────────
  attendanceToday(schema: string, salesmanId: string) {
    return this.cm.executeInTenantContext(schema, async (qr) =>
      firstRow(await qr.query(`SELECT * FROM "${schema}".salesman_attendance WHERE salesman_id = $1 AND day = CURRENT_DATE`, [salesmanId])) || null);
  }
  async punchAttendance(schema: string, salesmanId: string, body: {
    type?: 'in' | 'out'; latitude?: number; longitude?: number; label?: string; note?: string;
  }) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      if (body?.type === 'out') {
        const row = firstRow(await qr.query(
          `UPDATE "${schema}".salesman_attendance
             SET checkout_at = NOW(), checkout_lat = $2, checkout_lng = $3, checkout_label = $4, note = COALESCE($5, note)
           WHERE salesman_id = $1 AND day = CURRENT_DATE RETURNING *`,
          [salesmanId, body.latitude ?? null, body.longitude ?? null, body.label ?? null, body.note?.trim() || null],
        ));
        if (!row) throw new BadRequestException('Start your day before ending it');
        return row;
      }
      return firstRow(await qr.query(
        `INSERT INTO "${schema}".salesman_attendance (salesman_id, day, checkin_at, checkin_lat, checkin_lng, checkin_label, note)
         VALUES ($1, CURRENT_DATE, NOW(), $2, $3, $4, $5)
         ON CONFLICT (salesman_id, day) DO UPDATE SET
           checkin_at = COALESCE("${schema}".salesman_attendance.checkin_at, EXCLUDED.checkin_at),
           checkin_lat = COALESCE(EXCLUDED.checkin_lat, "${schema}".salesman_attendance.checkin_lat),
           checkin_lng = COALESCE(EXCLUDED.checkin_lng, "${schema}".salesman_attendance.checkin_lng),
           checkin_label = COALESCE(EXCLUDED.checkin_label, "${schema}".salesman_attendance.checkin_label)
         RETURNING *`,
        [salesmanId, body.latitude ?? null, body.longitude ?? null, body.label ?? null, body.note?.trim() || null],
      ));
    });
  }

  // ─── Expenses / TA-DA claims ────────────────────────────────────────────────
  async createExpense(schema: string, salesmanId: string, body: {
    category?: string; amount?: number; distanceKm?: number; note?: string; day?: string;
  }) {
    const amount = Number(body?.amount) || 0;
    const km = body?.distanceKm != null ? Number(body.distanceKm) : null;
    if (amount <= 0 && !km) throw new BadRequestException('Enter an amount or distance');
    return this.cm.executeInTenantContext(schema, async (qr) =>
      firstRow(await qr.query(
        `INSERT INTO "${schema}".salesman_expenses (salesman_id, day, category, amount, distance_km, note)
         VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6) RETURNING *`,
        [salesmanId, body.day || null, (body.category || 'misc').trim(), amount, km, body.note?.trim() || null],
      )));
  }
  myExpenses(schema: string, salesmanId: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT * FROM "${schema}".salesman_expenses WHERE salesman_id = $1 ORDER BY day DESC, created_at DESC LIMIT 60`, [salesmanId]));
  }
  listExpenses(schema: string, opts: { from?: string; to?: string; status?: string; salesmanId?: string } = {}) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT e.*, s.name AS salesman_name FROM "${schema}".salesman_expenses e
         LEFT JOIN "${schema}".salesmen s ON s.id = e.salesman_id
         WHERE ($1::uuid IS NULL OR e.salesman_id = $1)
           AND ($2::text IS NULL OR e.status = $2)
           AND (e.day >= COALESCE($3::date, CURRENT_DATE - INTERVAL '90 days'))
           AND (e.day < COALESCE($4::date, CURRENT_DATE) + INTERVAL '1 day')
         ORDER BY e.day DESC, e.created_at DESC LIMIT 300`,
        [opts.salesmanId || null, opts.status || null, opts.from || null, opts.to || null],
      ));
  }
  async reviewExpense(schema: string, id: string, status: string, reviewerId?: string) {
    if (!['approved', 'rejected', 'pending'].includes(status)) throw new BadRequestException('Invalid status');
    const row = await this.cm.executeInTenantContext(schema, async (qr) =>
      firstRow(await qr.query(
        `UPDATE "${schema}".salesman_expenses SET status = $2, reviewed_at = NOW(), reviewed_by = $3 WHERE id = $1 RETURNING *`,
        [id, status, reviewerId || null],
      )));
    // Nudge the salesman on their phone (best-effort; no-op until VAPID is configured).
    if (row && status !== 'pending') {
      this.pushToSalesman(schema, row.salesman_id, {
        title: status === 'approved' ? 'Expense approved ✅' : 'Expense rejected',
        body: `Your ${row.category} claim of ₹${row.amount} was ${status}.`,
        url: '/field-sales/my-sales', tag: 'expense',
      }).catch(() => {});
    }
    return row;
  }

  /** Resolve a salesman's login user and push a browser notification (best-effort). */
  async pushToSalesman(schema: string, salesmanId: string, payload: { title: string; body: string; url?: string; tag?: string }) {
    if (!salesmanId || !this.push.configured()) return { sent: 0 };
    const userId = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT user_id FROM "${schema}".salesmen WHERE id = $1`, [salesmanId]).then((r) => r[0]?.user_id));
    if (!userId) return { sent: 0 };
    return this.push.sendToUser(schema, userId, payload);
  }

  // ─── Sales returns (field-recorded credit notes) ────────────────────────────
  /**
   * A salesman records goods a retailer returned. Creates a credit note (which
   * auto-posts to the ledger and reduces the customer's outstanding), reusing
   * the ERP CreditNoteService. `taxRatePct` comes in as a percentage (18) and is
   * converted to the fraction the credit-note engine expects.
   */
  async recordReturn(schema: string, salesman: any, body: {
    customerId?: string; invoiceId?: string; reason?: string; discount?: number; taxRatePct?: number;
    items?: Array<{ description: string; quantity: number; unitPrice: number }>;
  }) {
    if (!body?.customerId) throw new BadRequestException('Customer is required');
    const items = (body.items || []).filter((i) => i?.description?.trim() && Number(i.quantity) > 0);
    if (!items.length) throw new BadRequestException('Add at least one returned item');
    const customer = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT COALESCE(display_name, name) AS name, phone FROM "${schema}".customers WHERE id = $1`, [body.customerId]).then(firstRow));
    return this.creditNotes.create(schema, {
      customerId: body.customerId,
      invoiceId: body.invoiceId,
      customerName: customer?.name,
      customerPhone: customer?.phone,
      items,
      taxRate: (Number(body.taxRatePct) || 0) / 100,
      discount: Number(body.discount) || 0,
      reason: body.reason?.trim() || `Field return by ${salesman?.name || 'salesman'}`,
    });
  }

  /** A salesman's recent returns (credit notes) for their day view. */
  myReturns(schema: string, salesmanId?: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT id, note_number, customer_name, total, reason, created_at
                FROM "${schema}".credit_notes WHERE removed = false ORDER BY created_at DESC LIMIT 30`));
  }

  // ─── Visits (check-in / check-out journal) ──────────────────────────────────
  visits(schema: string, opts: { salesmanId?: string; from?: string; to?: string; customerId?: string }) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT v.*, COALESCE(c.display_name, c.name, v.customer_name) AS customer_name,
                c.phone AS customer_phone, c.area, c.route, s.name AS salesman_name
         FROM "${schema}".salesman_visits v
         LEFT JOIN "${schema}".customers c ON c.id = v.customer_id
         LEFT JOIN "${schema}".salesmen s ON s.id = v.salesman_id
         WHERE ($1::uuid IS NULL OR v.salesman_id = $1)
           AND ($2::uuid IS NULL OR v.customer_id = $2)
           AND (COALESCE(v.checkin_at, v.planned_date::timestamptz, v.created_at) >= COALESCE($3::date, CURRENT_DATE - INTERVAL '30 days'))
           AND (COALESCE(v.checkin_at, v.planned_date::timestamptz, v.created_at) < COALESCE($4::date, CURRENT_DATE) + INTERVAL '1 day')
         ORDER BY COALESCE(v.checkin_at, v.planned_date::timestamptz, v.created_at) DESC
         LIMIT 200`,
        [opts.salesmanId || null, opts.customerId || null, opts.from || null, opts.to || null],
      ),
    );
  }

  /** Salesman checks in at a customer — creates (or advances) a visit. */
  async checkIn(schema: string, salesmanId: string, body: {
    customerId?: string; customerName?: string; purpose?: string; note?: string; latitude?: number; longitude?: number; locationLabel?: string; visitId?: string;
  }) {
    if (!body?.customerId && !body?.customerName?.trim()) throw new BadRequestException('Customer is required');
    return this.cm.executeInTenantContext(schema, async (qr) => {
      if (body.visitId) {
        const row = firstRow(await qr.query(
          `UPDATE "${schema}".salesman_visits SET status = 'checked_in', checkin_at = NOW(),
             latitude = COALESCE($3, latitude), longitude = COALESCE($4, longitude),
             location_label = COALESCE($5, location_label), note = COALESCE($6, note)
           WHERE id = $1 AND salesman_id = $2 RETURNING *`,
          [body.visitId, salesmanId, body.latitude ?? null, body.longitude ?? null, body.locationLabel ?? null, body.note?.trim() || null],
        ));
        if (!row) throw new NotFoundException('Visit not found');
        return row;
      }
      const rows = await qr.query(
        `INSERT INTO "${schema}".salesman_visits
           (salesman_id, customer_id, customer_name, purpose, status, checkin_at, latitude, longitude, location_label, note)
         VALUES ($1,$2,$3,$4,'checked_in',NOW(),$5,$6,$7,$8) RETURNING *`,
        [salesmanId, body.customerId || null, body.customerName?.trim() || null, body.purpose || 'sales',
         body.latitude ?? null, body.longitude ?? null, body.locationLabel ?? null, body.note?.trim() || null],
      );
      return rows[0];
    });
  }

  /** Append geo-tagged photo URLs to a visit (shopfront / shelf shots). */
  async addVisitPhotos(schema: string, salesmanId: string, visitId: string, urls: string[]) {
    const clean = (urls || []).filter((u) => typeof u === 'string' && u.trim()).slice(0, 6);
    if (!clean.length) throw new BadRequestException('No photos to attach');
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const row = firstRow(await qr.query(
        `UPDATE "${schema}".salesman_visits
           SET photos = COALESCE(photos, '[]'::jsonb) || $3::jsonb
         WHERE id = $1 AND salesman_id = $2 RETURNING *`,
        [visitId, salesmanId, JSON.stringify(clean)],
      ));
      if (!row) throw new NotFoundException('Visit not found');
      return row;
    });
  }

  /** Close a visit with an outcome; order/collection totals get stamped on it. */
  async checkOut(schema: string, salesmanId: string, visitId: string, body: { outcome?: string; note?: string }) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const row = firstRow(await qr.query(
        `UPDATE "${schema}".salesman_visits SET status = 'completed', checkout_at = NOW(),
           outcome = COALESCE($3, outcome), note = COALESCE($4, note)
         WHERE id = $1 AND salesman_id = $2 RETURNING *`,
        [visitId, salesmanId, body.outcome || null, body.note?.trim() || null],
      ));
      if (!row) throw new NotFoundException('Visit not found');
      return row;
    });
  }

  /** Plan a future visit (added to the salesman's day plan). */
  async planVisit(schema: string, salesmanId: string, body: { customerId: string; plannedDate?: string; purpose?: string; note?: string }) {
    if (!body?.customerId) throw new BadRequestException('Customer is required');
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `INSERT INTO "${schema}".salesman_visits (salesman_id, customer_id, purpose, status, planned_date, note)
         VALUES ($1,$2,$3,'planned',$4::date,$5) RETURNING *`,
        [salesmanId, body.customerId, body.purpose || 'sales', body.plannedDate || null, body.note?.trim() || null],
      );
      return rows[0];
    });
  }

  // ─── Targets ────────────────────────────────────────────────────────────────
  targets(schema: string, salesmanId: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT id, period_month, target_amount, target_collection, target_visits
         FROM "${schema}".salesman_targets WHERE salesman_id = $1 ORDER BY period_month DESC LIMIT 24`,
        [salesmanId],
      ),
    );
  }

  async setTarget(schema: string, salesmanId: string, body: { periodMonth: string; targetAmount?: number; targetCollection?: number; targetVisits?: number }) {
    if (!body?.periodMonth) throw new BadRequestException('Period month is required');
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `INSERT INTO "${schema}".salesman_targets (salesman_id, period_month, target_amount, target_collection, target_visits)
         VALUES ($1, date_trunc('month',$2::date)::date, $3, $4, $5)
         ON CONFLICT (salesman_id, period_month) DO UPDATE SET
           target_amount = EXCLUDED.target_amount, target_collection = EXCLUDED.target_collection,
           target_visits = EXCLUDED.target_visits, updated_at = NOW()
         RETURNING id, period_month, target_amount, target_collection, target_visits`,
        [salesmanId, body.periodMonth, round2(Number(body.targetAmount) || 0), round2(Number(body.targetCollection) || 0), Number(body.targetVisits) || 0],
      );
      return rows[0];
    });
  }

  // ─── Reports ────────────────────────────────────────────────────────────────
  /** Per-salesman performance for a date range: orders, sales, collections, visits, target achievement. */
  performance(schema: string, opts: { from?: string; to?: string; salesmanId?: string }) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT s.id, s.name, s.phone, s.route, s.area, s.is_active,
                COALESCE(ord.orders,0)::int AS orders,
                COALESCE(ord.order_value,0) AS order_value,
                COALESCE(ord.customers_ordered,0)::int AS customers_ordered,
                COALESCE(col.collected,0) AS collected,
                COALESCE(col.collections,0)::int AS collections,
                COALESCE(vis.visits,0)::int AS visits,
                COALESCE(vis.visited_customers,0)::int AS visited_customers,
                COALESCE(tgt.target_amount,0) AS target_amount,
                COALESCE(tgt.target_collection,0) AS target_collection,
                COALESCE(tgt.target_visits,0)::int AS target_visits,
                COALESCE(bt.beat_size,0)::int AS beat_size,
                COALESCE(bt.beat_covered,0)::int AS beat_covered,
                CASE WHEN COALESCE(bt.beat_size,0) > 0
                     THEN ROUND(COALESCE(bt.beat_covered,0)::numeric * 100 / bt.beat_size)
                     ELSE 0 END::int AS adherence_pct
         FROM "${schema}".salesmen s
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS order_value, COUNT(DISTINCT customer_id) AS customers_ordered
           FROM "${schema}".orders o
           WHERE o.salesman_id = s.id
             AND o.placed_at >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
             AND o.placed_at < COALESCE($2::date, CURRENT_DATE) + INTERVAL '1 day'
         ) ord ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(amount),0) AS collected, COUNT(*) AS collections
           FROM "${schema}".payments p
           WHERE p.collected_by = s.id::text AND COALESCE(p.status,'') <> 'failed'
             AND p.created_at >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
             AND p.created_at < COALESCE($2::date, CURRENT_DATE) + INTERVAL '1 day'
         ) col ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER (WHERE checkin_at IS NOT NULL) AS visits,
                  COUNT(DISTINCT customer_id) FILTER (WHERE checkin_at IS NOT NULL) AS visited_customers
           FROM "${schema}".salesman_visits v
           WHERE v.salesman_id = s.id
             AND v.checkin_at >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
             AND v.checkin_at < COALESCE($2::date, CURRENT_DATE) + INTERVAL '1 day'
         ) vis ON true
         LEFT JOIN LATERAL (
           SELECT target_amount, target_collection, target_visits FROM "${schema}".salesman_targets t
           WHERE t.salesman_id = s.id AND t.period_month = date_trunc('month', COALESCE($1::date, CURRENT_DATE))::date
         ) tgt ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS beat_size,
                  COUNT(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM "${schema}".salesman_visits bv
                    WHERE bv.customer_id = b.customer_id AND bv.salesman_id = s.id AND bv.checkin_at IS NOT NULL
                      AND bv.checkin_at >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
                      AND bv.checkin_at < COALESCE($2::date, CURRENT_DATE) + INTERVAL '1 day'
                  )) AS beat_covered
           FROM "${schema}".salesman_beats b WHERE b.salesman_id = s.id
         ) bt ON true
         WHERE ($3::uuid IS NULL OR s.id = $3)
         ORDER BY order_value DESC, s.name`,
        [opts.from || null, opts.to || null, opts.salesmanId || null],
      ),
    );
  }

  /** Products a salesman (or the whole team) sells most in a range — qty + value. */
  topProducts(schema: string, opts: { from?: string; to?: string; salesmanId?: string; limit?: number }) {
    const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT oi.product_id,
                COALESCE(NULLIF(oi.product_name,''), p.name, 'Item') AS product_name,
                SUM(oi.quantity)::numeric AS qty,
                SUM(oi.total_price) AS value,
                COUNT(DISTINCT o.id)::int AS orders,
                COUNT(DISTINCT o.customer_id)::int AS customers
         FROM "${schema}".order_items oi
         JOIN "${schema}".orders o ON o.id = oi.order_id
         LEFT JOIN "${schema}".products p ON p.id = oi.product_id
         WHERE o.salesman_id IS NOT NULL
           AND ($3::uuid IS NULL OR o.salesman_id = $3)
           AND oi.unit_price > 0
           AND o.placed_at >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
           AND o.placed_at < COALESCE($2::date, CURRENT_DATE) + INTERVAL '1 day'
         GROUP BY oi.product_id, COALESCE(NULLIF(oi.product_name,''), p.name, 'Item')
         ORDER BY qty DESC, value DESC
         LIMIT ${limit}`,
        [opts.from || null, opts.to || null, opts.salesmanId || null],
      ),
    );
  }

  /** Day-wise orders + collections for one salesman (their trend line). */
  dayWise(schema: string, salesmanId: string, opts: { from?: string; to?: string }) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `WITH days AS (
           SELECT generate_series(
             COALESCE($2::date, CURRENT_DATE - INTERVAL '30 days')::date,
             COALESCE($3::date, CURRENT_DATE)::date, '1 day')::date AS d
         )
         SELECT d.d AS day,
           COALESCE((SELECT SUM(total) FROM "${schema}".orders o WHERE o.salesman_id = $1 AND o.placed_at::date = d.d),0) AS sales,
           COALESCE((SELECT COUNT(*) FROM "${schema}".orders o WHERE o.salesman_id = $1 AND o.placed_at::date = d.d),0)::int AS orders,
           COALESCE((SELECT SUM(amount) FROM "${schema}".payments p WHERE p.collected_by = $1::text AND p.created_at::date = d.d AND COALESCE(p.status,'') <> 'failed'),0) AS collected,
           COALESCE((SELECT COUNT(*) FROM "${schema}".salesman_visits v WHERE v.salesman_id = $1 AND v.checkin_at::date = d.d),0)::int AS visits
         FROM days d ORDER BY d.d`,
        [salesmanId, opts.from || null, opts.to || null],
      ),
    );
  }

  /** A salesman's own snapshot for the app home (today + this month + target). */
  async myStats(schema: string, salesmanId: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const [today] = await qr.query(
        `SELECT
           COALESCE((SELECT SUM(total) FROM "${schema}".orders o WHERE o.salesman_id = $1 AND o.placed_at::date = CURRENT_DATE),0) AS sales_today,
           COALESCE((SELECT COUNT(*) FROM "${schema}".orders o WHERE o.salesman_id = $1 AND o.placed_at::date = CURRENT_DATE),0)::int AS orders_today,
           COALESCE((SELECT SUM(amount) FROM "${schema}".payments p WHERE p.collected_by = $1::text AND p.created_at::date = CURRENT_DATE AND COALESCE(p.status,'') <> 'failed'),0) AS collected_today,
           COALESCE((SELECT COUNT(*) FROM "${schema}".salesman_visits v WHERE v.salesman_id = $1 AND v.checkin_at::date = CURRENT_DATE),0)::int AS visits_today`,
        [salesmanId],
      );
      const [month] = await qr.query(
        `SELECT
           COALESCE((SELECT SUM(total) FROM "${schema}".orders o WHERE o.salesman_id = $1 AND o.placed_at >= date_trunc('month',CURRENT_DATE)),0) AS sales_month,
           COALESCE((SELECT SUM(amount) FROM "${schema}".payments p WHERE p.collected_by = $1::text AND p.created_at >= date_trunc('month',CURRENT_DATE) AND COALESCE(p.status,'') <> 'failed'),0) AS collected_month,
           COALESCE((SELECT COUNT(*) FROM "${schema}".salesman_visits v WHERE v.salesman_id = $1 AND v.checkin_at >= date_trunc('month',CURRENT_DATE)),0)::int AS visits_month`,
        [salesmanId],
      );
      const [target] = await qr.query(
        `SELECT target_amount, target_collection, target_visits FROM "${schema}".salesman_targets
         WHERE salesman_id = $1 AND period_month = date_trunc('month',CURRENT_DATE)::date`,
        [salesmanId],
      );
      const [beatCount] = await qr.query(`SELECT COUNT(*)::int AS n FROM "${schema}".salesman_beats WHERE salesman_id = $1`, [salesmanId]);
      const trend = await qr.query(
        `WITH days AS (
           SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day')::date AS d
         )
         SELECT d.d AS day,
           COALESCE((SELECT SUM(total) FROM "${schema}".orders o WHERE o.salesman_id = $1 AND o.placed_at::date = d.d),0)::float AS sales,
           COALESCE((SELECT SUM(amount) FROM "${schema}".payments p WHERE p.collected_by = $1::text AND p.created_at::date = d.d AND COALESCE(p.status,'') <> 'failed'),0)::float AS collected
         FROM days d ORDER BY d.d`,
        [salesmanId],
      );
      return {
        trend: trend.map((r: any) => ({ day: r.day, sales: round2(Number(r.sales) || 0), collected: round2(Number(r.collected) || 0) })),
        today: {
          sales: round2(Number(today?.sales_today) || 0), orders: Number(today?.orders_today) || 0,
          collected: round2(Number(today?.collected_today) || 0), visits: Number(today?.visits_today) || 0,
        },
        month: {
          sales: round2(Number(month?.sales_month) || 0), collected: round2(Number(month?.collected_month) || 0),
          visits: Number(month?.visits_month) || 0,
        },
        target: {
          amount: round2(Number(target?.target_amount) || 0), collection: round2(Number(target?.target_collection) || 0),
          visits: Number(target?.target_visits) || 0,
        },
        beatSize: Number(beatCount?.n) || 0,
      };
    });
  }
}
