import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { CartItemInput } from './promotions-engine.service';
import { customerSegmentFlags } from './customer-segments';

export interface CouponInput {
  code: string;
  description?: string;
  discountType?: 'percent' | 'amount';
  discountValue?: number;
  minCartValue?: number;
  maxDiscount?: number | null;
  scope?: 'all' | 'category' | 'brand' | 'product';
  scopeIds?: string[];
  usageLimit?: number | null;
  perCustomerLimit?: number;
  audience?: 'all' | 'specific' | 'segment';
  audienceSegment?: string;
  customerIds?: string[];
  validFrom?: string | null;
  validUntil?: string | null;
  status?: string;
}

export interface CouponValidation {
  valid: boolean;
  reason?: string;
  discount: number;
  coupon?: { id: string; code: string; description: string; label: string };
}

@Injectable()
export class CouponService {
  constructor(private readonly conn: TenantConnectionManager) {}

  async findAll(schema: string): Promise<any[]> {
    return this.conn.executeInTenantContext(schema, async (qr) =>
      qr.query(`SELECT * FROM coupons ORDER BY created_at DESC`),
    );
  }

  async findById(schema: string, id: string): Promise<any> {
    return this.conn.executeInTenantContext(schema, async (qr) => {
      const r = await qr.query(`SELECT * FROM coupons WHERE id = $1`, [id]);
      if (!r[0]) throw new NotFoundException('Coupon not found');
      const customers = await qr.query(`SELECT customer_id FROM coupon_customers WHERE coupon_id = $1`, [id]);
      return { ...r[0], customerIds: customers.map((c: any) => c.customer_id) };
    });
  }

