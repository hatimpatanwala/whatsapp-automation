import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { OrderService } from '../order/order.service';
import { QuoteService } from '../quote/quote.service';
import { EventBusService } from '../events/event-bus.service';
import { BuilderSubmittedEvent } from '../events/domain-events';
import { PromotionsEngine, CartItemInput } from '../promotions/promotions-engine.service';
import { CouponService } from '../promotions/coupon.service';

export type BuilderType = 'order' | 'quote';

interface CreateSessionInput {
  tenantId: string;
  schemaName: string;
  type: BuilderType;
  customerId?: string | null;
  customerPhone?: string | null;
  customerName?: string | null;
  conversationId?: string | null;
  createdBy?: string | null;
}

interface BuilderItemInput {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  gstRate?: number;
}

/**
 * Backs the secure "Builder" webview — a hosted page opened inside WhatsApp's
 * in-app browser (or the tenant panel) where an admin builds a new order/quote
 * (pick products, set qty + price) and submits it into the tenant's schema.
 *
 * Security: each builder link carries a single-use, time-limited, random token.
 * The token row (public.builder_sessions) carries the tenant + type + customer,
 * so the page needs NO login — and without a valid token the page is useless
 * (it cannot be opened in a plain browser). The token is invalidated on submit
 * and after a 2-hour TTL. We store only a SHA-256 hash of the token.
 */
