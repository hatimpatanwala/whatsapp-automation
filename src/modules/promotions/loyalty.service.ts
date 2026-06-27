import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { CouponService } from './coupon.service';

export interface GrantedAward {
  schemeId: string;
  schemeName: string;
  couponCode: string;
  label: string;        // e.g. "20% OFF (max ₹500)"
  rewardType: string;
}

/**
 * Loyalty / cumulative schemes. As customers place (confirmed) orders, their
 * progress toward each cumulative scheme accrues; when a target is reached the
 * customer earns a reward — currently a personal, single-use coupon that the
 * caller then announces over WhatsApp.
 *
 * Pure data layer (no WhatsApp dependency) so it can live in PromotionsModule
 * without a circular import; the whatsapp-side listener handles notification.
 */
@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);
  private static readonly MAX_AWARDS_PER_ORDER = 5; // safety bound for repeatable rewards

  constructor(
    private readonly conn: TenantConnectionManager,
    private readonly coupons: CouponService,
  ) {}

  /**
   * Accrue a (confirmed) order against every active cumulative scheme the
   * customer qualifies for, granting rewards as targets are crossed. Idempotent
   * per (scheme, order). Returns the rewards granted by THIS call (for notify).
   */
  async accrueOrder(schema: string, orderId: string, customerId: string): Promise<GrantedAward[]> {
    if (!orderId || !customerId) return [];
    const granted: GrantedAward[] = [];

    const order = await this.conn.executeInTenantContext(schema, async (qr) => {
      const r = await qr.query(`SELECT id, total, created_at FROM orders WHERE id = $1`, [orderId]);
      return r[0] || null;
    });
    if (!order) return [];
    const orderTotal = Number(order.total) || 0;
    const monthKey = this.monthKey(order.created_at);

    const schemes = await this.conn.executeInTenantContext(schema, async (qr) =>
      qr.query(
        `SELECT s.* FROM schemes s
          WHERE s.status = 'active' AND s.type = 'cumulative'
            AND (s.valid_from IS NULL OR s.valid_from <= NOW())
            AND (s.valid_until IS NULL OR s.valid_until >= NOW())
            AND (s.audience = 'all' OR EXISTS (
                  SELECT 1 FROM scheme_customers sc WHERE sc.scheme_id = s.id AND sc.customer_id = $1))`,
        [customerId],
      ),
    );

    for (const s of schemes) {
      try {
        const cfg = this.json(s.conditions);
        const reward = this.json(s.reward);
        const metric = cfg.metric === 'orders' ? 'orders' : 'spend';
        const target = Number(cfg.target) || 0;
        if (target <= 0) continue;
        if (cfg.minOrderValue && orderTotal < Number(cfg.minOrderValue)) continue;

        const amount = metric === 'orders' ? 1 : orderTotal;
        if (amount <= 0) continue;
        const periodKey = cfg.period === 'monthly' ? monthKey : 'lifetime';

        // Idempotent accrual: one row per (scheme, order). If it already exists,
        // this order was already counted → skip entirely.
        const accrued = await this.conn.executeInTransaction(schema, async (qr) => {
          const ins = await qr.query(
            `INSERT INTO loyalty_accruals (scheme_id, order_id, customer_id, amount)
             VALUES ($1,$2,$3,$4) ON CONFLICT (scheme_id, order_id) DO NOTHING RETURNING scheme_id`,
            [s.id, orderId, customerId, amount],
          );
          if (!ins.length) return null; // already counted

          const up = await qr.query(
            `INSERT INTO loyalty_progress (scheme_id, customer_id, period_key, progress, awards, updated_at)
             VALUES ($1,$2,$3,$4,0,NOW())
             ON CONFLICT (scheme_id, customer_id, period_key)
             DO UPDATE SET progress = loyalty_progress.progress + EXCLUDED.progress, updated_at = NOW()
             RETURNING progress, awards`,
            [s.id, customerId, periodKey, amount],
          );
          return up[0]; // { progress, awards }
        });
        if (!accrued) continue;

        const progress = Number(accrued.progress) || 0;
        let awardsSoFar = Number(accrued.awards) || 0;
        const earned = Math.floor(progress / target); // total rewards the progress justifies
        let toGrant = Math.max(0, earned - awardsSoFar);
        if (toGrant <= 0) continue;
        toGrant = Math.min(toGrant, LoyaltyService.MAX_AWARDS_PER_ORDER);

        for (let i = 0; i < toGrant; i++) {
          const award = await this.grantReward(schema, s, reward, customerId, orderId, periodKey);
          if (award) granted.push(award);
          awardsSoFar++;
        }
        await this.conn.executeInTenantContext(schema, async (qr) => {
          await qr.query(
            `UPDATE loyalty_progress SET awards = $1, updated_at = NOW()
              WHERE scheme_id = $2 AND customer_id = $3 AND period_key = $4`,
            [awardsSoFar, s.id, customerId, periodKey],
          );
        });
      } catch (err: any) {
        this.logger.warn(`Loyalty accrual failed for scheme ${s.id}: ${err.message}`);
      }
    }

    return granted;
  }

  /** Create the personal reward coupon + record the award. */
  private async grantReward(
    schema: string,
    scheme: any,
    reward: any,
    customerId: string,
    orderId: string,
    periodKey: string,
  ): Promise<GrantedAward | null> {
    const discountType = reward.discountType === 'amount' ? 'amount' : 'percent';
    const discountValue = Number(reward.discountValue) || 0;
    if (discountValue <= 0) return null;
    const maxDiscount = reward.maxDiscount != null ? Number(reward.maxDiscount) : null;
    const validDays = Number(reward.validDays) || 30;

    const code = this.makeCode();
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString();

    const coupon = await this.coupons.create(schema, {
      code,
      description: `Loyalty reward — ${scheme.name}`,
      discountType,
      discountValue,
      minCartValue: 0,
      maxDiscount,
      scope: 'all',
      usageLimit: 1,
      perCustomerLimit: 1,
      audience: 'specific',
      customerIds: [customerId],
      validUntil,
      status: 'active',
    });

    const label = discountType === 'amount'
      ? `₹${discountValue} OFF`
      : `${discountValue}% OFF${maxDiscount ? ` (max ₹${maxDiscount})` : ''}`;

    await this.conn.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `INSERT INTO scheme_awards (scheme_id, customer_id, order_id, period_key, reward, coupon_id, coupon_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [scheme.id, customerId, orderId, periodKey, JSON.stringify(reward), coupon.id, code],
      );
    });

    return { schemeId: scheme.id, schemeName: scheme.name, couponCode: code, label, rewardType: 'coupon' };
  }

  /** A customer's progress across active cumulative schemes (for display / show_offers). */
  async progressForCustomer(schema: string, customerId: string): Promise<any[]> {
    return this.conn.executeInTenantContext(schema, async (qr) =>
      qr.query(
        `SELECT s.id AS scheme_id, s.name, s.conditions, s.reward,
                COALESCE(lp.progress, 0) AS progress, COALESCE(lp.awards, 0) AS awards
           FROM schemes s
           LEFT JOIN loyalty_progress lp
                  ON lp.scheme_id = s.id AND lp.customer_id = $1
           WHERE s.status = 'active' AND s.type = 'cumulative'
             AND (s.valid_until IS NULL OR s.valid_until >= NOW())
             AND (s.audience = 'all' OR EXISTS (
                   SELECT 1 FROM scheme_customers sc WHERE sc.scheme_id = s.id AND sc.customer_id = $1))
           ORDER BY s.weight DESC, s.created_at DESC`,
        [customerId],
      ),
    );
  }

  private static codeSeq = 0;
  private makeCode(): string {
    const a = Date.now().toString(36).toUpperCase().slice(-5);
    const b = (LoyaltyService.codeSeq++ % 1296).toString(36).toUpperCase().padStart(2, '0');
    return `LOYAL${a}${b}`;
  }
  private monthKey(d: any): string {
    const dt = d ? new Date(d) : new Date();
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  private json(v: any): any {
    return typeof v === 'string' ? (v ? JSON.parse(v) : {}) : (v || {});
  }
}