  async create(schema: string, data: CouponInput): Promise<any> {
    const code = (data.code || '').trim().toUpperCase();
    if (!code) throw new BadRequestException('Coupon code is required.');
    return this.conn.executeInTransaction(schema, async (qr) => {
      const dup = await qr.query(`SELECT 1 FROM coupons WHERE UPPER(code) = $1 LIMIT 1`, [code]);
      if (dup.length) throw new BadRequestException('A coupon with this code already exists.');
      const r = await qr.query(
        `INSERT INTO coupons
           (code, description, discount_type, discount_value, min_cart_value, max_discount, scope, scope_ids, usage_limit, per_customer_limit, audience, audience_segment, valid_from, valid_until, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [
          code, data.description || null, data.discountType || 'percent', Number(data.discountValue) || 0,
          Number(data.minCartValue) || 0, data.maxDiscount != null ? Number(data.maxDiscount) : null,
          data.scope || 'all', data.scopeIds || [], data.usageLimit != null ? Number(data.usageLimit) : null,
          Number(data.perCustomerLimit) || 1, data.audience || 'all', data.audience === 'segment' ? (data.audienceSegment || null) : null,
          data.validFrom || null, data.validUntil || null, data.status || 'active',
        ],
      );
      const coupon = r[0];
      if (data.audience === 'specific' && Array.isArray(data.customerIds)) {
        for (const cid of data.customerIds) {
          await qr.query(`INSERT INTO coupon_customers (coupon_id, customer_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [coupon.id, cid]);
        }
      }
      return coupon;
    });
  }

  async update(schema: string, id: string, data: CouponInput): Promise<any> {
    await this.conn.executeInTransaction(schema, async (qr) => {
      const map: Record<string, any> = {
        code: data.code != null ? data.code.trim().toUpperCase() : undefined,
        description: data.description, discount_type: data.discountType, discount_value: data.discountValue,
        min_cart_value: data.minCartValue, max_discount: data.maxDiscount, scope: data.scope, scope_ids: data.scopeIds,
        usage_limit: data.usageLimit, per_customer_limit: data.perCustomerLimit, audience: data.audience,
        audience_segment: data.audience === 'segment' ? (data.audienceSegment ?? null) : (data.audience !== undefined ? null : undefined),
        valid_from: data.validFrom, valid_until: data.validUntil, status: data.status,
      };
      const fields: string[] = []; const p: any[] = [];
      for (const [col, val] of Object.entries(map)) if (val !== undefined) { p.push(val); fields.push(`${col} = $${p.length}`); }
      if (fields.length) { fields.push(`updated_at = NOW()`); p.push(id);
        const r = await qr.query(`UPDATE coupons SET ${fields.join(', ')} WHERE id = $${p.length} RETURNING id`, p);
        if (!r[0]) throw new NotFoundException('Coupon not found');
      }
      if (data.audience === 'specific' && Array.isArray(data.customerIds)) {
        await qr.query(`DELETE FROM coupon_customers WHERE coupon_id = $1`, [id]);
        for (const cid of data.customerIds) await qr.query(`INSERT INTO coupon_customers (coupon_id, customer_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, cid]);
      }
    });
    return this.findById(schema, id);
  }

  async setStatus(schema: string, id: string, status: string): Promise<any> {
    return this.conn.executeInTenantContext(schema, async (qr) => {
      const r = await qr.query(`UPDATE coupons SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [status, id]);
      if (!r[0]) throw new NotFoundException('Coupon not found');
      return r[0];
    });
  }

  async delete(schema: string, id: string): Promise<{ deleted: boolean }> {
    return this.conn.executeInTenantContext(schema, async (qr) => {
      await qr.query(`DELETE FROM coupons WHERE id = $1`, [id]);
      return { deleted: true };
    });
  }

  /** Validate a code against a cart → discount (does NOT redeem). */
  async validate(schema: string, code: string, items: CartItemInput[], customerId?: string): Promise<CouponValidation> {
    const c = (code || '').trim().toUpperCase();
    if (!c) return { valid: false, reason: 'Enter a coupon code.', discount: 0 };
    const lines = (items || []).filter((i) => i && i.productId && Number(i.quantity) > 0);
    const subtotal = (items || []).reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);

    return this.conn.executeInTenantContext(schema, async (qr) => {
      const coupon = (await qr.query(
        `SELECT * FROM coupons WHERE UPPER(code) = $1
           AND status = 'active'
           AND (valid_from IS NULL OR valid_from <= NOW())
           AND (valid_until IS NULL OR valid_until >= NOW()) LIMIT 1`,
        [c],
      ))[0];
      if (!coupon) return { valid: false, reason: 'Invalid or expired coupon.', discount: 0 };

      if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) {
        return { valid: false, reason: 'This coupon has reached its usage limit.', discount: 0 };
      }
      if (coupon.audience === 'specific') {
        if (!customerId) return { valid: false, reason: 'This coupon is not available for you.', discount: 0 };
        const tgt = await qr.query(`SELECT 1 FROM coupon_customers WHERE coupon_id = $1 AND customer_id = $2 LIMIT 1`, [coupon.id, customerId]);
        if (!tgt.length) return { valid: false, reason: 'This coupon is not available for you.', discount: 0 };
      }
      if (coupon.audience === 'segment') {
        if (!customerId) return { valid: false, reason: 'This coupon is not available for you.', discount: 0 };
        const flags = await customerSegmentFlags(qr, customerId);
        if (!(flags as any)[coupon.audience_segment]) return { valid: false, reason: 'This coupon is not available for you.', discount: 0 };
      }
      if (customerId && coupon.per_customer_limit != null) {
        const used = (await qr.query(`SELECT COUNT(*)::int n FROM coupon_redemptions WHERE coupon_id = $1 AND customer_id = $2`, [coupon.id, customerId]))[0].n;
        if (used >= coupon.per_customer_limit) return { valid: false, reason: 'You have already used this coupon.', discount: 0 };
      }
      if (Number(coupon.min_cart_value) > 0 && subtotal < Number(coupon.min_cart_value)) {
        return { valid: false, reason: `Add ₹${Number(coupon.min_cart_value) - subtotal} more to use this coupon.`, discount: 0 };
      }

      // Matching lines (scope).
      let matchedTotal = subtotal;
      if (coupon.scope !== 'all' && lines.length) {
        const ids = [...new Set(lines.map((l) => l.productId))];
        const prodRows = await qr.query(`SELECT id, category_id, brand_id FROM products WHERE id = ANY($1)`, [ids]);
        const meta = new Map<string, any>();
        prodRows.forEach((r: any) => meta.set(r.id, r));
        const scopeIds: string[] = coupon.scope_ids || [];
        matchedTotal = lines.filter((l) => {
          const m = meta.get(l.productId!) || {};
          if (coupon.scope === 'product') return scopeIds.includes(l.productId!);
          if (coupon.scope === 'category') return scopeIds.includes(m.category_id);
          if (coupon.scope === 'brand') return scopeIds.includes(m.brand_id);
          return false;
        }).reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice), 0);
      }
      if (matchedTotal <= 0) return { valid: false, reason: 'No eligible items for this coupon.', discount: 0 };

      let discount = coupon.discount_type === 'amount'
        ? Math.min(Number(coupon.discount_value), matchedTotal)
        : Math.round(matchedTotal * Number(coupon.discount_value)) / 100;
      if (coupon.max_discount != null) discount = Math.min(discount, Number(coupon.max_discount));
      discount = Math.round(discount * 100) / 100;
      if (discount <= 0) return { valid: false, reason: 'No discount applies.', discount: 0 };

      const label = coupon.discount_type === 'amount' ? `₹${coupon.discount_value} OFF` : `${coupon.discount_value}% OFF`;
      return { valid: true, discount, coupon: { id: coupon.id, code: coupon.code, description: coupon.description || '', label } };
    });
  }

  /** Record a redemption + bump usage (call after the order is created). */
  async redeem(schema: string, couponId: string, customerId: string | null, orderId: string | null, discount: number): Promise<void> {
    await this.conn.executeInTransaction(schema, async (qr) => {
      await qr.query(
        `INSERT INTO coupon_redemptions (coupon_id, customer_id, order_id, discount_applied) VALUES ($1,$2,$3,$4)`,
        [couponId, customerId, orderId, discount],
      );
      await qr.query(`UPDATE coupons SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1`, [couponId]);
    });
  }

  /** Active public coupons (for the customer Offers message). */
  async activePublic(schema: string): Promise<any[]> {
    return this.conn.executeInTenantContext(schema, async (qr) =>
      qr.query(
        `SELECT code, description, discount_type, discount_value, min_cart_value FROM coupons
          WHERE status = 'active' AND audience = 'all'
            AND (valid_from IS NULL OR valid_from <= NOW())
            AND (valid_until IS NULL OR valid_until >= NOW())
            AND (usage_limit IS NULL OR used_count < usage_limit)
          ORDER BY created_at DESC LIMIT 10`,
      ),
    );
  }
}
