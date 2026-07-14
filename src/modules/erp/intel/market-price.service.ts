import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';

const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

export interface MarketPriceRow {
  productId: string;
  name: string;
  yourPrice: number;
  marketLow: number | null;
  marketMedian: number | null;
  marketHigh: number | null;
  source: string | null;
  confidence: number | null;
  fetchedAt: string | null;
  sourceNote: string | null;
  position: 'under' | 'competitive' | 'over' | null;
  monthlyVolumeValue: number;
}

/**
 * Market pricing intelligence (AI Insights Pro) — free/open-source only:
 *   'manual'  — user-entered competitor prices (always win over scraped figures)
 *   'search'  — self-hosted SearXNG metasearch (SEARX_URL env, e.g. http://searxng:8080):
 *               query "<product> price india", extract ₹/Rs price candidates from result
 *               titles+snippets with plain regex, IQR-filter outliers → low/median/high.
 * No paid APIs. Every figure carries its source + fetch date + confidence so users can
 * judge it; manual entries are treated as authoritative.
 */
@Injectable()
export class MarketPriceService {
  private readonly logger = new Logger(MarketPriceService.name);

  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly config: ConfigService,
  ) {}

  searchAvailable(): boolean {
    return !!this.config.get<string>('SEARX_URL');
  }

  /** Comparison table: your recent selling price vs the best market figure per product. */
  async list(schema: string): Promise<{ searchAvailable: boolean; products: MarketPriceRow[] }> {
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `WITH recent AS (
           SELECT (it->>'productId')::uuid AS pid,
                  SUM(COALESCE(NULLIF(it->>'lineTotal','')::numeric,0))::float AS val,
                  SUM(COALESCE(NULLIF(it->>'quantity','')::numeric,0))::float AS qty
           FROM "${schema}".invoices iv
           CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(iv.items)='array' THEN iv.items ELSE '[]'::jsonb END) it
           WHERE iv.doc_type <> 'credit_note' AND (it->>'productId') ~ '^[0-9a-fA-F-]{36}$'
             AND iv.issued_at >= (SELECT COALESCE(MAX(issued_at), NOW()) FROM "${schema}".invoices) - interval '90 days'
           GROUP BY 1
         )
         SELECT p.id, p.name,
                CASE WHEN COALESCE(rec.qty,0) > 0 THEN rec.val / rec.qty ELSE COALESCE(p.sale_price, p.base_price, 0) END::float AS your_price,
                COALESCE(rec.val, 0)::float / 3 AS monthly_volume_value,
                mp.source, mp.price_low, mp.price_median, mp.price_high, mp.confidence, mp.source_note, mp.fetched_at
         FROM "${schema}".products p
         LEFT JOIN recent rec ON rec.pid = p.id
         LEFT JOIN LATERAL (
           SELECT * FROM "${schema}".market_prices m WHERE m.product_id = p.id
           ORDER BY CASE m.source WHEN 'manual' THEN 0 ELSE 1 END, m.fetched_at DESC LIMIT 1
         ) mp ON true
         WHERE p.is_active = true AND p.deleted_at IS NULL AND COALESCE(p.item_type,'product') <> 'service'
         ORDER BY monthly_volume_value DESC NULLS LAST
         LIMIT 300`,
      ),
    );

    const products: MarketPriceRow[] = rows.map((r: any) => {
      const yourPrice = r2(Number(r.your_price) || 0);
      const median = r.price_median != null ? r2(Number(r.price_median)) : null;
      let position: MarketPriceRow['position'] = null;
      if (median && yourPrice > 0) {
        position = yourPrice < median * 0.93 ? 'under' : yourPrice > median * 1.07 ? 'over' : 'competitive';
      }
      return {
        productId: r.id,
        name: r.name,
        yourPrice,
        marketLow: r.price_low != null ? r2(Number(r.price_low)) : null,
        marketMedian: median,
        marketHigh: r.price_high != null ? r2(Number(r.price_high)) : null,
        source: r.source || null,
        confidence: r.confidence != null ? Number(r.confidence) : null,
        fetchedAt: r.fetched_at || null,
        sourceNote: r.source_note || null,
        position,
        monthlyVolumeValue: r2(Number(r.monthly_volume_value) || 0),
      };
    });

    return { searchAvailable: this.searchAvailable(), products };
  }

  /** Manual competitor price — authoritative; overwrites the previous manual row. */
  async saveManual(schema: string, body: { productId: string; priceLow?: number; priceMedian: number; priceHigh?: number; note?: string }) {
    const median = Number(body.priceMedian);
    if (!body.productId || !(median > 0)) throw new BadRequestException('Product and a market price are required');
    const low = Number(body.priceLow) > 0 ? Number(body.priceLow) : median;
    const high = Number(body.priceHigh) > 0 ? Number(body.priceHigh) : median;
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `INSERT INTO "${schema}".market_prices (product_id, source, price_low, price_median, price_high, confidence, source_note, fetched_at)
         VALUES ($1,'manual',$2,$3,$4,1.0,$5,NOW())
         ON CONFLICT (product_id, source) DO UPDATE SET
           price_low = EXCLUDED.price_low, price_median = EXCLUDED.price_median, price_high = EXCLUDED.price_high,
           source_note = EXCLUDED.source_note, fetched_at = NOW()`,
        [body.productId, r2(Math.min(low, median)), r2(median), r2(Math.max(high, median)), body.note?.trim() || 'Entered manually'],
      ),
    );
    return { saved: true };
  }

  /** Refresh one product from the self-hosted search engine. */
  async refresh(schema: string, productId: string) {
    const searx = this.config.get<string>('SEARX_URL');
    if (!searx) return { status: 'unavailable', message: 'Search engine not configured (set SEARX_URL).' };

    const [product] = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT id, name FROM "${schema}".products WHERE id = $1`, [productId]),
    );
    if (!product) throw new BadRequestException('Product not found');

    const points = await this.searchPrices(searx.replace(/\/$/, ''), String(product.name));
    if (points.length < 2) {
      return { status: 'no-data', message: `Found only ${points.length} price point(s) on the web for this item — add a manual price instead.` };
    }

    // IQR-filter outliers, then low/median/high.
    const sorted = [...points].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const kept = sorted.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
    const low = kept[0];
    const high = kept[kept.length - 1];
    const median = kept[Math.floor(kept.length / 2)];
    const confidence = Math.min(1, kept.length / 8);

    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `INSERT INTO "${schema}".market_prices (product_id, source, price_low, price_median, price_high, confidence, source_note, fetched_at)
         VALUES ($1,'search',$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (product_id, source) DO UPDATE SET
           price_low = EXCLUDED.price_low, price_median = EXCLUDED.price_median, price_high = EXCLUDED.price_high,
           confidence = EXCLUDED.confidence, source_note = EXCLUDED.source_note, fetched_at = NOW()`,
        [productId, r2(low), r2(median), r2(high), confidence, `Web search · ${kept.length} price points`],
      ),
    );
    return { status: 'ok', low: r2(low), median: r2(median), high: r2(high), points: kept.length };
  }

  /** Query SearXNG and pull ₹/Rs price candidates out of result titles + snippets. */
  private async searchPrices(searxBase: string, productName: string): Promise<number[]> {
    const q = encodeURIComponent(`${productName} price india`);
    const url = `${searxBase}/search?q=${q}&format=json&language=en-IN&safesearch=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
      if (!res.ok) {
        this.logger.warn(`searx ${res.status} for "${productName}"`);
        return [];
      }
      const json: any = await res.json();
      const texts: string[] = [];
      for (const r of json?.results || []) {
        if (r?.title) texts.push(String(r.title));
        if (r?.content) texts.push(String(r.content));
      }
      const points: number[] = [];
      const re = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi;
      for (const t of texts.slice(0, 60)) {
        for (const m of t.matchAll(re)) {
          const v = parseFloat(m[1].replace(/,/g, ''));
          if (v >= 10 && v <= 10_000_000) points.push(v);
        }
      }
      return points;
    } catch (e: any) {
      this.logger.warn(`searx fetch failed for "${productName}": ${e?.message}`);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}
