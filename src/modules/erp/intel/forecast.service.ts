import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';

const r0 = (n: number) => Math.round(n || 0);
const r1 = (n: number) => Math.round((n || 0) * 10) / 10;

export interface ProductForecast {
  productId: string;
  name: string;
  uom: string;
  months: Array<{ ym: string; qty: number }>;
  totalQty: number;
  totalRevenue: number;
  confidence: 'high' | 'medium' | 'low';
  mapePct: number | null;
  model: 'holt-winters' | 'holt' | 'moving-average';
  seasonalPeakMonth: string | null;
}

export interface StockPlanRow {
  productId: string;
  name: string;
  uom: string;
  stock: number;
  forecastQty: number;
  safetyStock: number;
  recommendedOrderQty: number;
  overstock: boolean;
  confidence: 'high' | 'medium' | 'low';
}

const HORIZON = 4; // months

/**
 * 4-month demand forecast + stock planner (AI Insights Pro). Deterministic classical
 * time-series over the tenant's own monthly sales history (credit notes netted):
 *   ≥24 months history → Holt-Winters (triple exponential smoothing, season = 12)
 *   ≥8 months          → Holt's linear (double exponential smoothing)
 *   else               → weighted moving average
 * Every product's forecast is BACKTESTED: the last 4 months are held out, the model
 * re-fit on the rest, and the MAPE grades confidence (high/medium/low) — so the UI
 * shows measured accuracy, not a claim. Series are outlier-damped (median-based) so
 * a single bulk order doesn't distort the trend. No external/paid dependencies.
 */
@Injectable()
export class ForecastService {
  private readonly cache = new Map<string, { at: number; data: any }>();
  private readonly TTL = 60 * 60 * 1000; // 1h — forecasts change slowly

  constructor(private readonly cm: TenantConnectionManager) {}

  async forecast(schema: string, force = false): Promise<{ generatedAt: string; asOf: string; horizonMonths: number; products: ProductForecast[] }> {
    const hit = this.cache.get(schema);
    if (!force && hit && Date.now() - hit.at < this.TTL) return hit.data;

    const { asOf, series, meta } = await this.loadSeries(schema);
    const products: ProductForecast[] = [];

    for (const [pid, points] of series) {
      const m = meta.get(pid)!;
      const values = this.dampOutliers(points.map((p) => p.qty));
      if (values.every((v) => v <= 0)) continue;

      const { forecast, model } = this.fit(values, HORIZON);
      const mape = this.backtest(values);
      const confidence: ProductForecast['confidence'] =
        mape === null ? 'low' : mape <= 35 ? 'high' : mape <= 70 ? 'medium' : 'low';

      // Future month labels from the month AFTER asOf's month.
      const start = new Date(`${asOf.slice(0, 7)}-01T00:00:00Z`);
      const months = forecast.map((qty, i) => {
        const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1 + i, 1));
        return { ym: d.toISOString().slice(0, 7), qty: r1(Math.max(0, qty)) };
      });
      const totalQty = r1(months.reduce((s, x) => s + x.qty, 0));
      if (totalQty <= 0) continue;

