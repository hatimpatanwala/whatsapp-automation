import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';

const r0 = (n: any) => Math.round(Number(n) || 0);
const r1 = (n: any) => Math.round((Number(n) || 0) * 10) / 10;
const r2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;

export interface ProductPerformance {
  productId: string;
  name: string;
  uom: string;
  revenue90: number;
  qty90: number;
  orders90: number;
  velocityPerWeek: number;
  momentumPct: number | null;
  marginPct: number | null;
  abcClass: 'A' | 'B' | 'C';
  stock: number;
  daysOfCover: number | null;
  score: number;
  flags: string[];
  /** Blueprint product-health class: fast-moving / slow-moving / dead-stock / inactive. */
  healthClass: 'fast-moving' | 'slow-moving' | 'dead-stock' | 'inactive';
  marginClass: 'high' | 'low' | null;
  /** What you actually billed per unit over 90d (invoice lines) — margin basis. */
  avgSellPrice90: number | null;
  /** Real cost basis (last actual purchase price, backfilled from purchase history). */
  purchaseCost: number | null;
}

/**
 * Product performance analytics (AI Insights Pro). Everything is computed
 * deterministically from the tenant's own history — invoice line items (credit
 * notes netted), product masters and live stock. Analysis anchors on the latest
 * data month so migrated/historical datasets stay meaningful.
 */
@Injectable()
export class ProductAnalyticsService {
  private readonly cache = new Map<string, { at: number; data: any }>();
  private readonly TTL = 15 * 60 * 1000;

  constructor(private readonly cm: TenantConnectionManager) {}

