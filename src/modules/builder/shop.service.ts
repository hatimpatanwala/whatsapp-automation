import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { PromotionsEngine } from '../promotions/promotions-engine.service';
import { CouponService } from '../promotions/coupon.service';
import { OrderService } from '../order/order.service';
import { BuilderService } from './builder.service';

interface ShopSession {
  schema_name: string;
  tenant_id: string;
  customer_id: string | null;
  customer_phone: string | null;
  customer_name: string | null;
}

function safeJson(s: any): any {
  if (typeof s !== 'string') return s || {};
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

/**
 * Backs the customer-facing SHOP webview (/m/shop) — an ecommerce storefront
 * opened from WhatsApp. Reads/writes the customer's REAL active cart (so it stays
 * in sync with the in-chat cart), auto-applies offer schemes + coupons, and
 * places the order on checkout (emitting OrderCreatedEvent → notifications +
 * loyalty). Token-authenticated via a 'shop' builder session.
 */
@Injectable()
export class ShopService {
  constructor(
    private readonly conn: TenantConnectionManager,
    private readonly promotions: PromotionsEngine,
    private readonly coupons: CouponService,
    private readonly orders: OrderService,
    private readonly builder: BuilderService,
  ) {}

  private async session(token: string): Promise<ShopSession> {
    return this.builder.getShopSession(token);
  }

  /** One-shot payload for the storefront: store info, taxonomy, products, cart. */
  async bootstrap(token: string): Promise<any> {
    const s = await this.session(token);
    const [store, taxonomy, products, cart, coupons] = await Promise.all([
      this.storeInfo(s),
      this.taxonomy(s.schema_name),
      this.products(token),
      this.getCart(token),
      this.publicCoupons(s.schema_name),
    ]);
    return {
      store,
      customer: { name: s.customer_name || null, phone: s.customer_phone || null },
      categories: taxonomy.categories,
      brands: taxonomy.brands,
      products,
      cart,
      coupons,
    };
  }

  private async storeInfo(s: ShopSession): Promise<{ name: string; currency: string; whatsappPhone: string; showPrices: boolean; cartEnabled: boolean }> {
    const t = await this.conn.executeGlobal(async (qr) =>
      (await qr.query(`SELECT business_name, name, whatsapp_phone FROM tenants WHERE id = $1`, [s.tenant_id]))[0]);
    const flags = await this.storefrontFlags(s.schema_name);
    return {
      name: t?.business_name || t?.name || 'Our Store',
      currency: 'INR',
      whatsappPhone: String(t?.whatsapp_phone || '').replace(/[^0-9]/g, ''),
      showPrices: flags.showPrices,
      cartEnabled: flags.cartEnabled,
    };
  }

  /** Storefront display toggles from tenant settings (both default ON; only an
   *  explicit false disables). Settings values may be raw booleans or JSON strings. */
  private async storefrontFlags(schema: string): Promise<{ showPrices: boolean; cartEnabled: boolean }> {
    const isOn = (v: any): boolean => {
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* keep string */ } }
      return v !== false; // undefined/null/true → ON; only explicit false → OFF
    };
    try {
      const rows = await this.conn.executeInTenantContext(schema, async (qr) =>
        qr.query(`SELECT key, value FROM "${schema}".settings WHERE key IN ('commerce_show_prices','commerce_cart_enabled')`));
      const m: Record<string, any> = {};
      for (const r of rows) m[r.key] = r.value;
      return {
        showPrices: isOn(m['commerce_show_prices']),
        cartEnabled: isOn(m['commerce_cart_enabled']),
      };
    } catch {
      return { showPrices: true, cartEnabled: true };
    }
  }

  private async taxonomy(schema: string): Promise<{ categories: any[]; brands: any[] }> {
    return this.conn.executeInTenantContext(schema, async (qr) => {
      const [categories, brands] = await Promise.all([
        qr.query(`SELECT id, name FROM categories WHERE is_active = true ORDER BY sort_order, name`),
        qr.query(`SELECT id, name FROM brands WHERE is_active = true ORDER BY sort_order, name`),
      ]);
      return {
        categories: categories.map((r: any) => ({ id: r.id, name: r.name })),
        brands: brands.map((r: any) => ({ id: r.id, name: r.name })),
      };
    });
  }

  /** Active products with offer badges + NEW tag, optionally filtered. */
  async products(token: string, filters?: { category?: string; brand?: string; q?: string }): Promise<any[]> {
    const s = await this.session(token);
    const badges = await this.promotions.productBadges(s.schema_name).catch(() => null);
    return this.conn.executeInTenantContext(s.schema_name, async (qr) => {
      const where: string[] = ['p.is_active = true'];
      const p: any[] = [];
      if (filters?.category) { p.push(filters.category); where.push(`p.category_id = $${p.length}`); }
      if (filters?.brand) { p.push(filters.brand); where.push(`p.brand_id = $${p.length}`); }
      if (filters?.q) { p.push(`%${filters.q}%`); where.push(`p.name ILIKE $${p.length}`); }
      const rows = await qr.query(
        `SELECT p.id, p.name, p.description, p.base_price, p.sale_price, p.currency, p.thumbnail, p.images,
                p.gst_rate, p.uom, p.category_id, p.brand_id, p.metadata,
                b.name AS brand_name,
                COALESCE(inv.stock_quantity, 0) AS stock_quantity
           FROM products p
           LEFT JOIN brands b ON b.id = p.brand_id
           LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.variant_id IS NULL
          WHERE ${where.join(' AND ')}
          ORDER BY p.sort_order ASC NULLS LAST, p.name ASC
          LIMIT 200`,
        p,
      );
      return rows.map((r: any) => {
        const meta = safeJson(r.metadata);
        const tags: string[] = Array.isArray(meta.tags) ? meta.tags : [];
        const image = r.thumbnail || (Array.isArray(r.images) && r.images.length ? r.images[0] : null);
        return {
          id: r.id,
          name: r.name,
          description: r.description || '',
          brand: r.brand_name || null,
          categoryId: r.category_id,
          brandId: r.brand_id,
          price: Number(r.sale_price ?? r.base_price ?? 0),
          basePrice: Number(r.base_price ?? 0),
          onSale: r.sale_price != null && Number(r.sale_price) < Number(r.base_price),
          currency: r.currency || 'INR',
          image,
          stock: Number(r.stock_quantity ?? 0),
          uom: r.uom || 'pcs',
          tags,
          isNew: tags.some((t) => /^(new|new[\s-]?arrival)$/i.test(String(t).trim())),
          offer: badges
            ? (badges.products[r.id] || badges.categories[r.category_id] || badges.brands[r.brand_id] || badges.all || null)
            : null,
        };
      });
    });
  }

  private async publicCoupons(schema: string): Promise<any[]> {
    return this.coupons.activePublic(schema).catch(() => []);
  }

  /** The customer's active cart, with offer schemes auto-evaluated. */
  async getCart(token: string, couponCode?: string): Promise<any> {
    const s = await this.session(token);
    if (!s.customer_id) return this.emptyCart();

    const items = await this.conn.executeInTenantContext(s.schema_name, async (qr) =>
      qr.query(
        `SELECT ci.product_id, p.name, p.thumbnail, p.images, p.uom, ci.quantity, ci.unit_price
           FROM cart_items ci
           JOIN carts c ON c.id = ci.cart_id
           JOIN products p ON p.id = ci.product_id
          WHERE c.customer_id = $1 AND c.status = 'active'
          ORDER BY ci.created_at ASC NULLS LAST`,
        [s.customer_id],
      ),
    );
    const lines = items.map((i: any) => ({
      productId: i.product_id,
      name: i.name,
      image: i.thumbnail || (Array.isArray(i.images) && i.images.length ? i.images[0] : null),
      uom: i.uom || 'pcs',
      quantity: Number(i.quantity),
      unitPrice: Number(i.unit_price),
      lineTotal: Number(i.quantity) * Number(i.unit_price),
    }));
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

    const offers = await this.promotions
      .evaluateCart(s.schema_name, lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })), s.customer_id || undefined)
      .catch(() => null);
    const schemeDiscount = offers ? Number(offers.discountTotal) || 0 : 0;
    const freeItems = offers?.freeItems || [];
    const appliedOffers = (offers?.applicable || [])
      .filter((a) => offers!.recommendedIds.includes(a.schemeId))
      .map((a) => ({ name: a.name, label: a.label }));

    let couponDiscount = 0;
    let coupon: any = null;
    let couponError: string | null = null;
    if (couponCode) {
      const v = await this.coupons
        .validate(s.schema_name, couponCode, lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })), s.customer_id || undefined)
        .catch(() => null);
      if (v?.valid) { couponDiscount = Number(v.discount) || 0; coupon = v.coupon; }
      else couponError = v?.reason || 'Invalid or expired coupon.';
    }

    const discount = schemeDiscount + couponDiscount;
    const total = Math.max(0, subtotal - discount);
    return {
      items: lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      subtotal,
      schemeDiscount,
      couponDiscount,
      discount,
      total,
      freeItems,
      appliedOffers,
      coupon,
      couponError,
    };
  }

  private emptyCart() {
    return { items: [], count: 0, subtotal: 0, schemeDiscount: 0, couponDiscount: 0, discount: 0, total: 0, freeItems: [], appliedOffers: [], coupon: null, couponError: null };
  }

  /** Add / update / remove a cart line (quantity <= 0 removes it). */
  async setItem(token: string, productId: string, quantity: number): Promise<any> {
    const s = await this.session(token);
    if (!s.customer_id) throw new BadRequestException('No customer for this session.');
    if (!productId) throw new BadRequestException('Missing product.');
    const qty = Math.max(0, Math.floor(Number(quantity) || 0));

    await this.conn.executeInTransaction(s.schema_name, async (qr) => {
      const prod = (await qr.query(
        `SELECT COALESCE(sale_price, base_price) AS price FROM products WHERE id = $1 AND is_active = true`,
        [productId],
      ))[0];
      if (!prod) throw new BadRequestException('Product not available.');

      let cart = (await qr.query(`SELECT id FROM carts WHERE customer_id = $1 AND status = 'active' LIMIT 1`, [s.customer_id]))[0];
      if (!cart) cart = (await qr.query(`INSERT INTO carts (customer_id, status) VALUES ($1, 'active') RETURNING id`, [s.customer_id]))[0];

      const existing = (await qr.query(`SELECT id FROM cart_items WHERE cart_id = $1 AND product_id = $2`, [cart.id, productId]))[0];
      if (qty <= 0) {
        if (existing) await qr.query(`DELETE FROM cart_items WHERE id = $1`, [existing.id]);
      } else if (existing) {
        await qr.query(`UPDATE cart_items SET quantity = $1 WHERE id = $2`, [qty, existing.id]);
      } else {
        await qr.query(`INSERT INTO cart_items (cart_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`, [cart.id, productId, qty, Number(prod.price)]);
      }
    });
    return this.getCart(token);
  }

  /** Clear the whole cart. */
  async clearCart(token: string): Promise<any> {
    const s = await this.session(token);
    if (s.customer_id) {
      await this.conn.executeInTenantContext(s.schema_name, async (qr) => {
        await qr.query(
          `DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE customer_id = $1 AND status = 'active')`,
          [s.customer_id],
        );
      });
    }
    return this.getCart(token);
  }

  /** Validate a coupon against the current cart (does not persist). */
  async checkCoupon(token: string, code: string): Promise<any> {
    return this.getCart(token, code);
  }

  /** Place the order from the active cart: apply offers + coupon, emit events. */
  async checkout(token: string, body: { couponCode?: string; notes?: string }): Promise<any> {
    const s = await this.session(token);
    if (!s.customer_id) throw new BadRequestException('No customer for this session.');

    const cart = await this.getCart(token, body?.couponCode);
    if (!cart.items.length) throw new BadRequestException('Your cart is empty.');
    if (body?.couponCode && cart.couponError) throw new BadRequestException(cart.couponError);

    // Build order items (real lines + any free items granted by offers).
    const items = cart.items.map((l: any) => ({ productId: l.productId, productName: l.name, quantity: l.quantity, unitPrice: l.unitPrice }));
    for (const f of cart.freeItems) {
      items.push({ productId: f.productId, productName: `🎁 FREE: ${f.name}`, quantity: f.quantity, unitPrice: 0 });
    }

    const order = await this.orders.createDirect(s.schema_name, {
      customerId: s.customer_id,
      items,
      discount: cart.discount,
      notes: body?.notes,
    });

    // Mark the cart consumed.
    await this.conn.executeInTenantContext(s.schema_name, async (qr) => {
      await qr.query(`UPDATE carts SET status = 'checked_out', updated_at = NOW() WHERE customer_id = $1 AND status = 'active'`, [s.customer_id]);
    });

    // Redeem the coupon (after the order exists) so usage is recorded.
    if (cart.coupon?.id && cart.couponDiscount > 0) {
      await this.coupons.redeem(s.schema_name, cart.coupon.id, s.customer_id, order.id, cart.couponDiscount).catch(() => undefined);
    }

    // A read-only details link for the success screen.
    const view = await this.builder.createViewSession({
      tenantId: s.tenant_id,
      schemaName: s.schema_name,
      type: 'order',
      resultId: order.id,
      resultNumber: order.order_number,
      customerId: s.customer_id,
      customerPhone: s.customer_phone,
    }).catch(() => null);

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      total: Number(order.total),
      viewUrl: view?.url || null,
    };
  }
}
