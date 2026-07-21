import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { MARKET_SITES, searchMarketplace, extractIndiamartCategory, MarketSite, PriceCard } from './marketplace-search';
import { tokenizeProduct, scoreCard, ProductIds } from './product-match';
import { BrowserFetcher } from './browser-fetch';

const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

/** One confidently-matched marketplace listing for a product. */
interface MatchAgg {
  points: number[];
  scores: number[];
  best: { site: string; title: string; url: string; price: number; tier: string; weighted: number } | null;
  matched: number;
  sitesTried: number;
}

export interface MarketPriceRow {
  productId: string;
  name: string;
  yourPrice: number;
  marketLow: number | null;
  marketMedian: number | null;
  marketHigh: number | null;
  marketAvg: number | null;
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
export class MarketPriceService implements OnModuleDestroy {
  private readonly logger = new Logger(MarketPriceService.name);
  /** One bulk refresh queue per tenant schema. */
  private readonly bulk = new Map<string, BulkState>();
  /** Category listing-page cache (slug → raw HTML). One page prices MANY products. */
  private readonly catPageCache = new Map<string, { at: number; html: string | null }>();
  private readonly CAT_TTL = 12 * 60 * 60 * 1000; // 12h
  /** Marketplace search-results cache (site|query → cards). Bulk runs reuse it. */
  private readonly msCache = new Map<string, { at: number; cards: PriceCard[] }>();
  /** Per-host politeness: serialized fetches with a minimum gap (free single-IP rule #1). */
  private readonly hostNextAt = new Map<string, number>();
  private hostChain: Promise<void> = Promise.resolve();
  private static readonly HOST_GAP_MS = 8_000;
  /** Opt-in headless browser for SPA marketplaces — OFF by default (2GB box). */
  private readonly browser: BrowserFetcher;

  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly config: ConfigService,
  ) {
    this.browser = new BrowserFetcher(this.config.get<string>('MARKET_BROWSER_ENABLED') === 'true');
  }

  async onModuleDestroy() {
    await this.browser.close().catch(() => undefined);
  }

  searchAvailable(): boolean {
    return !!this.config.get<string>('SEARX_URL');
  }

