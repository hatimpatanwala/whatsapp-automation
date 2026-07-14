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

export interface BulkState {
  running: boolean;
  total: number;
  done: number;
  ok: number;
  noData: number;
  startedAt: string;
  finishedAt?: string;
  statuses: Record<string, 'pending' | 'running' | 'ok' | 'no-data' | 'error'>;
}

/** Words that carry no product identity — ignored when matching search results. */
const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'ltr', 'litre', 'liter', 'mm', 'mtr', 'inch', 'pcs', 'nos', 'type', 'set', 'pack', 'of', 'a']);

/**
 * Market pricing intelligence (AI Insights Pro) — free/open-source only.
 *
 * Accuracy model (v2 — the v1 regex grabbed ANY ₹ figure from snippets and could
 * return junk like ₹45 for a water tank):
 *   1. RELEVANCE: a search result contributes prices only if its title/snippet
 *      actually matches the product (≥55% of the name's significant tokens, and
 *      every NUMBER in the name — sizes like "1000", "3/4" — must appear).
 *   2. SANITY BAND: candidates outside 0.3×–3× of YOUR OWN recent selling price
 *      are discarded (your realized price is the best free prior there is).
 *   3. TARGETED QUERIES: a plain web query plus an India B2B marketplace query
 *      (indiamart/moglix/industrybuying) merged together.
 *   4. DISPERSION-AWARE CONFIDENCE: many tight points → high; few/scattered → low.
 *   5. OPTIONAL FREE LLM: when LLM_API_URL is set (OpenAI-compatible — self-hosted
 *      Ollama, or free tiers like Groq/OpenRouter), the matching snippets are given
 *      to the model to extract the exact product's unit price range; deterministic
 *      extraction remains the fallback. No paid dependency is ever required.
 * 'manual' entries always outrank scraped figures.
 */