      products.push({
        productId: pid,
        name: m.name,
        uom: m.uom,
        months,
        totalQty,
        totalRevenue: r0(totalQty * m.price),
        confidence,
        mapePct: mape === null ? null : r0(mape),
        model,
        seasonalPeakMonth: this.seasonalPeak(points),
      });
    }

    products.sort((a, b) => b.totalRevenue - a.totalRevenue);
    const data = { generatedAt: new Date().toISOString(), asOf, horizonMonths: HORIZON, products };
    this.cache.set(schema, { at: Date.now(), data });
    return data;
  }

  /** Stock plan: forecast demand + lead time + safety stock − on hand. */
  async stockPlan(schema: string, leadTimeDays = 14): Promise<{ assumptions: any; products: StockPlanRow[] }> {
    const fc = await this.forecast(schema);
    const stocks = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT product_id, COALESCE(stock_quantity,0)::float AS stock FROM "${schema}".inventory`),
    );
    const stockBy = new Map<string, number>(stocks.map((s: any) => [s.product_id, Number(s.stock) || 0]));
    const { series } = await this.loadSeries(schema);

    const products: StockPlanRow[] = fc.products.map((p) => {
      const monthly = p.months.map((m) => m.qty);
      const avgMonthly = monthly.reduce((s, x) => s + x, 0) / (monthly.length || 1);
      const hist = (series.get(p.productId) || []).map((x) => x.qty);
      const sigma = this.stdDev(hist.slice(-12));
      // 95% service level (z≈1.65) over the lead-time window.
      const safety = 1.65 * sigma * Math.sqrt(Math.max(leadTimeDays, 1) / 30);
      const leadDemand = avgMonthly * (leadTimeDays / 30);
      const stock = stockBy.get(p.productId) || 0;
      const need = p.totalQty + leadDemand + safety - stock;
      const coverMonths = avgMonthly > 0 ? stock / avgMonthly : Infinity;
      return {
        productId: p.productId,
        name: p.name,
        uom: p.uom,
        stock: r0(stock),
        forecastQty: p.totalQty,
        safetyStock: r0(safety),
        recommendedOrderQty: r0(Math.max(0, need)),
        overstock: coverMonths > HORIZON * 1.5,
        confidence: p.confidence,
      };
    });

    return { assumptions: { leadTimeDays, serviceLevelPct: 95, horizonMonths: HORIZON }, products };
  }

  // ─── Series loading ──────────────────────────────────────────────────────────
  private async loadSeries(schema: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const [anchor] = await qr.query(
        `SELECT COALESCE(MAX(issued_at), NOW())::date AS d FROM "${schema}".invoices WHERE issued_at IS NOT NULL`,
      );
      const asOf: string = anchor?.d ? new Date(anchor.d).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

      const rows = await qr.query(
        `SELECT (it->>'productId')::uuid AS pid,
                to_char(date_trunc('month', iv.issued_at),'YYYY-MM') AS ym,
                SUM((CASE WHEN iv.doc_type='credit_note' THEN -1 ELSE 1 END) * COALESCE(NULLIF(it->>'quantity','')::numeric,0))::float AS qty
         FROM "${schema}".invoices iv
         CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(iv.items)='array' THEN iv.items ELSE '[]'::jsonb END) it
         WHERE (it->>'productId') ~ '^[0-9a-fA-F-]{36}$' AND iv.issued_at IS NOT NULL
         GROUP BY 1, 2 ORDER BY 1, 2`,
      );
      const metaRows = await qr.query(
        `SELECT id, name, COALESCE(uom,'pcs') AS uom, COALESCE(sale_price, base_price, 0)::float AS price
         FROM "${schema}".products WHERE is_active = true AND deleted_at IS NULL`,
      );
      const meta = new Map<string, { name: string; uom: string; price: number }>(
        metaRows.map((m: any) => [m.id, { name: m.name, uom: m.uom, price: Number(m.price) || 0 }]),
      );

      // Dense monthly series per product (gaps = 0), from first sale to asOf month.
      const byPid = new Map<string, Map<string, number>>();
      for (const r of rows) {
        if (!meta.has(r.pid)) continue;
        const m = byPid.get(r.pid) || new Map<string, number>();
        m.set(r.ym, Number(r.qty) || 0);
        byPid.set(r.pid, m);
      }
      const endYm = asOf.slice(0, 7);
      const series = new Map<string, Array<{ ym: string; qty: number }>>();
      for (const [pid, m] of byPid) {
        const yms = [...m.keys()].sort();
        if (!yms.length) continue;
        const out: Array<{ ym: string; qty: number }> = [];
        const cur = new Date(`${yms[0]}-01T00:00:00Z`);
        const end = new Date(`${endYm}-01T00:00:00Z`);
        while (cur <= end && out.length < 240) {
          const ym = cur.toISOString().slice(0, 7);
          out.push({ ym, qty: Math.max(0, m.get(ym) || 0) });
          cur.setUTCMonth(cur.getUTCMonth() + 1);
        }
        if (out.length >= 3) series.set(pid, out);
      }
      return { asOf, series, meta };
    });
  }

  // ─── Models ──────────────────────────────────────────────────────────────────
  private fit(values: number[], horizon: number): { forecast: number[]; model: ProductForecast['model'] } {
    if (values.length >= 24) return { forecast: this.holtWinters(values, 12, horizon), model: 'holt-winters' };
    if (values.length >= 8) return { forecast: this.holt(values, horizon), model: 'holt' };
    return { forecast: this.movingAverage(values, horizon), model: 'moving-average' };
  }

  /** Triple exponential smoothing (additive seasonality). */
  private holtWinters(y: number[], season: number, horizon: number): number[] {
    const alpha = 0.35, beta = 0.05, gamma = 0.25;
    const seasons = Math.floor(y.length / season);
    // Initial level/trend from the first season; seasonal indices averaged per position.
    let level = y.slice(0, season).reduce((s, v) => s + v, 0) / season;
    let trend = (y.slice(season, 2 * season).reduce((s, v) => s + v, 0) - y.slice(0, season).reduce((s, v) => s + v, 0)) / (season * season);
    const seasonal: number[] = new Array(season).fill(0);
    for (let i = 0; i < season; i++) {
      let sum = 0;
      for (let s = 0; s < seasons; s++) sum += y[s * season + i] - (y.slice(s * season, (s + 1) * season).reduce((a, v) => a + v, 0) / season);
      seasonal[i] = sum / seasons;
    }
    for (let t = 0; t < y.length; t++) {
      const si = t % season;
      const lastLevel = level;
      level = alpha * (y[t] - seasonal[si]) + (1 - alpha) * (level + trend);
      trend = beta * (level - lastLevel) + (1 - beta) * trend;
      seasonal[si] = gamma * (y[t] - level) + (1 - gamma) * seasonal[si];
    }
    const out: number[] = [];
    for (let h = 1; h <= horizon; h++) out.push(level + h * trend + seasonal[(y.length + h - 1) % season]);
    return out;
  }

  /** Double exponential smoothing (level + trend). */
  private holt(y: number[], horizon: number): number[] {
    const alpha = 0.4, beta = 0.1;
    let level = y[0];
    let trend = y[1] - y[0];
    for (let t = 1; t < y.length; t++) {
      const lastLevel = level;
      level = alpha * y[t] + (1 - alpha) * (level + trend);
      trend = beta * (level - lastLevel) + (1 - beta) * trend;
    }
    return Array.from({ length: horizon }, (_, h) => level + (h + 1) * trend);
  }

  /** Weighted 3-month moving average, flat-extended. */
  private movingAverage(y: number[], horizon: number): number[] {
    const last = y.slice(-3);
    const weights = [0.2, 0.3, 0.5].slice(-last.length);
    const wsum = weights.reduce((s, w) => s + w, 0);
    const avg = last.reduce((s, v, i) => s + v * weights[i], 0) / wsum;
    return new Array(horizon).fill(avg);
  }

  /** Hold out the last HORIZON months, refit, MAPE on the holdout (null if not enough data). */
  private backtest(values: number[]): number | null {
    if (values.length < HORIZON + 6) return null;
    const train = values.slice(0, -HORIZON);
    const actual = values.slice(-HORIZON);
    const { forecast } = this.fit(train, HORIZON);
    let err = 0, n = 0;
    for (let i = 0; i < HORIZON; i++) {
      if (actual[i] <= 0) continue;
      err += Math.abs((forecast[i] - actual[i]) / actual[i]);
      n++;
    }
    return n ? (err / n) * 100 : null;
  }

  /** Damp spikes beyond 3× the median so one bulk order doesn't skew the model. */
  private dampOutliers(values: number[]): number[] {
    const sorted = [...values].filter((v) => v > 0).sort((a, b) => a - b);
    if (sorted.length < 4) return values;
    const median = sorted[Math.floor(sorted.length / 2)];
    const cap = median * 3;
    return values.map((v) => (v > cap ? cap + (v - cap) * 0.25 : v));
  }

  /** Which calendar month historically sells the most (needs ≥18 months of data). */
  private seasonalPeak(points: Array<{ ym: string; qty: number }>): string | null {
    if (points.length < 18) return null;
    const byMonth = new Map<number, { sum: number; n: number }>();
    for (const p of points) {
      const m = parseInt(p.ym.slice(5, 7), 10);
      const cur = byMonth.get(m) || { sum: 0, n: 0 };
      cur.sum += p.qty; cur.n++;
      byMonth.set(m, cur);
    }
    let best = 0, bestAvg = -1;
    for (const [m, { sum, n }] of byMonth) {
      const avg = sum / n;
      if (avg > bestAvg) { bestAvg = avg; best = m; }
    }
    const names = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return bestAvg > 0 ? names[best] : null;
  }

  private stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1));
  }
}