  async performance(schema: string, force = false): Promise<{ asOf: string; products: ProductPerformance[] }> {
    const hit = this.cache.get(schema);
    if (!force && hit && Date.now() - hit.at < this.TTL) return hit.data;

    const data = await this.cm.executeInTenantContext(schema, async (qr) => {
      const [anchor] = await qr.query(
        `SELECT COALESCE(MAX(issued_at), NOW())::date AS d FROM "${schema}".invoices WHERE issued_at IS NOT NULL`,
      );
      const asOf: string = anchor?.d ? new Date(anchor.d).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

      // One pass over the last 180 days of invoice lines (credit notes netted):
      // 90-day window for level metrics + the prior 90 days for momentum.
      const rows = await qr.query(
        `WITH lines AS (
           SELECT (it->>'productId')::uuid AS pid,
                  iv.id AS invoice_id,
                  iv.issued_at,
                  (CASE WHEN iv.doc_type = 'credit_note' THEN -1 ELSE 1 END) * COALESCE(NULLIF(it->>'lineTotal','')::numeric, 0) AS val,
                  (CASE WHEN iv.doc_type = 'credit_note' THEN -1 ELSE 1 END) * COALESCE(NULLIF(it->>'quantity','')::numeric, 0) AS qty
           FROM "${schema}".invoices iv
           CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(iv.items)='array' THEN iv.items ELSE '[]'::jsonb END) it
           WHERE iv.issued_at >= $1::date - interval '180 days'
             AND (it->>'productId') ~ '^[0-9a-fA-F-]{36}$'
         )
         SELECT p.id AS product_id, p.name, COALESCE(p.uom,'pcs') AS uom,
                COALESCE(p.sale_price, p.base_price, 0)::float AS sale_price,
                COALESCE(p.purchase_price, 0)::float AS purchase_price,
                COALESCE(inv.stock_quantity, 0)::float AS stock,
                COALESCE(SUM(l.val) FILTER (WHERE l.issued_at >= $1::date - interval '90 days'),0)::float AS revenue90,
                COALESCE(SUM(l.qty) FILTER (WHERE l.issued_at >= $1::date - interval '90 days'),0)::float AS qty90,
                COALESCE(COUNT(DISTINCT l.invoice_id) FILTER (WHERE l.issued_at >= $1::date - interval '90 days'),0)::int AS orders90,
                COALESCE(SUM(l.val) FILTER (WHERE l.issued_at < $1::date - interval '90 days'),0)::float AS revenue_prior90
         FROM "${schema}".products p
         LEFT JOIN "${schema}".inventory inv ON inv.product_id = p.id
         LEFT JOIN lines l ON l.pid = p.id
         WHERE p.is_active = true AND p.deleted_at IS NULL AND COALESCE(p.item_type,'product') <> 'service'
         GROUP BY p.id, p.name, p.uom, p.sale_price, p.base_price, p.purchase_price, inv.stock_quantity`,
        [asOf],
      );

      // ABC classification by cumulative 90-day revenue (A=80%, B=next 15%, C=rest).
      const sorted = [...rows].sort((a: any, b: any) => b.revenue90 - a.revenue90);
      const totalRev = sorted.reduce((s: number, r: any) => s + Math.max(0, r.revenue90), 0) || 1;
      let cum = 0;
      const abc = new Map<string, 'A' | 'B' | 'C'>();
      for (const r of sorted) {
        cum += Math.max(0, r.revenue90);
        abc.set(r.product_id, cum / totalRev <= 0.8 ? 'A' : cum / totalRev <= 0.95 ? 'B' : 'C');
      }
      const maxRev = Math.max(...sorted.map((r: any) => r.revenue90), 1);
      // Fast-mover threshold: median weekly velocity among products that actually sold.
      const velocities = rows.map((r: any) => r.qty90 / (90 / 7)).filter((v: number) => v > 0).sort((a: number, b: number) => a - b);
      const medianVelocity = velocities.length ? velocities[Math.floor(velocities.length / 2)] : 0;

      const products: ProductPerformance[] = rows.map((r: any) => {
        const velocity = r.qty90 / (90 / 7);
        const momentum = r.revenue_prior90 > 0
          ? r2(((r.revenue90 - r.revenue_prior90) / r.revenue_prior90) * 100)
          : (r.revenue90 > 0 ? null : null);
        // REALIZED margin: what you actually billed (invoice lines, 90d) vs the real
        // purchase cost — not the master's list price. Master prices only as fallback
        // for items with no recent sales.
        const realizedSell = r.qty90 > 0 ? r.revenue90 / r.qty90 : 0;
        const sellBasis = realizedSell > 0 ? realizedSell : r.sale_price;
        const margin = r.purchase_price > 0 && sellBasis > 0
          ? r2(((sellBasis - r.purchase_price) / sellBasis) * 100)
          : null;
        const daysOfCover = velocity > 0 ? r0(r.stock / (velocity / 7)) : null;

        const flags: string[] = [];
        if (r.stock > 0 && r.qty90 <= 0) flags.push('dead-stock');
        if (daysOfCover !== null && daysOfCover < 14 && r.qty90 > 0) flags.push('stockout-risk');
        if (daysOfCover !== null && daysOfCover > 180) flags.push('overstock');
        if (momentum !== null && momentum >= 50) flags.push('rising');
        if (momentum !== null && momentum <= -40 && r.revenue_prior90 >= 1000) flags.push('declining');

        // Composite score: revenue weight 45, momentum 25, margin 15, availability 15.
        const revScore = 45 * Math.max(0, r.revenue90) / maxRev;
        const momScore = momentum === null ? 12.5 : 12.5 + 12.5 * Math.max(-1, Math.min(1, momentum / 100));
        const marScore = margin === null ? 7.5 : 15 * Math.max(0, Math.min(1, margin / 40));
        const avlScore = daysOfCover === null ? (r.stock > 0 ? 7.5 : 0) : (daysOfCover >= 14 && daysOfCover <= 180 ? 15 : 7.5);

        const healthClass: ProductPerformance['healthClass'] =
          r.stock > 0 && r.qty90 <= 0 ? 'dead-stock'
          : r.qty90 <= 0 ? 'inactive'
          : velocity >= medianVelocity ? 'fast-moving' : 'slow-moving';

        return {
          productId: r.product_id,
          name: r.name,
          uom: r.uom,
          revenue90: r0(r.revenue90),
          qty90: r1(r.qty90),
          orders90: r.orders90,
          velocityPerWeek: r1(velocity),
          momentumPct: momentum,
          marginPct: margin,
          abcClass: abc.get(r.product_id) || 'C',
          stock: r0(r.stock),
          daysOfCover,
          score: r0(revScore + momScore + marScore + avlScore),
          flags,
          healthClass,
          marginClass: margin === null ? null : margin >= 25 ? 'high' : margin < 10 ? 'low' : null,
          avgSellPrice90: realizedSell > 0 ? r2(realizedSell) : null,
          purchaseCost: r.purchase_price > 0 ? r2(r.purchase_price) : null,
        };
      }).sort((a, b) => b.score - a.score);

      return { asOf, products };
    });

    this.cache.set(schema, { at: Date.now(), data });
    return data;
  }
}