  // ─── Listing ─────────────────────────────────────────────────────────────────
  async list(schema: string): Promise<{ searchAvailable: boolean; llmEnabled: boolean; products: MarketPriceRow[] }> {
    // All active goods by default (volume-ordered so money-makers price first). Set
    // MARKET_LIST_LIMIT to cap for a smaller/faster set; 0 or unset = no cap.
    const limit = Math.max(0, Number(this.config.get<string>('MARKET_LIST_LIMIT')) || 0);
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
                mp.source, mp.price_low, mp.price_median, mp.price_high, mp.price_avg, mp.confidence, mp.source_note, mp.fetched_at
         FROM "${schema}".products p
         LEFT JOIN recent rec ON rec.pid = p.id
         LEFT JOIN LATERAL (
           SELECT * FROM "${schema}".market_prices m WHERE m.product_id = p.id
           ORDER BY CASE m.source WHEN 'manual' THEN 0 ELSE 1 END, m.fetched_at DESC LIMIT 1
         ) mp ON true
         WHERE p.is_active = true AND p.deleted_at IS NULL AND COALESCE(p.item_type,'product') <> 'service'
         ORDER BY monthly_volume_value DESC NULLS LAST
         ${limit > 0 ? `LIMIT ${limit}` : ''}`,
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
        marketAvg: r.price_avg != null ? r2(Number(r.price_avg)) : null,
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
        `INSERT INTO "${schema}".market_prices (product_id, source, price_low, price_median, price_high, price_avg, confidence, source_note, fetched_at)
         VALUES ($1,'manual',$2,$3,$4,$5,1.0,$6,NOW())
         ON CONFLICT (product_id, source) DO UPDATE SET
           price_low = EXCLUDED.price_low, price_median = EXCLUDED.price_median, price_high = EXCLUDED.price_high,
           price_avg = EXCLUDED.price_avg, source_note = EXCLUDED.source_note, fetched_at = NOW()`,
        [body.productId, r2(Math.min(low, median)), r2(median), r2(Math.max(high, median)), r2(median), body.note?.trim() || 'Entered manually'],
      ),
    );
    await this.appendHistory(schema, body.productId, 'manual', Math.min(low, median), median, Math.max(high, median), 1.0, median);
    return { saved: true };
  }

  /** Append-only price history (blueprint: price trend over time). Best-effort. */
  private async appendHistory(schema: string, productId: string, source: string, low: number, median: number, high: number, confidence: number, avg?: number) {
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `INSERT INTO "${schema}".market_price_history (product_id, source, price_low, price_median, price_high, price_avg, confidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [productId, source, r2(low), r2(median), r2(high), avg != null ? r2(avg) : null, confidence],
      ),
    ).catch(() => undefined);
  }

  /** Product identity + reference price (2yr avg realized selling price, else list price). */
  private async loadProduct(schema: string, productId: string): Promise<{ id: string; name: string; barcode: string | null; sku: string | null; ref_price: number } | undefined> {
    const [product] = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT p.id, p.name, p.barcode, p.sku,
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
    return product;
  }

  // ─── Single refresh ──────────────────────────────────────────────────────────
  async refresh(schema: string, productId: string) {
    const searx = this.config.get<string>('SEARX_URL');
    if (!searx) return { status: 'unavailable', message: 'Search engine not configured (set SEARX_URL).' };

    const product = await this.loadProduct(schema, productId);
    if (!product) throw new BadRequestException('Product not found');
    const name = String(product.name);
    const refPrice = Number(product.ref_price) || 0;
    const ids: ProductIds = { barcode: product.barcode, sku: product.sku };

    // Time budget: an interactive refresh must answer fast; bulk gets longer.
    const deadline = Date.now() + (this.bulk.get(schema)?.running ? 120_000 : 45_000);

    // TIER 1 (best): on-site marketplace SEARCH + confidence-scored matching — reads
    // the price attached to a SPECIFIC matched result card (brand+model+size gated),
    // not "any ₹ near the brand". This is the accuracy upgrade.
    const agg = await this.marketplaceMatch(name, refPrice, ids, deadline);

    // TIER 2: the marketplace CATEGORY page (server-rendered, cached 12h — one fetch
    // prices many products of the category). Used to supplement / when Tier 1 is thin.
    let contexts: string[] = [];
    let catText: string | null = null;
    if (agg.matched < 2 && Date.now() < deadline - 15_000) {
      catText = await this.categoryPageText(name, deadline);
      if (catText) contexts = this.windowsFromText(name, catText);
    }

    // TIER 3: metasearch → listing URLs → window extraction (SearXNG; last resort).
    let searched = 0;
    let relevant: Array<{ title: string; content: string; url: string }> = [];
    if (agg.matched < 2 && contexts.length < 2 && Date.now() < deadline - 20_000) {
      const snippets = await this.searchSnippets(searx.replace(/\/$/, ''), [
        `"${name}" price`,
        `${name} price site:indiamart.com OR site:moglix.com OR site:industrybuying.com OR site:amazon.in`,
      ]);
      searched = snippets.length;
      relevant = this.relevantSnippets(name, snippets);
      const pageContexts = await this.fetchListingContexts(name, snippets, deadline);
      contexts = [...contexts, ...pageContexts];
    }

    // Aggregate. Matched marketplace CARDS are the highest-quality points; category /
    // search windows fill in behind them.
    let result: ReturnType<typeof this.statsFromPoints>;
    let via: string;
    if (agg.points.length >= 2) {
      result = this.statsFromPoints(agg.points);
      // Blend dispersion confidence with the average match score (card-score-weighted).
      if (result) result.confidence = r2(Math.min(1, result.confidence * (0.6 + 0.4 * agg.avgScore())));
      via = 'marketplace';
    } else {
      const allPoints = [
        ...agg.points,
        ...this.pricePoints(refPrice, contexts),
        ...this.pricePoints(refPrice, relevant.map((s) => `${s.title} ${s.content}`)),
      ];
      // Free LLM extraction when configured, else deterministic stats.
      result = await this.llmExtract(name, refPrice, [
        ...relevant.map((s) => ({ title: s.title, content: s.content, url: s.url })),
        ...contexts.slice(0, 10).map((c, i) => ({ title: `listing context ${i + 1}`, content: c, url: '' })),
      ]);
      via = 'llm';
      if (!result) { result = this.statsFromPoints(allPoints); via = 'web'; }
    }

    if (!result) {
      return { status: 'no-data', message: `No confident market price found (marketplaces tried ${agg.sitesTried}, ${agg.matched} matched listings, category ${catText ? 'checked' : 'skipped'}, ${searched} search results) — add a manual price.` };
    }

    const note = via === 'marketplace'
      ? `Matched ${agg.matched} listing(s)${agg.best ? ` · best ${agg.best.site} (${agg.best.tier})` : ''}`
      : `${via === 'llm' ? 'LLM' : 'Web'} · ${result.points} price point(s)`;
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `INSERT INTO "${schema}".market_prices (product_id, source, price_low, price_median, price_high, price_avg, confidence, source_note, fetched_at)
         VALUES ($1,'search',$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (product_id, source) DO UPDATE SET
           price_low = EXCLUDED.price_low, price_median = EXCLUDED.price_median, price_high = EXCLUDED.price_high,
           price_avg = EXCLUDED.price_avg, confidence = EXCLUDED.confidence, source_note = EXCLUDED.source_note, fetched_at = NOW()`,
        [productId, r2(result.low), r2(result.median), r2(result.high), r2(result.avg), result.confidence, note],
      ),
    );
    await this.appendHistory(schema, productId, 'search', result.low, result.median, result.high, result.confidence, result.avg);
    // LEARNING: remember a confidently-matched listing so future runs trust it.
    if (agg.best && (agg.best.tier === 'exact' || agg.best.tier === 'high')) {
      await this.learnMatch(schema, productId, agg.best, result.confidence);
    }
    return { status: 'ok', low: r2(result.low), median: r2(result.median), high: r2(result.high), avg: r2(result.avg), points: result.points, via };
  }

  // ─── Tier 1: confidence-matched marketplace cards ─────────────────────────────
  /**
   * Score price cards from (a) the IndiaMART CATEGORY page tiles — the reliable
   * server-rendered source on a datacenter IP — and (b) each marketplace's on-site
   * search (SPA sites only when the opt-in browser is on). Every card runs through the
   * brand+model+size-gated matcher; only accepted cards contribute a price point.
   */
  private async marketplaceMatch(name: string, refPrice: number, ids: ProductIds, deadline: number): Promise<MatchAgg & { avgScore: () => number }> {
    const product = tokenizeProduct(name);
    const agg: MatchAgg = { points: [], scores: [], best: null, matched: 0, sitesTried: 0 };

    const consume = (site: string, downWeight: number, cards: PriceCard[]) => {
      for (const c of cards) {
        const r = scoreCard(product, c.title, ids);
        if (!r.accept) continue;
        // Sanity band: your own realized price is the best free prior.
        if (refPrice > 0 && (c.price < refPrice * 0.3 || c.price > refPrice * 3)) continue;
        const weighted = r.score * downWeight;
        agg.points.push(c.price);
        agg.scores.push(weighted);
        agg.matched++;
        if (!agg.best || weighted > agg.best.weighted) {
          agg.best = { site, title: c.title, url: c.url, price: c.price, tier: r.tier, weighted };
        }
      }
    };

    // (a) IndiaMART category page tiles — matched, not window-scraped.
    agg.sitesTried++;
    consume('indiamart', 1, await this.categoryPageCards(name, deadline));

    // (b) On-site marketplace search (SPA sites gated behind the opt-in browser).
    for (const site of MARKET_SITES) {
      if (Date.now() > deadline - 12_000) break;
      if (site.name === 'indiamart') continue; // covered by the category page above
      if (site.needsBrowser && !this.browser.isEnabled()) continue;
      agg.sitesTried++;
      consume(site.name, site.downWeight || 1, await this.siteCards(site, name, deadline));
    }

    return { ...agg, avgScore: () => (agg.scores.length ? agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length : 0) };
  }

  /** Cards for one site (12h cache). Injects raw polite fetch or the browser fetch. */
  private async siteCards(site: MarketSite, name: string, deadline: number): Promise<PriceCard[]> {
    const key = `${site.name}|${name.toLowerCase()}`;
    const hit = this.msCache.get(key);
    if (hit && Date.now() - hit.at < this.CAT_TTL) return hit.cards;
    const fetchHtml = site.needsBrowser
      ? (url: string) => this.browser.fetchHtml(url, { timeoutMs: 15_000 })
      : (url: string) => this.fetchPolite(url, deadline);
    const cards = await searchMarketplace(site, name, fetchHtml).catch(() => [] as PriceCard[]);
    this.msCache.set(key, { at: Date.now(), cards });
    return cards;
  }

  /** Persist a high-confidence product↔listing mapping (blueprint Learning engine). */
  private async learnMatch(schema: string, productId: string, best: NonNullable<MatchAgg['best']>, confidence: number) {
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `INSERT INTO "${schema}".market_price_matches (product_id, site, matched_title, matched_url, price, tier, confidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (product_id, site) DO UPDATE SET
           matched_title = EXCLUDED.matched_title, matched_url = EXCLUDED.matched_url, price = EXCLUDED.price,
           tier = EXCLUDED.tier, confidence = EXCLUDED.confidence, learned_at = NOW()`,
        [productId, best.site, best.title.slice(0, 500), best.url || null, r2(best.price), best.tier, confidence],
      ),
    ).catch(() => undefined);
  }

  // ─── City/state price comparator ─────────────────────────────────────────────
  /** DB row → API shape shared by locationPrices and the compareLocation cache hit. */
  private static locationRow(r: any) {
    return {
      state: String(r.state),
      city: String(r.city),
      low: r.price_low != null ? r2(Number(r.price_low)) : null,
      median: r.price_median != null ? r2(Number(r.price_median)) : null,
      high: r.price_high != null ? r2(Number(r.price_high)) : null,
      avg: r.price_avg != null ? r2(Number(r.price_avg)) : null,
      points: r.points != null ? Number(r.points) : null,
      confidence: r.confidence != null ? Number(r.confidence) : null,
      sourceNote: r.source_note || null,
      fetchedAt: r.fetched_at || null,
    };
  }

  /** All cached city figures for a product + the national row (for the comparator chart). */
  async locationPrices(schema: string, productId: string) {
    const product = await this.loadProduct(schema, productId);
    if (!product) throw new BadRequestException('Product not found');
    const [rows, [national]] = await Promise.all([
      this.cm.executeInTenantContext(schema, (qr) =>
        qr.query(
          `SELECT state, city, price_low, price_median, price_high, price_avg, points, confidence, source_note, fetched_at
           FROM "${schema}".market_price_locations WHERE product_id = $1 ORDER BY fetched_at DESC LIMIT 12`,
          [productId],
        ),
      ),
      this.cm.executeInTenantContext(schema, (qr) =>
        qr.query(
          `SELECT 'national' AS state, 'National' AS city, price_low, price_median, price_high, price_avg,
                  NULL AS points, confidence, source_note, fetched_at
           FROM "${schema}".market_prices WHERE product_id = $1
           ORDER BY CASE source WHEN 'manual' THEN 0 ELSE 1 END, fetched_at DESC LIMIT 1`,
          [productId],
        ),
      ),
    ]);
    return {
      productId,
      name: String(product.name),
      yourPrice: r2(Number(product.ref_price) || 0),
      national: national ? MarketPriceService.locationRow(national) : null,
      locations: rows.map(MarketPriceService.locationRow),
    };
  }

  /**
   * Live city-level price check. Sources, most-trusted first:
   *   1. IndiaMART search with its own `cq` city filter — genuine B2B locality
   *      pricing, server-rendered, free.
   *   2. Google Shopping via Serper.dev with a city `location` (opt-in,
   *      SERPER_API_KEY) — the reliable way to city-bias retail results.
   *   3. City-qualified SearXNG metasearch as the thin-data fallback.
   * Every candidate passes the same brand+model+size matcher and the 0.3×–3×
   * sanity band as the national engine, then the MAD-robust aggregation.
   * Results cache 12h in market_price_locations (UNIQUE product+state+city).
   */
  async compareLocation(schema: string, productId: string, state: string, city: string, force = false) {
    const st = String(state || '').trim().slice(0, 60);
    const ct = String(city || '').trim().slice(0, 60);
    if (!st || !ct || !/^[a-zA-Z][a-zA-Z .&()-]*$/.test(st) || !/^[a-zA-Z][a-zA-Z .&()-]*$/.test(ct)) {
      throw new BadRequestException('A valid state and city are required');
    }

    if (!force) {
      const [hit] = await this.cm.executeInTenantContext(schema, (qr) =>
        qr.query(
          `SELECT state, city, price_low, price_median, price_high, price_avg, points, confidence, source_note, fetched_at
           FROM "${schema}".market_price_locations
           WHERE product_id = $1 AND LOWER(state) = LOWER($2) AND LOWER(city) = LOWER($3)
             AND fetched_at > NOW() - interval '12 hours'`,
          [productId, st, ct],
        ),
      );
      if (hit) return { status: 'ok', cached: true, ...MarketPriceService.locationRow(hit) };
    }

    const product = await this.loadProduct(schema, productId);
    if (!product) throw new BadRequestException('Product not found');
    const name = String(product.name);
    const refPrice = Number(product.ref_price) || 0;
    const ids: ProductIds = { barcode: product.barcode, sku: product.sku };
    const tokens = tokenizeProduct(name);
    const deadline = Date.now() + 40_000;

    const points: number[] = [];
    const via: string[] = [];
    const consume = (label: string, cards: PriceCard[]) => {
      let n = 0;
      for (const c of cards) {
        if (!scoreCard(tokens, c.title, ids).accept) continue;
        if (refPrice > 0 && (c.price < refPrice * 0.3 || c.price > refPrice * 3)) continue;
        points.push(c.price);
        n++;
      }
      if (n) via.push(`${label} ×${n}`);
    };

    // 1) IndiaMART CITY DIRECTORY page — dir.indiamart.com/<city>/<slug>.html is
    //    server-rendered (like the national impcat pages) even for datacenter IPs,
    //    unlike search.mp which bot-gates them. Cards first, brand+size-gated text
    //    windows from the same fetched page as backup.
    const cityHtml = await this.cityCategoryHtml(name, ct, deadline);
    if (cityHtml) {
      consume('indiamart-city', extractIndiamartCategory(cityHtml));
      if (points.length < 2) {
        const pts = this.pricePoints(refPrice, this.windowsFromText(name, MarketPriceService.toText(cityHtml)));
        if (pts.length) {
          points.push(...pts);
          via.push(`indiamart-city-page ×${pts.length}`);
        }
      }
    }

    // 2) Google Shopping with a city location (optional, SERPER_API_KEY) — cheap and fast.
    consume('google-shopping', await this.serperShopping(name, st, ct));

    // 3) IndiaMART on-site search with its cq city filter — bot-gated on most
    //    datacenter IPs but works elsewhere; only worth one polite fetch when thin.
    const indiamart = MARKET_SITES.find((s) => s.name === 'indiamart');
    if (indiamart && points.length < 2 && Date.now() < deadline - 20_000) {
      consume('indiamart-search', await searchMarketplace(indiamart, name, (url) => this.fetchPolite(url, deadline), ct).catch(() => [] as PriceCard[]));
    }

    // 4) City-qualified metasearch + listing-page windows as the last resort.
    if (points.length < 2) {
      const searx = this.config.get<string>('SEARX_URL');
      if (searx && Date.now() < deadline - 18_000) {
        // NOTE: the city must stay OUTSIDE the quoted product phrase — quoting
        // "<product> <city>" as one phrase matches nothing.
        const snippets = await this.searchSnippets(searx.replace(/\/$/, ''), [
          `"${name}" price ${ct}`,
          `${name} ${ct} site:indiamart.com OR site:tradeindia.com OR site:justdial.com`,
        ]);
        const rel = this.relevantSnippets(name, snippets);
        const pts = this.pricePoints(refPrice, rel.map((s) => `${s.title} ${s.content}`));
        if (pts.length) {
          points.push(...pts);
          via.push(`web ×${pts.length}`);
        }
        if (points.length < 2 && Date.now() < deadline - 18_000) {
          const pagePts = this.pricePoints(refPrice, await this.fetchListingContexts(name, snippets, deadline));
          if (pagePts.length) {
            points.push(...pagePts);
            via.push(`listing-pages ×${pagePts.length}`);
          }
        }
      }
    }

    let stats = this.statsFromPoints(points);
    // One brand+size-verified listing is still a real observation — publish it at
    // low confidence instead of a blanket "no data" (city coverage is thin by nature).
    if (!stats && points.length === 1) {
      stats = { low: points[0], median: points[0], high: points[0], avg: points[0], points: 1, confidence: 0.2 };
      via.push('single listing');
    }
    if (!stats) {
      return {
        status: 'no-data', state: st, city: ct,
        message: `No ${ct} listings matched this product confidently. Coverage is best in metro cities — try the nearest one, or set the city price manually. The national figure still applies.`,
      };
    }

    const note = `${ct} · ${via.join(' · ')}`;
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `INSERT INTO "${schema}".market_price_locations (product_id, state, city, price_low, price_median, price_high, price_avg, points, confidence, source_note, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT (product_id, state, city) DO UPDATE SET
           price_low = EXCLUDED.price_low, price_median = EXCLUDED.price_median, price_high = EXCLUDED.price_high,
           price_avg = EXCLUDED.price_avg, points = EXCLUDED.points, confidence = EXCLUDED.confidence,
           source_note = EXCLUDED.source_note, fetched_at = NOW()`,
        [productId, st, ct, r2(stats.low), r2(stats.median), r2(stats.high), r2(stats.avg), stats.points, stats.confidence, note],
      ),
    );
    return {
      status: 'ok', state: st, city: ct,
      low: r2(stats.low), median: r2(stats.median), high: r2(stats.high), avg: r2(stats.avg),
      points: stats.points, confidence: stats.confidence, sourceNote: note, fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Google Shopping results biased to a city, via Serper.dev (free tier 2,500
   * queries, then ~$0.001/query). Optional: returns [] when SERPER_API_KEY is
   * unset or on any failure — the free IndiaMART/SearXNG paths always remain.
   */
  private async serperShopping(name: string, state: string, city: string): Promise<PriceCard[]> {
    const key = this.config.get<string>('SERPER_API_KEY');
    if (!key) return [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch('https://google.serper.dev/shopping', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ q: name, gl: 'in', location: `${city}, ${state}, India` }),
      });
      if (!res.ok) return [];
      const json: any = await res.json();
      const out: PriceCard[] = [];
      for (const item of (json?.shopping || []).slice(0, 20)) {
        const price = parseFloat(String(item?.price || '').replace(/[^0-9.]/g, ''));
        if (!(price > 0)) continue;
        out.push({ site: 'google-shopping', title: String(item?.title || ''), price, unit: null, url: String(item?.link || '') });
      }
      return out;
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
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

    // Fire-and-forget worker. SINGLE worker: outbound fetches are globally
    // serialized + per-host rate-limited anyway (that's how a one-IP scraper
    // survives), and the 12h category-page cache means most products resolve
    // WITHOUT any network call at all once their category page is in.
    void (async () => {
      const queue = [...targets];
      for (;;) {
        const item = queue.shift();
        if (!item) break;
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
      }
      state.running = false;
      state.finishedAt = new Date().toISOString();
    })();

    return state;
  }

  refreshStatus(schema: string): BulkState | { running: false; total: 0; done: 0 } {
    return this.bulk.get(schema) || { running: false, total: 0, done: 0 };
  }

  // ─── Search + extraction ─────────────────────────────────────────────────────
  /** Run the given SearXNG queries, merged & deduped by result URL. */
  private async searchSnippets(searxBase: string, queries: string[]): Promise<Array<{ title: string; content: string; url: string }>> {
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

  // ─── Polite fetching (single-IP scraping survival kit) ──────────────────────
  /**
   * Serialized, per-host rate-limited fetch: at most one request per HOST_GAP_MS to
   * a given host, with one 60s backoff-and-retry on HTTP 429. Without this the
   * marketplaces 429 the server IP within minutes (observed live).
   */
  private fetchPolite(url: string, deadline?: number): Promise<string | null> {
    const run = async (): Promise<string | null> => {
      const host = new URL(url).host;
      const waitUntil = this.hostNextAt.get(host) || 0;
      const delay = Math.max(0, waitUntil - Date.now());
      // FAIL-FAST: never sleep past the caller's budget — a cooling host simply
      // isn't available this round; the 12h cache means a later round fills it.
      if (deadline && Date.now() + delay + 16_000 > deadline) return null;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      this.hostNextAt.set(host, Date.now() + MarketPriceService.HOST_GAP_MS);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', accept: 'text/html' },
        });
        if (res.status === 429) {
          // Mark the host cooling for 90s and move on (no in-request sleeps).
          this.hostNextAt.set(host, Date.now() + 90_000);
          this.logger.warn(`429 from ${host} — cooling 90s`);
          return null;
        }
        return res.ok ? await res.text() : null;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    };
    // Chain so all polite fetches are strictly serialized process-wide.
    const p = this.hostChain.then(run, run);
    this.hostChain = p.then(() => undefined, () => undefined);
    return p;
  }

  /** Strip HTML to text (for price-window extraction). */
  private static toText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
  }

  // ─── Category listing pages (primary source — one page prices many products) ─
  /** Slug candidates for an IndiaMART category page, from the product's name. */
  private slugCandidates(productName: string): string[] {
    const words = productName.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 2 && !STOPWORDS.has(w));
    if (!words.length) return [];
    const brand = words[0];
    // The "category phrase" = the trailing generic nouns (tank/pipe/elbow/valve…),
    // e.g. "sintex swr pipe type a" → "swr pipe".
    const NOUNS = ['tank', 'tanks', 'pipe', 'pipes', 'elbow', 'tape', 'valve', 'socket', 'clamp', 'solvent', 'adhesive', 'fitting', 'fittings', 'sheet', 'door', 'cock', 'trap', 'coupler', 'tee', 'union', 'reducer'];
    const nounIdx = words.findIndex((w) => NOUNS.includes(w));
    const out: string[] = [];
    const plural = (s: string) => (s.endsWith('s') ? s : `${s}s`);
    if (nounIdx > 0) {
      const noun = plural(words[nounIdx]);
      // Widest → narrowest: brand + full noun phrase, brand + qualifier + noun,
      // brand + noun (the proven "sintex-water-tanks" shape), then generic.
      const upTo3 = words.slice(Math.max(1, nounIdx - 2), nounIdx).filter((w) => !NOUNS.includes(w));
      if (upTo3.length >= 2) out.push(`${brand}-${upTo3.join('-')}-${noun}`);
      if (upTo3.length >= 1) out.push(`${brand}-${upTo3[upTo3.length - 1]}-${noun}`);
      out.push(`${brand}-${noun}`);
      if (upTo3.length >= 1) out.push(`${upTo3[upTo3.length - 1]}-${noun}`);
    }
    out.push(`${brand}-${plural(words.slice(1, 3).join('-'))}`);
    return [...new Set(out)].filter(Boolean).slice(0, 5);
  }

  /** Fetch (or reuse) the raw HTML of the first category page that resolves; null if none. */
  private async categoryPageHtml(productName: string, deadline?: number): Promise<string | null> {
    for (const slug of this.slugCandidates(productName)) {
      const hit = this.catPageCache.get(slug);
      if (hit) {
        // Positive entries live CAT_TTL; misses retry after 2 min (host cool-downs pass).
        const ttl = hit.html ? this.CAT_TTL : 2 * 60 * 1000;
        if (Date.now() - hit.at < ttl) {
          if (hit.html) return hit.html;
          continue;
        }
      }
      const html = await this.fetchPolite(`https://dir.indiamart.com/impcat/${slug}.html`, deadline);
      const good = html && html.length > 20_000 ? html : null;
      this.catPageCache.set(slug, { at: Date.now(), html: good });
      if (good) return good;
      if (deadline && Date.now() > deadline - 16_000) break;
    }
    return null;
  }

  /**
   * CITY directory page HTML: dir.indiamart.com/<city>/<slug>.html — IndiaMART's
   * city-scoped category listings, server-rendered like the national impcat pages
   * (the on-site search.mp is bot-gated for datacenter IPs, these are not).
   * Same slug candidates and 12h cache as the national page, keyed per city.
   */
  private async cityCategoryHtml(productName: string, city: string, deadline?: number): Promise<string | null> {
    const citySlug = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!citySlug) return null;
    for (const slug of this.slugCandidates(productName)) {
      const key = `${citySlug}/${slug}`;
      const hit = this.catPageCache.get(key);
      if (hit) {
        const ttl = hit.html ? this.CAT_TTL : 2 * 60 * 1000;
        if (Date.now() - hit.at < ttl) {
          if (hit.html) return hit.html;
          continue;
        }
      }
      const html = await this.fetchPolite(`https://dir.indiamart.com/${citySlug}/${slug}.html`, deadline);
      // City pages carry far fewer tiles than national impcat pages — a real one
      // can be ~10-25KB (observed: nagpur/pvc-pipes = 26KB), a bot shell ~140B.
      const good = html && html.length > 8_000 ? html : null;
      this.catPageCache.set(key, { at: Date.now(), html: good });
      if (good) return good;
      if (deadline && Date.now() > deadline - 16_000) break;
    }
    return null;
  }

  /** Stripped text of the category page (for the window-based fallback). */
  private async categoryPageText(productName: string, deadline?: number): Promise<string | null> {
    const html = await this.categoryPageHtml(productName, deadline);
    return html ? MarketPriceService.toText(html) : null;
  }

  /** Structured price CARDS from the category page tiles (for the confidence matcher). */
  private async categoryPageCards(productName: string, deadline?: number): Promise<PriceCard[]> {
    const html = await this.categoryPageHtml(productName, deadline);
    return html ? extractIndiamartCategory(html) : [];
  }

  /** Price-windows from a category page that mention this product's brand + sizes. */
  private windowsFromText(productName: string, text: string): string[] {
    const tokens = productName.toLowerCase().split(/[^a-z0-9/.]+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
    const brand = tokens[0] || '';
    const numbers = tokens.filter((t) => /\d/.test(t));
    const contexts: string[] = [];
    const re = /(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) && contexts.length < 12) {
      const win = text.slice(Math.max(0, m.index - 260), m.index + 120).toLowerCase();
      if (brand && !win.includes(brand)) continue;
      if (numbers.length && !numbers.every((n) => win.includes(n))) continue;
      contexts.push(text.slice(Math.max(0, m.index - 260), m.index + 120));
    }
    return contexts;
  }

  /**
   * Fetch up to 4 listing pages from the search results and return the text WINDOWS
   * (±260 chars around each ₹-price) that also mention this product's brand and every
   * size number from its name — i.e. the price is proven to sit next to THIS product,
   * not just anywhere on the page.
   */
  private async fetchListingContexts(productName: string, snippets: Array<{ title: string; content: string; url: string }>, deadline?: number): Promise<string[]> {
    const tokens = productName.toLowerCase().split(/[^a-z0-9/.]+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
    const brand = tokens[0] || '';
    const numbers = tokens.filter((t) => /\d/.test(t));
    const urls = snippets.map((s) => s.url).filter((u) => MarketPriceService.LISTING_HOSTS.test(u)).slice(0, 4);
    const contexts: string[] = [];

    for (const url of urls.slice(0, 2)) { // polite: serialized, few pages
      const html = await this.fetchPolite(url, deadline);
      if (!html) continue;
      const text = MarketPriceService.toText(html);
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
    }
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

  /** Proper median (even-length samples average the middle pair). */
  private static median(sortedAsc: number[]): number {
    const m = sortedAsc.length >> 1;
    return sortedAsc.length % 2 ? sortedAsc[m] : (sortedAsc[m - 1] + sortedAsc[m]) / 2;
  }

  /**
   * Robust low/median/high from raw points — the price-comparison-industry standard:
   * Iglewicz–Hoaglin MODIFIED Z-SCORE outlier rejection (M = 0.6745·(x−median)/MAD,
   * reject |M| > 3.5) when n ≥ 5. MAD has a 50% breakdown point, so it survives the
   * heavy contamination scraping produces (accessories priced as the product,
   * per-piece vs per-pack listings) where mean/SD z-scores get masked. MAD is
   * unstable on tiny samples, so n < 5 falls back to the classic 1.5×IQR fence.
   * The survivors' MIN is the "best market price" (published as `low`); confidence
   * blends point count with relative dispersion (MAD/median).
   */
  private statsFromPoints(points: number[]) {
    if (points.length < 2) return null;
    const sorted = [...points].sort((a, b) => a - b);
    let kept: number[];
    if (sorted.length >= 5) {
      const m0 = MarketPriceService.median(sorted);
      const mad = MarketPriceService.median(sorted.map((v) => Math.abs(v - m0)).sort((a, b) => a - b));
      // MAD of 0 = the majority of points agree exactly — nothing to reject.
      kept = mad > 0 ? sorted.filter((v) => Math.abs((0.6745 * (v - m0)) / mad) <= 3.5) : sorted;
    } else {
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      kept = sorted.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
    }
    if (kept.length < 2) return null;
    const median = MarketPriceService.median(kept);
    const avg = kept.reduce((a, b) => a + b, 0) / kept.length;
    const relMad = median > 0 ? MarketPriceService.median(kept.map((v) => Math.abs(v - median)).sort((a, b) => a - b)) / median : 1;
    const tight = relMad <= 0.05 ? 1 : relMad <= 0.15 ? 0.85 : relMad <= 0.3 ? 0.6 : 0.4;
    const confidence = r2(Math.max(0.1, Math.min(1, Math.min(1, kept.length / 6) * tight)));
    return { low: kept[0], median, high: kept[kept.length - 1], avg, points: kept.length, confidence };
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
        avg: Number(median),
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