@Injectable()
export class MarketPriceService {
  private readonly logger = new Logger(MarketPriceService.name);
  /** One bulk refresh queue per tenant schema. */
  private readonly bulk = new Map<string, BulkState>();

  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly config: ConfigService,
  ) {}

  searchAvailable(): boolean {
    return !!this.config.get<string>('SEARX_URL');
  }

  // ─── Listing ─────────────────────────────────────────────────────────────────
  async list(schema: string): Promise<{ searchAvailable: boolean; llmEnabled: boolean; products: MarketPriceRow[] }> {
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

    return { searchAvailable: this.searchAvailable(), llmEnabled: !!this.config.get<string>('LLM_API_URL'), products };
  }

  // ─── Manual entry (authoritative) ────────────────────────────────────────────
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

  // ─── Single refresh ──────────────────────────────────────────────────────────
  async refresh(schema: string, productId: string) {
    const searx = this.config.get<string>('SEARX_URL');
    if (!searx) return { status: 'unavailable', message: 'Search engine not configured (set SEARX_URL).' };

    const [product] = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT p.id, p.name,
                COALESCE((
                  SELECT SUM(COALESCE(NULLIF(it->>'lineTotal','')::numeric,0)) / NULLIF(SUM(COALESCE(NULLIF(it->>'quantity','')::numeric,0)),0)
                  FROM "${schema}".invoices iv
                  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(iv.items)='array' THEN iv.items ELSE '[]'::jsonb END) it
                  WHERE (it->>'productId') = p.id::text AND iv.doc_type <> 'credit_note'
                    AND iv.issued_at >= NOW() - interval '2 years'
                ), COALESCE(p.sale_price, p.base_price, 0))::float AS ref_price
         FROM "${schema}".products p WHERE p.id = $1`,
        [productId],
      ),
    );
    if (!product) throw new BadRequestException('Product not found');
    const name = String(product.name);
    const refPrice = Number(product.ref_price) || 0;

    const snippets = await this.searchSnippets(searx.replace(/\/$/, ''), name);
    const relevant = this.relevantSnippets(name, snippets);

    // Snippets alone rarely carry SKU prices (search returns corporate/genric pages),
    // so ALSO fetch the top listing pages (IndiaMART/Moglix/Amazon…) and extract
    // prices from text windows that actually mention this product's brand + size.
    const pageContexts = await this.fetchListingContexts(name, snippets);
    const snippetPoints = this.pricePoints(refPrice, relevant.map((s) => `${s.title} ${s.content}`));
    const pagePoints = this.pricePoints(refPrice, pageContexts);
    const allPoints = [...snippetPoints, ...pagePoints];

    // LLM extraction first (when a free endpoint is configured), else deterministic.
    let result = await this.llmExtract(name, refPrice, [
      ...relevant.map((s) => ({ title: s.title, content: s.content, url: s.url })),
      ...pageContexts.slice(0, 8).map((c, i) => ({ title: `listing context ${i + 1}`, content: c, url: '' })),
    ]);
    let via = 'llm';
    if (!result) {
      result = this.statsFromPoints(allPoints);
      via = 'web';
    }
    if (!result) {
      return { status: 'no-data', message: `No trustworthy web price found for this item (checked ${snippets.length} results, ${relevant.length + pageContexts.length} matched contexts) — add a manual price.` };
    }

    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `INSERT INTO "${schema}".market_prices (product_id, source, price_low, price_median, price_high, confidence, source_note, fetched_at)
         VALUES ($1,'search',$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (product_id, source) DO UPDATE SET
           price_low = EXCLUDED.price_low, price_median = EXCLUDED.price_median, price_high = EXCLUDED.price_high,
           confidence = EXCLUDED.confidence, source_note = EXCLUDED.source_note, fetched_at = NOW()`,
        [productId, r2(result.low), r2(result.median), r2(result.high), result.confidence, `${via === 'llm' ? 'LLM' : 'Web'} · ${result.points} matched price point(s)`],
      ),
    );
    return { status: 'ok', low: r2(result.low), median: r2(result.median), high: r2(result.high), points: result.points, via };
  }

  // ─── Bulk refresh queue ──────────────────────────────────────────────────────
  async refreshAll(schema: string): Promise<BulkState> {
    const existing = this.bulk.get(schema);
    if (existing?.running) return existing;
    if (!this.searchAvailable()) throw new BadRequestException('Search engine not configured (set SEARX_URL).');

    const { products } = await this.list(schema);
    // Skip products already priced manually (manual is authoritative).
    const targets = products.filter((p) => p.source !== 'manual');
    const state: BulkState = {
      running: true,
      total: targets.length,
      done: 0, ok: 0, noData: 0,
      startedAt: new Date().toISOString(),
      statuses: Object.fromEntries(targets.map((p) => [p.productId, 'pending' as const])),
    };
    this.bulk.set(schema, state);

    // Fire-and-forget worker: 2 at a time (kind to the search engine), sequential batches.
    void (async () => {
      const queue = [...targets];
      const worker = async () => {
        for (;;) {
          const item = queue.shift();
          if (!item) return;
          state.statuses[item.productId] = 'running';
          try {
            const res: any = await this.refresh(schema, item.productId);
            state.statuses[item.productId] = res.status === 'ok' ? 'ok' : 'no-data';
            if (res.status === 'ok') state.ok++; else state.noData++;
          } catch (e: any) {
            state.statuses[item.productId] = 'error';
            this.logger.warn(`bulk refresh ${item.name}: ${e?.message}`);
          }
          state.done++;
          await new Promise((r) => setTimeout(r, 400)); // politeness gap
        }
      };
      await Promise.all([worker(), worker()]);
      state.running = false;
      state.finishedAt = new Date().toISOString();
    })();

    return state;
  }

  refreshStatus(schema: string): BulkState | { running: false; total: 0; done: 0 } {
    return this.bulk.get(schema) || { running: false, total: 0, done: 0 };
  }

  // ─── Search + extraction ─────────────────────────────────────────────────────
  /** Two targeted queries (plain + India B2B marketplaces), merged & deduped. */
  private async searchSnippets(searxBase: string, productName: string): Promise<Array<{ title: string; content: string; url: string }>> {
    const queries = [
      `"${productName}" price`,
      `${productName} price site:indiamart.com OR site:moglix.com OR site:industrybuying.com OR site:amazon.in`,
    ];
    const out: Array<{ title: string; content: string; url: string }> = [];
    const seen = new Set<string>();
    for (const q of queries) {
      const url = `${searxBase}/search?q=${encodeURIComponent(q)}&format=json&language=en-IN&safesearch=1`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
        if (!res.ok) continue;
        const json: any = await res.json();
        for (const r of (json?.results || []).slice(0, 25)) {
          const key = String(r?.url || r?.title || '');
          if (!key || seen.has(key)) continue;
          seen.add(key);
          out.push({ title: String(r?.title || ''), content: String(r?.content || ''), url: key });
        }
      } catch { /* engine hiccup — the other query may still work */ }
      finally { clearTimeout(timer); }
    }
    return out;
  }

  /** Keep only results that genuinely describe THIS product (token + size match). */
  private relevantSnippets(productName: string, snippets: Array<{ title: string; content: string; url: string }>) {
    const tokens = productName.toLowerCase().split(/[^a-z0-9/.]+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
    const words = tokens.filter((t) => !/\d/.test(t));
    const numbers = tokens.filter((t) => /\d/.test(t));
    return snippets.filter((s) => {
      const hay = `${s.title} ${s.content}`.toLowerCase();
      const wordHits = words.filter((w) => hay.includes(w)).length;
      const wordScore = words.length ? wordHits / words.length : 1;
      // Sizes/measures in the name (1000, 3/4, sch-40 …) MUST appear — a "500 LTR"
      // page must not price the "1000 LTR" tank.
      const numbersOk = numbers.every((n) => hay.includes(n));
      return wordScore >= 0.55 && numbersOk;
    });
  }

  /** Listing-page domains worth fetching (public price-listing sites). */
  private static readonly LISTING_HOSTS = /indiamart\.com|moglix\.com|industrybuying\.com|amazon\.in|flipkart\.com|tradeindia\.com|justdial\.com/i;

  /**
   * Fetch up to 4 listing pages from the search results and return the text WINDOWS
   * (±260 chars around each ₹-price) that also mention this product's brand and every
   * size number from its name — i.e. the price is proven to sit next to THIS product,
   * not just anywhere on the page.
   */
  private async fetchListingContexts(productName: string, snippets: Array<{ title: string; content: string; url: string }>): Promise<string[]> {
    const tokens = productName.toLowerCase().split(/[^a-z0-9/.]+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
    const brand = tokens[0] || '';
    const numbers = tokens.filter((t) => /\d/.test(t));
    const urls = snippets.map((s) => s.url).filter((u) => MarketPriceService.LISTING_HOSTS.test(u)).slice(0, 4);
    const contexts: string[] = [];

    await Promise.all(urls.map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', accept: 'text/html' },
        });
        if (!res.ok) return;
        const html = await res.text();
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ');
        const re = /(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?/gi;
        let m: RegExpExecArray | null;
        let found = 0;
        while ((m = re.exec(text)) && found < 12) {
          const win = text.slice(Math.max(0, m.index - 260), m.index + 120).toLowerCase();
          if (brand && !win.includes(brand)) continue;
          if (numbers.length && !numbers.every((n) => win.includes(n))) continue;
          contexts.push(text.slice(Math.max(0, m.index - 260), m.index + 120));
          found++;
        }
      } catch { /* blocked/slow page — others may work */ }
      finally { clearTimeout(timer); }
    }));
    return contexts;
  }

  /** ₹-price candidates from matched texts, sanity-banded around your own price. */
  private pricePoints(refPrice: number, texts: string[]): number[] {
    const points: number[] = [];
    const re = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi;
    for (const t of texts) {
      for (const m of t.matchAll(re)) {
        const v = parseFloat(m[1].replace(/,/g, ''));
        if (!(v >= 10 && v <= 10_000_000)) continue;
        // Your own realized price is the best free prior: discard absurd outliers.
        if (refPrice > 0 && (v < refPrice * 0.3 || v > refPrice * 3)) continue;
        points.push(v);
      }
    }
    return points;
  }

  /** IQR-filtered low/median/high + dispersion-aware confidence from raw points. */
  private statsFromPoints(points: number[]) {
    if (points.length < 2) return null;
    const sorted = [...points].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const kept = sorted.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
    if (kept.length < 2) return null;
    const median = kept[Math.floor(kept.length / 2)];
    // Confidence: point count AND tightness (wide scatter = low trust).
    const spread = median > 0 ? (kept[kept.length - 1] - kept[0]) / median : 1;
    const confidence = r2(Math.max(0.1, Math.min(1, (kept.length / 8) * (spread > 1 ? 0.5 : 1))));
    return { low: kept[0], median, high: kept[kept.length - 1], points: kept.length, confidence };
  }

  /**
   * Optional free-LLM extraction. Works with ANY OpenAI-compatible endpoint:
   * self-hosted Ollama (`LLM_API_URL=http://ollama:11434/v1`, `LLM_MODEL=qwen2.5:3b`)
   * or free-tier hosts (Groq/OpenRouter) via LLM_API_URL + LLM_API_KEY + LLM_MODEL.
   * Returns null when unconfigured or on any failure → deterministic fallback runs.
   */
  private async llmExtract(productName: string, refPrice: number, relevant: Array<{ title: string; content: string; url: string }>) {
    const base = this.config.get<string>('LLM_API_URL');
    if (!base || relevant.length === 0) return null;
    const model = this.config.get<string>('LLM_MODEL', 'llama-3.1-8b-instant');
    const key = this.config.get<string>('LLM_API_KEY', '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const snippetText = relevant.slice(0, 12).map((s, i) => `[${i + 1}] ${s.title} — ${s.content}`).join('\n');
      const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You extract Indian market prices from search snippets. Reply ONLY with JSON: {"low":number,"median":number,"high":number,"points":number} for the EXACT product named — same brand, model AND size. Ignore prices of different sizes/variants, accessories, or unrelated items. Prices are in INR (₹/Rs). If fewer than 2 trustworthy price points exist, reply {"points":0}.' },
            { role: 'user', content: `Product: "${productName}"${refPrice > 0 ? ` (the seller currently sells it around ₹${Math.round(refPrice)})` : ''}\n\nSearch snippets:\n${snippetText}` },
          ],
        }),
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      const parsed = JSON.parse(json?.choices?.[0]?.message?.content || '{}');
      const { low, median, high, points } = parsed || {};
      if (!(Number(points) >= 2) || !(Number(median) > 0)) return null;
      if (refPrice > 0 && (median < refPrice * 0.25 || median > refPrice * 4)) return null; // LLM sanity band
      return {
        low: Math.min(Number(low) || median, median),
        median: Number(median),
        high: Math.max(Number(high) || median, median),
        points: Number(points),
        confidence: r2(Math.max(0.2, Math.min(1, Number(points) / 6))),
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
