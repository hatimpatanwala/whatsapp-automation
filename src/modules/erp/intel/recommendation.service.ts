import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { ProductAnalyticsService } from './product-analytics.service';
import { ForecastService } from './forecast.service';
import { MarketPriceService } from './market-price.service';

const r0 = (n: number) => Math.round(n || 0);

export type RecommendationType = 'buy' | 'reorder-soon' | 'price-up' | 'price-down' | 'promote-dead' | 'switch-supplier';

export interface Recommendation {
  type: RecommendationType;
  productId: string;
  productName: string;
  title: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  /** Estimated financial impact in ₹ (positive = gain/unblocked capital). Null when honest estimation isn't possible. */
  impact: number | null;
  impactLabel: string;
  action: Record<string, any>;
}

export interface SupplierOption {
  supplierId: string;
  supplierName: string;
  orders: number;
  avgUnitPrice: number;
  lastUnitPrice: number;
  lastPurchasedAt: string;
}

/**
 * Recommendation Engine (blueprint core): turns the other engines' outputs into a
 * single ranked, ACTIONABLE feed — every item carries a reason, a confidence and an
 * estimated ₹ impact. Deterministic and explainable; the ERP stops being a mirror
 * of the past and starts telling the user what to do next.
 */
@Injectable()
export class RecommendationService {
  private readonly cache = new Map<string, { at: number; data: any }>();
  private readonly TTL = 15 * 60 * 1000;

  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly analytics: ProductAnalyticsService,
    private readonly forecasts: ForecastService,
    private readonly market: MarketPriceService,
  ) {}

  /** Suppliers who sold us a product, ranked by average unit price (last 2 years). */
  async supplierOptions(schema: string, productId: string): Promise<SupplierOption[]> {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT s.id AS supplier_id, COALESCE(s.company, 'Supplier') AS supplier_name,
                COUNT(*)::int AS orders,
                (SUM(soi.line_total) / NULLIF(SUM(soi.quantity),0))::float AS avg_unit_price,
                (ARRAY_AGG(soi.unit_price ORDER BY so.created_at DESC))[1]::float AS last_unit_price,
                MAX(so.created_at) AS last_purchased_at
         FROM "${schema}".supplier_order_items soi
         JOIN "${schema}".supplier_orders so ON so.id = soi.supplier_order_id AND so.removed = false
         JOIN "${schema}".suppliers s ON s.id = so.supplier_id
         WHERE soi.product_id = $1 AND so.created_at >= NOW() - interval '2 years' AND soi.quantity > 0
         GROUP BY s.id, s.company
         ORDER BY avg_unit_price ASC`,
        [productId],
      ).then((rows: any[]) => rows.map((r) => ({
        supplierId: r.supplier_id,
        supplierName: r.supplier_name,
        orders: r.orders,
        avgUnitPrice: Math.round((Number(r.avg_unit_price) || 0) * 100) / 100,
        lastUnitPrice: Math.round((Number(r.last_unit_price) || 0) * 100) / 100,
        lastPurchasedAt: r.last_purchased_at,
      }))),
    );
  }

  /** Cheapest-vs-latest supplier comparison for a set of products, in one query. */
  private async supplierEdges(schema: string, productIds: string[]): Promise<Map<string, { bestName: string; bestPrice: number; lastName: string; lastPrice: number }>> {
    if (!productIds.length) return new Map();
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `WITH per AS (
           SELECT soi.product_id, s.id AS sid, COALESCE(s.company,'Supplier') AS sname,
                  (SUM(soi.line_total) / NULLIF(SUM(soi.quantity),0))::float AS avg_price,
                  MAX(so.created_at) AS last_at
           FROM "${schema}".supplier_order_items soi
           JOIN "${schema}".supplier_orders so ON so.id = soi.supplier_order_id AND so.removed = false
           JOIN "${schema}".suppliers s ON s.id = so.supplier_id
           WHERE soi.product_id = ANY($1::uuid[]) AND so.created_at >= NOW() - interval '2 years' AND soi.quantity > 0
           GROUP BY soi.product_id, s.id, s.company
         )
         SELECT DISTINCT ON (product_id) product_id,
           (SELECT sname FROM per p2 WHERE p2.product_id = per.product_id ORDER BY avg_price ASC LIMIT 1) AS best_name,
           (SELECT avg_price FROM per p2 WHERE p2.product_id = per.product_id ORDER BY avg_price ASC LIMIT 1) AS best_price,
           (SELECT sname FROM per p2 WHERE p2.product_id = per.product_id ORDER BY last_at DESC LIMIT 1) AS last_name,
           (SELECT avg_price FROM per p2 WHERE p2.product_id = per.product_id ORDER BY last_at DESC LIMIT 1) AS last_price
         FROM per`,
        [productIds],
      ),
    );
    const map = new Map<string, { bestName: string; bestPrice: number; lastName: string; lastPrice: number }>();
    for (const r of rows) {
      map.set(r.product_id, {
        bestName: r.best_name, bestPrice: Number(r.best_price) || 0,
        lastName: r.last_name, lastPrice: Number(r.last_price) || 0,
      });
    }
    return map;
  }

  async recommendations(schema: string, force = false): Promise<{ generatedAt: string; recommendations: Recommendation[] }> {
    const hit = this.cache.get(schema);
    if (!force && hit && Date.now() - hit.at < this.TTL) return hit.data;

    const [perf, plan, mkt] = await Promise.all([
      this.analytics.performance(schema),
      this.forecasts.stockPlan(schema),
      this.market.list(schema),
    ]);
    const perfBy = new Map(perf.products.map((p) => [p.productId, p]));
    const mktBy = new Map(mkt.products.map((p) => [p.productId, p]));
    const out: Recommendation[] = [];

    // 1) BUY / REORDER-SOON — stock won't cover forecast demand.
    for (const p of plan.products) {
      if (p.recommendedOrderQty <= 0) continue;
      const pp = perfBy.get(p.productId);
      const marginPerUnit = pp?.marginPct != null && pp.revenue90 > 0 && p.forecastQty > 0
        ? (pp.revenue90 / Math.max(pp.qty90, 1)) * (pp.marginPct / 100)
        : null;
      const urgent = p.runsOutInDays !== null && p.runsOutInDays <= plan.assumptions.leadTimeDays;
      out.push({
        type: urgent ? 'buy' : 'reorder-soon',
        productId: p.productId,
        productName: p.name,
        title: `${urgent ? 'Buy' : 'Plan to buy'} ${p.recommendedOrderQty} ${p.uom} of ${p.name}`,
        reason: `${p.runsOutInDays !== null ? `Stock runs out in ~${p.runsOutInDays} day(s)` : 'No cover for forecast demand'}; next-4-month demand ≈ ${p.forecastQty} ${p.uom} vs ${p.stock} in stock (reorder point ${p.reorderPoint}).`,
        confidence: p.confidence,
        impact: marginPerUnit ? r0(marginPerUnit * Math.min(p.recommendedOrderQty, p.forecastQty)) : null,
        impactLabel: marginPerUnit ? 'est. margin protected' : 'demand coverage',
        action: { orderQty: p.recommendedOrderQty, eoq: p.eoq, reorderPoint: p.reorderPoint },
      });
    }

    // 2) PRICE-UP — selling clearly under the market with real volume.
    for (const m of mkt.products) {
      if (m.position !== 'under' || !m.marketMedian || m.yourPrice <= 0 || m.monthlyVolumeValue < 1000) continue;
      const newPrice = Math.min(m.marketMedian, m.yourPrice * 1.1);
      const upliftPct = (newPrice - m.yourPrice) / m.yourPrice;
      if (upliftPct < 0.02) continue;
      out.push({
        type: 'price-up',
        productId: m.productId,
        productName: m.name,
        title: `Raise ${m.name} to ₹${r0(newPrice)} (${r0(upliftPct * 100)}% up)`,
        reason: `You sell at ₹${r0(m.yourPrice)}; the market median is ₹${r0(m.marketMedian)} (${m.source === 'manual' ? 'your own market entry' : 'web-sourced'}).`,
        confidence: (m.confidence || 0) >= 0.6 || m.source === 'manual' ? 'high' : 'medium',
        impact: r0(m.monthlyVolumeValue * upliftPct),
        impactLabel: 'extra ₹/month at current volume',
        action: { newPrice: r0(newPrice), currentPrice: r0(m.yourPrice), marketMedian: r0(m.marketMedian) },
      });
    }

    // 3) PRICE-DOWN — priced well above market; volume is at risk.
    for (const m of mkt.products) {
      if (m.position !== 'over' || !m.marketMedian || m.monthlyVolumeValue < 1000) continue;
      out.push({
        type: 'price-down',
        productId: m.productId,
        productName: m.name,
        title: `Review ${m.name} — ₹${r0(m.yourPrice)} vs market ₹${r0(m.marketMedian)}`,
        reason: `You're ${r0(((m.yourPrice - m.marketMedian) / m.marketMedian) * 100)}% above the market median — competitors can undercut you on a ₹${r0(m.monthlyVolumeValue)}/month line.`,
        confidence: (m.confidence || 0) >= 0.6 || m.source === 'manual' ? 'medium' : 'low',
        impact: r0(m.monthlyVolumeValue),
        impactLabel: '₹/month revenue exposed',
        action: { marketMedian: r0(m.marketMedian), currentPrice: r0(m.yourPrice) },
      });
    }

    // 4) PROMOTE-DEAD — stock sitting with zero sales blocks capital.
    const deadCostRows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT p.id, COALESCE(p.purchase_price, p.base_price, 0)::float AS cost, COALESCE(i.stock_quantity,0)::float AS stock
         FROM "${schema}".products p JOIN "${schema}".inventory i ON i.product_id = p.id
         WHERE i.stock_quantity > 0`,
      ),
    );
    const costBy = new Map<string, { cost: number; stock: number }>(deadCostRows.map((r: any) => [r.id, { cost: Number(r.cost) || 0, stock: Number(r.stock) || 0 }]));
    for (const p of perf.products.filter((x) => x.healthClass === 'dead-stock').slice(0, 15)) {
      const c = costBy.get(p.productId);
      const blocked = c ? r0(c.cost * c.stock) : null;
      if (!blocked || blocked < 500) continue;
      out.push({
        type: 'promote-dead',
        productId: p.productId,
        productName: p.name,
        title: `Clear ${p.stock} ${p.uom} of ${p.name} (dead stock)`,
        reason: 'No sales in the last 90 days while stock sits on the shelf — discount, bundle or return it to the supplier.',
        confidence: 'high',
        impact: blocked,
        impactLabel: '₹ capital unblocked',
        action: { stock: p.stock },
      });
    }

    // 5) SWITCH-SUPPLIER — a cheaper supplier exists for items we need to buy.
    const buyIds = plan.products.filter((p) => p.recommendedOrderQty > 0).slice(0, 60).map((p) => p.productId);
    const edges = await this.supplierEdges(schema, buyIds);
    for (const p of plan.products) {
      const e = edges.get(p.productId);
      if (!e || !e.bestPrice || !e.lastPrice || e.bestName === e.lastName) continue;
      const savingPct = (e.lastPrice - e.bestPrice) / e.lastPrice;
      if (savingPct < 0.05) continue;
      out.push({
        type: 'switch-supplier',
        productId: p.productId,
        productName: p.name,
        title: `Buy ${p.name} from ${e.bestName}`,
        reason: `${e.bestName} averaged ₹${r0(e.bestPrice)}/${p.uom} vs ₹${r0(e.lastPrice)} from ${e.lastName} (your latest source) — ${r0(savingPct * 100)}% cheaper.`,
        confidence: 'medium',
        impact: r0((e.lastPrice - e.bestPrice) * p.recommendedOrderQty),
        impactLabel: 'saving on this purchase',
        action: { bestSupplier: e.bestName, bestPrice: e.bestPrice, lastSupplier: e.lastName, lastPrice: e.lastPrice, orderQty: p.recommendedOrderQty },
      });
    }

    // Rank: urgency first (buy), then by impact.
    const typeRank: Record<RecommendationType, number> = { buy: 0, 'switch-supplier': 1, 'price-up': 1, 'promote-dead': 2, 'reorder-soon': 3, 'price-down': 3 };
    out.sort((a, b) => (typeRank[a.type] - typeRank[b.type]) || ((b.impact || 0) - (a.impact || 0)));

    const data = { generatedAt: new Date().toISOString(), recommendations: out.slice(0, 40) };
    this.cache.set(schema, { at: Date.now(), data });
    return data;
  }
}