@Injectable()
export class BuilderService implements OnModuleInit {
  private readonly logger = new Logger(BuilderService.name);
  private readonly ttlMs = 2 * 60 * 60 * 1000; // 2 hours

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly connectionManager: TenantConnectionManager,
    private readonly orderService: OrderService,
    private readonly quoteService: QuoteService,
    private readonly config: ConfigService,
    private readonly eventBus: EventBusService,
    private readonly promotions: PromotionsEngine,
    private readonly coupons: CouponService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Self-creating + idempotent (there is no public-schema migration runner).
    try {
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS public.builder_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token_hash VARCHAR(64) NOT NULL UNIQUE,
          tenant_id UUID NOT NULL,
          schema_name VARCHAR(120) NOT NULL,
          type VARCHAR(10) NOT NULL,
          customer_id UUID,
          customer_phone VARCHAR(32),
          customer_name VARCHAR(200),
          conversation_id UUID,
          created_by VARCHAR(64),
          status VARCHAR(16) NOT NULL DEFAULT 'open',
          result_id UUID,
          result_number VARCHAR(40),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
      // 'build' = create order/quote; 'view' = read-only customer view of a result.
      await this.ds.query(
        `ALTER TABLE public.builder_sessions ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'build'`,
      );
    } catch (e: any) {
      this.logger.error(`Failed to ensure builder_sessions table: ${e?.message || e}`);
    }
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Mint a builder session + return the secret token and the full webview URL. */
  async createSession(input: CreateSessionInput): Promise<{ token: string; url: string; path: string }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.ds.query(
      `INSERT INTO public.builder_sessions
         (token_hash, tenant_id, schema_name, type, customer_id, customer_phone, customer_name, conversation_id, created_by, status, mode, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open','build',$10)`,
      [
        this.hash(token),
        input.tenantId,
        input.schemaName,
        input.type,
        input.customerId || null,
        input.customerPhone || null,
        input.customerName || null,
        input.conversationId || null,
        input.createdBy || null,
        expiresAt,
      ],
    );
    const base = (this.config.get<string>('FRONTEND_URL', '') || '').replace(/\/$/, '');
    const path = `/m/builder?token=${token}`;
    return { token, url: `${base}${path}`, path };
  }

  /** Mint a read-only VIEW link for a created order/quote (for the customer). */
  async createViewSession(input: {
    tenantId: string;
    schemaName: string;
    type: BuilderType;
    resultId: string;
    resultNumber: string;
    customerId?: string | null;
    customerPhone?: string | null;
  }): Promise<{ token: string; url: string }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await this.ds.query(
      `INSERT INTO public.builder_sessions
         (token_hash, tenant_id, schema_name, type, customer_id, customer_phone, status, mode, result_id, result_number, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,'open','view',$7,$8,$9)`,
      [
        this.hash(token),
        input.tenantId,
        input.schemaName,
        input.type,
        input.customerId || null,
        input.customerPhone || null,
        input.resultId,
        input.resultNumber,
        expiresAt,
      ],
    );
    const base = (this.config.get<string>('FRONTEND_URL', '') || '').replace(/\/$/, '');
    return { token, url: `${base}/m/view?token=${token}` };
  }

  /** Mint a view link for the customer's most recent order/quote (for "Check the order" taps). */
  async createViewForLatestResult(
    tenantId: string,
    schemaName: string,
    type: BuilderType,
    customerId: string,
  ): Promise<{ url: string; number: string } | null> {
    const latest = await this.connectionManager.executeInTenantContext(schemaName, async (qr) => {
      if (type === 'order') {
        const r = await qr.query(
          `SELECT id, order_number AS number FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [customerId],
        );
        return r[0] || null;
      }
      const r = await qr.query(
        `SELECT id, quote_number AS number FROM quotes WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [customerId],
      );
      return r[0] || null;
    });
    if (!latest) return null;
    const { url } = await this.createViewSession({
      tenantId,
      schemaName,
      type,
      resultId: latest.id,
      resultNumber: latest.number,
      customerId,
    });
    return { url, number: latest.number };
  }

  /** Read-only details of the order/quote behind a VIEW token. */
  async getResult(token: string): Promise<any> {
    const s = await this.resolveSession(token, 'view');
    return this.connectionManager.executeInTenantContext(s.schema_name, async (qr) => {
      const cust = (await qr.query(`SELECT name, phone FROM customers WHERE id = $1`, [s.customer_id]))[0];
      const customer = { name: cust?.name || null, phone: cust?.phone || null };
      if (s.type === 'order') {
        const o = (await qr.query(
          `SELECT order_number, status, subtotal, tax_amount, discount, delivery_fee, total, currency, notes, created_at FROM orders WHERE id = $1`,
          [s.result_id],
        ))[0];
        if (!o) throw new NotFoundException('Order not found.');
        const items = await qr.query(
          `SELECT product_name AS name, quantity, unit_price, total_price FROM order_items WHERE order_id = $1`,
          [s.result_id],
        );
        return {
          type: 'order',
          number: o.order_number,
          status: o.status,
          subtotal: Number(o.subtotal),
          taxAmount: Number(o.tax_amount) || 0,
          discount: Number(o.discount) || 0,
          deliveryFee: Number(o.delivery_fee) || 0,
          total: Number(o.total),
          currency: o.currency || 'INR',
          notes: o.notes || null,
          createdAt: o.created_at,
          customer,
          items: items.map((i: any) => ({
            name: i.name,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unit_price),
            total: Number(i.total_price),
            free: Number(i.unit_price) === 0 || /^🎁\s*FREE/i.test(i.name || ''),
          })),
        };
      }
      const q = (await qr.query(
        `SELECT quote_number, title, status, subtotal, tax_amount, total_amount, notes, valid_until, created_at FROM quotes WHERE id = $1`,
        [s.result_id],
      ))[0];
      if (!q) throw new NotFoundException('Quote not found.');
      const items = await qr.query(
        `SELECT description AS name, quantity, unit_price, line_total FROM quote_items WHERE quote_id = $1 ORDER BY sort_order`,
        [s.result_id],
      );
      return {
        type: 'quote',
        number: q.quote_number,
        title: q.title,
        status: q.status,
        subtotal: Number(q.subtotal),
        taxAmount: Number(q.tax_amount) || 0,
        total: Number(q.total_amount),
        currency: 'INR',
        notes: q.notes || null,
        validUntil: q.valid_until || null,
        createdAt: q.created_at,
        customer,
        items: items.map((i: any) => ({
          name: i.name,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unit_price),
          total: Number(i.line_total),
          free: Number(i.unit_price) === 0,
        })),
      };
    });
  }

  /** Mint a BULK session (admin downloads/uploads the products sheet over the web). */
  async createBulkSession(input: { tenantId: string; schemaName: string; createdBy?: string }): Promise<{ token: string; url: string }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.ds.query(
      `INSERT INTO public.builder_sessions (token_hash, tenant_id, schema_name, type, status, mode, expires_at)
       VALUES ($1,$2,$3,'bulk','open','bulk',$4)`,
      [this.hash(token), input.tenantId, input.schemaName, expiresAt],
    );
    const base = (this.config.get<string>('FRONTEND_URL', '') || '').replace(/\/$/, '');
    return { token, url: `${base}/m/bulk?token=${token}` };
  }

  /** Mint a session for the single-product add web page (same 'bulk' access). */
  async createProductSession(input: { tenantId: string; schemaName: string; createdBy?: string }): Promise<{ token: string; url: string }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.ds.query(
      `INSERT INTO public.builder_sessions (token_hash, tenant_id, schema_name, type, status, mode, expires_at)
       VALUES ($1,$2,$3,'bulk','open','bulk',$4)`,
      [this.hash(token), input.tenantId, input.schemaName, expiresAt],
    );
    const base = (this.config.get<string>('FRONTEND_URL', '') || '').replace(/\/$/, '');
    return { token, url: `${base}/m/product?token=${token}` };
  }

  /** Validate a BULK token → the tenant schema it operates on. */
  async getBulkSchema(token: string): Promise<{ schemaName: string; tenantId: string }> {
    const s = await this.resolveSession(token, 'bulk');
    return { schemaName: s.schema_name, tenantId: s.tenant_id };
  }

  /** Mint a PROMO session (admin manages schemes/coupons over the web from WhatsApp). */
  async createPromoSession(input: { tenantId: string; schemaName: string; createdBy?: string }): Promise<{ token: string; url: string }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.ds.query(
      `INSERT INTO public.builder_sessions (token_hash, tenant_id, schema_name, type, status, mode, expires_at)
       VALUES ($1,$2,$3,'promo','open','promo',$4)`,
      [this.hash(token), input.tenantId, input.schemaName, expiresAt],
    );
    const base = (this.config.get<string>('FRONTEND_URL', '') || '').replace(/\/$/, '');
    return { token, url: `${base}/m/promotions?token=${token}` };
  }

  /** Validate a PROMO token → the tenant schema it operates on. */
  async getPromoSchema(token: string): Promise<{ schemaName: string; tenantId: string }> {
    const s = await this.resolveSession(token, 'promo');
    return { schemaName: s.schema_name, tenantId: s.tenant_id };
  }

  /** Mint a CUSTOMERS session (admin views customer segments over the web from WhatsApp). */
  async createCustomersSession(input: { tenantId: string; schemaName: string; createdBy?: string }): Promise<{ token: string; url: string }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.ds.query(
      `INSERT INTO public.builder_sessions (token_hash, tenant_id, schema_name, type, status, mode, expires_at)
       VALUES ($1,$2,$3,'customers','open','customers',$4)`,
      [this.hash(token), input.tenantId, input.schemaName, expiresAt],
    );
    const base = (this.config.get<string>('FRONTEND_URL', '') || '').replace(/\/$/, '');
    return { token, url: `${base}/m/customers?token=${token}` };
  }

  /** Validate a CUSTOMERS token → the tenant schema it operates on. */
  async getCustomersSchema(token: string): Promise<{ schemaName: string; tenantId: string }> {
    const s = await this.resolveSession(token, 'customers');
    return { schemaName: s.schema_name, tenantId: s.tenant_id };
  }

  /** Mint a SHOP session — a customer-facing ecommerce webview bound to a customer. */
  async createShopSession(input: {
    tenantId: string;
    schemaName: string;
    customerId?: string | null;
    customerPhone?: string | null;
    customerName?: string | null;
  }): Promise<{ token: string; url: string }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days — customers browse at leisure
    await this.ds.query(
      `INSERT INTO public.builder_sessions
         (token_hash, tenant_id, schema_name, type, customer_id, customer_phone, customer_name, status, mode, expires_at)
       VALUES ($1,$2,$3,'shop',$4,$5,$6,'open','shop',$7)`,
      [this.hash(token), input.tenantId, input.schemaName, input.customerId || null, input.customerPhone || null, input.customerName || null, expiresAt],
    );
    const base = (this.config.get<string>('FRONTEND_URL', '') || '').replace(/\/$/, '');
    return { token, url: `${base}/m/shop?token=${token}` };
  }

  /** Resolve + validate a SHOP token → its session row (tenant, schema, customer). */
  async getShopSession(token: string): Promise<any> {
    return this.resolveSession(token, 'shop');
  }

  /** Categories / brands / products / customers for the promo scope & audience pickers. */
  async promoTaxonomy(schema: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const [categories, brands, products, customers] = await Promise.all([
        qr.query(`SELECT id, name FROM categories WHERE is_active = true ORDER BY sort_order, name`),
        qr.query(`SELECT id, name FROM brands WHERE is_active = true ORDER BY sort_order, name`),
        qr.query(`SELECT id, name FROM products WHERE is_active = true ORDER BY name LIMIT 500`),
        qr.query(
          `SELECT id, name, phone FROM customers
            ORDER BY (last_order_at IS NULL), last_order_at DESC NULLS LAST, name ASC
            LIMIT 200`,
        ),
      ]);
      return {
        categories: categories.map((r: any) => ({ id: r.id, name: r.name })),
        brands: brands.map((r: any) => ({ id: r.id, name: r.name })),
        products: products.map((r: any) => ({ id: r.id, name: r.name })),
        customers: customers.map((r: any) => ({ id: r.id, name: r.name || r.phone || '', phone: r.phone || '' })),
      };
    });
  }

  /** Resolve + validate a token to its (open, unexpired) session row. */
  private async resolveSession(token: string, expectedMode: 'build' | 'view' | 'bulk' | 'promo' | 'shop' | 'customers' = 'build'): Promise<any> {
    if (!token) throw new UnauthorizedException('Missing builder token.');
    const rows = await this.ds.query(
      `SELECT * FROM public.builder_sessions WHERE token_hash = $1`,
      [this.hash(token)],
    );
    const s = rows[0];
    if (!s) throw new UnauthorizedException('Invalid link.');
    if ((s.mode || 'build') !== expectedMode) throw new ForbiddenException('This link is not valid here.');
    // 'view' links stay usable until expiry; 'build' links are single-use.
    if (expectedMode === 'build' && s.status !== 'open') {
      throw new ForbiddenException('This builder link has already been used.');
    }
    if (new Date(s.expires_at).getTime() < Date.now()) {
      throw new ForbiddenException('This link has expired. Please request a new one.');
    }
    return s;
  }

  /** Context for the page: type + (pre-bound) customer. */
  async getSession(token: string): Promise<any> {
    const s = await this.resolveSession(token);
    return {
      type: s.type as BuilderType,
      customer: { phone: s.customer_phone || null, name: s.customer_name || null },
      customerLocked: !!s.customer_id || !!s.customer_phone,
      whatsappPhone: await this.tenantWhatsappPhone(s.tenant_id),
    };
  }

  /** The tenant's WhatsApp business number (digits only) for "return to chat" links. */
  async tenantWhatsappPhone(tenantId: string): Promise<string> {
    const t = await this.ds.query(`SELECT whatsapp_phone FROM public.tenants WHERE id = $1`, [tenantId]);
    return String(t[0]?.whatsapp_phone || '').replace(/[^0-9]/g, '');
  }

  /** Active products with live stock for the token's tenant. */
  async getProducts(token: string): Promise<any[]> {
    const s = await this.resolveSession(token);
    const badges = await this.promotions.productBadges(s.schema_name).catch(() => null);
    return this.connectionManager.executeInTenantContext(s.schema_name, async (qr) => {
      const rows = await qr.query(
        `SELECT p.id, p.name, p.base_price, p.sale_price, p.currency, p.thumbnail, p.gst_rate,
                p.uom, p.hsn_code, p.slug, p.category_id, p.brand_id, p.metadata,
                b.name AS brand_name,
                COALESCE(inv.stock_quantity, 0) AS stock_quantity
           FROM products p
           LEFT JOIN brands b ON b.id = p.brand_id
           LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.variant_id IS NULL
          WHERE p.is_active = true
          ORDER BY p.sort_order ASC NULLS LAST, p.name ASC`,
      );
      return rows.map((r: any) => {
        const meta = typeof r.metadata === 'string' ? safeJson(r.metadata) : (r.metadata || {});
        const tags: string[] = Array.isArray(meta.tags) ? meta.tags : [];
        return {
          id: r.id,
          name: r.name,
          brand: r.brand_name || null,
          sku: r.slug || null,
          price: Number(r.sale_price ?? r.base_price ?? 0),
          basePrice: Number(r.base_price ?? 0),
          currency: r.currency || 'INR',
          thumbnail: r.thumbnail || null,
          stock: Number(r.stock_quantity ?? 0),
          gstRate: Number(r.gst_rate ?? 0),
          uom: r.uom || 'pcs',
          hsnCode: r.hsn_code || null,
          tags,
          isNew: tags.some((t) => /^(new|new[\s-]?arrival)$/i.test(String(t).trim())),
          offer: badges
            ? (badges.products[r.id] || badges.categories[r.category_id] || badges.brands[r.brand_id] || badges.all || null)
            : null,
        };
      });
    });
  }

  /** Evaluate the built cart against active offer schemes (for the builder webview). */
  async evaluateOffers(token: string, items: CartItemInput[]): Promise<any> {
    const s = await this.resolveSession(token);
    return this.promotions.evaluateCart(s.schema_name, items || [], s.customer_id || undefined);
  }

  /** Validate a coupon code against the built cart (for the builder webview). */
  async applyCoupon(token: string, code: string, items: CartItemInput[]): Promise<any> {
    const s = await this.resolveSession(token);
    return this.coupons.validate(s.schema_name, code, items || [], s.customer_id || undefined);
  }

  /** Search the token's tenant customers by name or phone (for the picker). */
  async searchCustomers(token: string, q: string): Promise<{ id: string; name: string; phone: string }[]> {
    const s = await this.resolveSession(token);
    const term = (q || '').trim();
    return this.connectionManager.executeInTenantContext(s.schema_name, async (qr) => {
      const rows = term
        ? await qr.query(
            `SELECT id, name, phone FROM customers
              WHERE name ILIKE $1 OR phone ILIKE $1
              ORDER BY (last_order_at IS NULL), last_order_at DESC NULLS LAST, name ASC
              LIMIT 15`,
            [`%${term}%`],
          )
        : await qr.query(
            `SELECT id, name, phone FROM customers
              ORDER BY (last_order_at IS NULL), last_order_at DESC NULLS LAST, name ASC
              LIMIT 15`,
          );
      return rows.map((r: any) => ({ id: r.id, name: r.name || '', phone: r.phone || '' }));
    });
  }

  /** Submit the built order/quote into the tenant schema; invalidate the token. */
  async submit(
    token: string,
    payload: {
      items: BuilderItemInput[];
      customerId?: string;
      customer?: { phone?: string; name?: string };
      title?: string;
      notes?: string;
      discount?: number;
      deliveryFee?: number;
      couponCode?: string;
    },
  ): Promise<{ type: BuilderType; id: string; number: string }> {
    const s = await this.resolveSession(token);
    const items = (payload?.items || []).filter((i) => i && i.quantity > 0);
    if (!items.length) throw new BadRequestException('Add at least one item before submitting.');
    for (const it of items) {
      if (it.unitPrice == null || Number(it.unitPrice) < 0) {
        throw new BadRequestException(`Set a valid price for "${it.name}".`);
      }
    }

    // Tax is computed server-side from each item's GST rate (never trusted from
    // the client). Discount + delivery are admin-entered.
    const taxAmount = items.reduce(
      (sum, it) => sum + Number(it.quantity) * Number(it.unitPrice) * (Number(it.gstRate) || 0) / 100,
      0,
    );
    const discount = Math.max(0, Number(payload.discount) || 0);
    const deliveryFee = Math.max(0, Number(payload.deliveryFee) || 0);

    const schema = s.schema_name;
    let customerId: string | null = s.customer_id;
    let customerPhone: string | null = s.customer_phone;
    let customerName: string | null = s.customer_name;
    if (!customerId) {
      if (payload.customerId) {
        // Existing customer chosen from the picker — verify it belongs to tenant.
        const found = await this.lookupCustomer(schema, payload.customerId);
        if (!found) throw new BadRequestException('Selected customer was not found.');
        customerId = found.id;
        customerPhone = found.phone;
        customerName = found.name;
      } else {
        const phone = (payload.customer?.phone || s.customer_phone || '').trim();
        if (!phone) throw new BadRequestException('Customer phone number is required.');
        customerName = payload.customer?.name || s.customer_name || null;
        customerId = await this.resolveCustomer(schema, phone, customerName);
        customerPhone = phone;
      }
    } else if (!customerPhone) {
      const found = await this.lookupCustomer(schema, customerId);
      customerPhone = found?.phone || null;
      customerName = customerName || found?.name || null;
    }

    // Coupon: validate server-side (never trust the client's amount) and fold its
    // discount in; redeem after the order/quote is created.
    let couponId: string | null = null;
    let couponDiscount = 0;
    if (payload.couponCode && payload.couponCode.trim()) {
      const cartItems = items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) }));
      const v = await this.coupons.validate(schema, payload.couponCode, cartItems, customerId || undefined);
      if (!v.valid) throw new BadRequestException(v.reason || 'Coupon could not be applied.');
      couponId = v.coupon!.id;
      couponDiscount = v.discount;
    }
    const totalDiscount = Math.round((discount + couponDiscount) * 100) / 100;

    let resultId: string;
    let resultNumber: string;
    const type = s.type as BuilderType;

    if (type === 'order') {
      const order = await this.orderService.createDirect(schema, {
        customerId: customerId!,
        notes: payload.notes,
        discount: totalDiscount,
        deliveryFee,
        taxAmount,
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.name,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        })),
      });
      resultId = order.id;
      resultNumber = order.order_number;
    } else {
      const quote = await this.quoteService.create(schema, {
        customerId: customerId!,
        title: payload.title,
        notes: payload.notes,
        discount: totalDiscount,
        taxAmount,
        items: items.map((i) => ({
          productId: i.productId,
          description: i.name,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        })),
      });
      resultId = quote.id;
      resultNumber = quote.quote_number;
    }

    if (couponId && couponDiscount > 0) {
      await this.coupons.redeem(schema, couponId, customerId || null, resultId, couponDiscount).catch(() => undefined);
    }

    await this.ds.query(
      `UPDATE public.builder_sessions SET status = 'submitted', result_id = $1, result_number = $2 WHERE id = $3`,
      [resultId, resultNumber, s.id],
    );

    // Notify the customer (window-aware) via the builder.submitted listener.
    this.eventBus.emit(
      new BuilderSubmittedEvent(schema, s.tenant_id, type, resultId, resultNumber, customerId!, customerPhone, customerName),
    );

    this.logger.log(`Builder submit: ${type} ${resultNumber} for tenant ${s.tenant_id}`);
    return { type, id: resultId, number: resultNumber };
  }

  private async lookupCustomer(
    schema: string,
    id: string,
  ): Promise<{ id: string; name: string; phone: string } | null> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(`SELECT id, name, phone FROM customers WHERE id = $1 LIMIT 1`, [id]);
      return rows[0] ? { id: rows[0].id, name: rows[0].name || '', phone: rows[0].phone || '' } : null;
    });
  }

  private async resolveCustomer(schema: string, phone: string, name?: string | null): Promise<string> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const existing = await qr.query(`SELECT id FROM customers WHERE phone = $1 LIMIT 1`, [phone]);
      if (existing[0]) return existing[0].id;
      const created = await qr.query(
        `INSERT INTO customers (phone, name) VALUES ($1, $2) RETURNING id`,
        [phone, name || phone],
      );
      return created[0].id;
    });
  }
}

function safeJson(s: string): any {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}
