/**
 * Marketplace Search — candidate PRICE CARD extractor for Indian B2B goods.
 *
 * This module queries each marketplace's OWN on-site search (indiamart, moglix,
 * industrybuying, amazon.in) and returns structured { site, title, price, unit, url }
 * cards. It ONLY EXTRACTS candidates — it does NOT decide whether a card is really
 * the product you searched for. Scoring, the size/model gates and confidence live in
 * the caller (product-match.ts, scoreCard); keeping extraction dumb means one place
 * owns "is this the same product?" and this file stays a thin, testable scraper.
 *
 * STRATEGY — JSON-LD FIRST:
 *   No DOM library exists server-side, so we parse embedded machine-readable data
 *   before touching visible HTML. In order of reliability:
 *     1. <script type="application/ld+json"> Product / Offer / ItemList blocks —
 *        the schema.org data the sites publish for Google. Most reliable: exact
 *        name + price + priceCurrency, no layout guessing.
 *     2. Next.js __NEXT_DATA__ / embedded state JSON — moglix & industrybuying are
 *        SPAs whose SSR HTML still ships the product list as JSON. We deep-walk it
 *        for { name/title, price } shaped nodes.
 *     3. Visible-HTML fallback — regex over STRUCTURALLY-ADJACENT title/price pairs
 *        inside one card block (never "any ₹ anywhere on the page").
 *
 * fetchHtml is INJECTED by the caller: a polite raw fetch for server-rendered sites
 * (needsBrowser:false) or a real-browser fetch for SPA sites (needsBrowser:true).
 * This module never fetches on its own and never throws — parse failures yield [].
 */

export interface PriceCard {
  site: string;
  title: string;
  price: number;
  unit: string | null;
  url: string;
}

export interface MarketSite {
  name: string;
  searchUrl: (q: string) => string;
  needsBrowser: boolean;
  /** Optional trust multiplier applied by the caller (e.g. generic marketplaces < B2B). */
  downWeight?: number;
}

/** Return at most this many cards per site (protects the caller from junk pages). */
const MAX_CARDS = 20;

export const MARKET_SITES: MarketSite[] = [
  {
    name: 'indiamart',
    searchUrl: (q) => `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(q)}`,
    needsBrowser: false,
  },
  {
    name: 'moglix',
    searchUrl: (q) => `https://www.moglix.com/search/${encodeURIComponent(q)}`,
    needsBrowser: true,
  },
  {
    name: 'industrybuying',
    searchUrl: (q) => `https://www.industrybuying.com/search/?q=${encodeURIComponent(q)}`,
    needsBrowser: true,
  },
  {
    name: 'amazon',
    searchUrl: (q) => `https://www.amazon.in/s?k=${encodeURIComponent(q)}`,
    needsBrowser: true,
    downWeight: 0.85,
  },
];

// ─── Shared helpers ────────────────────────────────────────────────────────────

/** Known per-unit words we recognize when a price is quoted "per <unit>". */
const UNIT_WORDS = [
  'piece', 'pieces', 'pc', 'pcs', 'unit', 'units', 'no', 'nos', 'number',
  'meter', 'metre', 'meters', 'metres', 'mtr', 'rmt', 'running meter',
  'foot', 'feet', 'ft',
  'kg', 'kilogram', 'kilograms', 'gram', 'grams', 'gm', 'g',
  'litre', 'liter', 'litres', 'liters', 'ltr', 'ml',
  'set', 'sets', 'pack', 'packs', 'packet', 'box', 'boxes', 'bag', 'bags',
  'roll', 'rolls', 'sheet', 'sheets', 'pair', 'pairs', 'dozen', 'bottle', 'can',
  'sq ft', 'sqft', 'square feet', 'sq meter', 'sqm',
];
const UNIT_ALT = UNIT_WORDS
  .slice()
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/\s+/g, '\\s+'))
  .join('|');
/** "₹ 1,250 / Piece", "Rs. 90 per Meter", "INR 45 /Unit" → captures the unit word. */
const PRICE_UNIT_RE = new RegExp(
  `(?:₹|Rs\\.?|INR|MRP)?\\s*[\\d,]+(?:\\.\\d{1,2})?\\s*(?:/|per)\\s*(${UNIT_ALT})\\b`,
  'i',
);
/** A currency-prefixed number anywhere (used to read the price magnitude itself). */
const PRICE_NUM_RE = /(?:₹|Rs\.?|INR|MRP)\s*([\d,]+(?:\.\d{1,2})?)/i;

/** Parse a price string/number to a positive number, or 0 when not parseable. */
function toPrice(raw: unknown): number {
  if (typeof raw === 'number') return isFinite(raw) && raw > 0 ? raw : 0;
  if (typeof raw !== 'string') return 0;
  // Strip currency words/symbols, thousands separators; keep digits + decimal point.
  const cleaned = raw.replace(/[₹]/g, '').replace(/\b(?:Rs\.?|INR|MRP)\b/gi, '').replace(/,/g, '').trim();
  const m = cleaned.match(/(\d+(?:\.\d{1,2})?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return isFinite(n) && n > 0 ? n : 0;
}

/** Normalize a captured unit word to a clean, lower-case token (or null). */
function normUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const u = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  return u ? u : null;
}

/** Find a "/ Piece", "per Meter" unit word inside a small block of text. */
function unitFromText(block: string): string | null {
  const m = block.match(PRICE_UNIT_RE);
  return m ? normUnit(m[1]) : null;
}

/** Collapse HTML fragment to plain text (for titles / small blocks). */
function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Decode the handful of HTML entities that show up in titles/prices. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8377;|&#x20b9;/gi, '₹')
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(Number(d)); } catch { return ' '; }
    });
}

/** Push a card only if it has a title and a positive price; caps at MAX_CARDS. */
function pushCard(
  out: PriceCard[],
  site: string,
  title: unknown,
  price: number,
  unit: string | null,
  url: string,
  seen: Set<string>,
): void {
  if (out.length >= MAX_CARDS) return;
  const t = typeof title === 'string' ? decodeEntities(title).replace(/\s+/g, ' ').trim() : '';
  if (!t || !(price > 0)) return;
  const key = `${t.toLowerCase()}|${price}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ site, title: t, price, unit: unit || null, url: url || '' });
}

// ─── Embedded machine-readable data (strategy 1 & 2) ─────────────────────────────

/** Extract the bodies of every <script type="application/ld+json"> block. */
function ldJsonBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && blocks.length < 30) {
    const body = m[1].trim();
    if (body) blocks.push(body);
  }
  return blocks;
}

/** Pull the number out of a schema.org Offer (offers may be object, array, or nested). */
function offerPrice(offers: any): number {
  if (!offers) return 0;
  if (Array.isArray(offers)) {
    for (const o of offers) {
      const p = offerPrice(o);
      if (p > 0) return p;
    }
    return 0;
  }
  if (typeof offers === 'object') {
    const direct = toPrice(offers.price ?? offers.lowPrice ?? offers.highPrice);
    if (direct > 0) return direct;
    if (offers.priceSpecification) return offerPrice(offers.priceSpecification);
  }
  return toPrice(offers);
}

/** A schema.org unit code / text → a friendly unit word, when present. */
function offerUnit(node: any): string | null {
  const cand =
    node?.offers?.priceSpecification?.unitText ??
    node?.offers?.priceSpecification?.referenceQuantity?.unitText ??
    node?.priceSpecification?.unitText ??
    node?.unitText ??
    null;
  return normUnit(typeof cand === 'string' ? cand : null);
}

/** Walk a parsed JSON-LD value collecting every Product-shaped node with a price. */
function collectFromLd(node: any, site: string, out: PriceCard[], seen: Set<string>): void {
  if (!node || out.length >= MAX_CARDS) return;
  if (Array.isArray(node)) {
    for (const n of node) collectFromLd(n, site, out, seen);
    return;
  }
  if (typeof node !== 'object') return;

  // @graph and ItemList wrap the actual products.
  if (node['@graph']) collectFromLd(node['@graph'], site, out, seen);
  if (node.itemListElement) collectFromLd(node.itemListElement, site, out, seen);
  if (node.item) collectFromLd(node.item, site, out, seen);

  const type = node['@type'];
  const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
  if (isProduct || node.offers) {
    const title = node.name ?? node.title;
    const price = offerPrice(node.offers) || toPrice(node.price);
    const url = typeof node.url === 'string' ? node.url : (typeof node['@id'] === 'string' ? node['@id'] : '');
    if (title && price > 0) pushCard(out, site, title, price, offerUnit(node), url, seen);
  }
}

/** Strategy 1: parse all JSON-LD blocks into cards. */
function cardsFromLdJson(html: string, site: string, seen: Set<string>): PriceCard[] {
  const out: PriceCard[] = [];
  for (const body of ldJsonBlocks(html)) {
    if (out.length >= MAX_CARDS) break;
    try {
      collectFromLd(JSON.parse(body), site, out, seen);
    } catch {
      // A malformed/partial block must not sink the others.
    }
  }
  return out;
}

/** Extract the __NEXT_DATA__ JSON body (Next.js SSR state), when present. */
function nextDataBlock(html: string): string | null {
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  return m ? m[1].trim() : null;
}

/**
 * Strategy 2: deep-walk arbitrary state JSON (e.g. __NEXT_DATA__) for product-shaped
 * nodes — an object carrying BOTH a name/title AND a numeric price. Bounded so a huge
 * blob can't run away (node budget + card cap).
 */
function cardsFromStateJson(json: string, site: string, seen: Set<string>): PriceCard[] {
  const out: PriceCard[] = [];
  let root: any;
  try {
    root = JSON.parse(json);
  } catch {
    return out;
  }
  let budget = 200_000;
  const walk = (node: any): void => {
    if (out.length >= MAX_CARDS || budget <= 0 || node == null) return;
    budget--;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (typeof node !== 'object') return;

    const title = node.name ?? node.title ?? node.productName ?? node.product_name;
    const rawPrice =
      node.price ?? node.sellingPrice ?? node.selling_price ?? node.finalPrice ??
      node.mrp ?? node.salePrice ?? node.offerPrice ?? node.minPrice;
    if (typeof title === 'string' && title.trim() && rawPrice != null) {
      const price = toPrice(rawPrice);
      const url =
        (typeof node.url === 'string' && node.url) ||
        (typeof node.productUrl === 'string' && node.productUrl) ||
        (typeof node.slug === 'string' && node.slug) ||
        '';
      const unit = normUnit(typeof node.unit === 'string' ? node.unit : (typeof node.uom === 'string' ? node.uom : null));
      if (price > 0) pushCard(out, site, title, price, unit, url, seen);
    }
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(root);
  return out;
}

// ─── Visible-HTML fallback (strategy 3) ──────────────────────────────────────────

/**
 * Split HTML into repeating "card" blocks by an anchor tag/class, then pair the
 * title and price found WITHIN THE SAME block. This is the structural-adjacency rule:
 * a price only ever binds to the title in its own tile, never to a price elsewhere.
 */
function cardBlocks(html: string, splitRe: RegExp): string[] {
  // Split keeps things simple and predictable vs. trying to balance tags by hand.
  const parts = html.split(splitRe);
  // Drop the leading pre-first-card chunk; cap the number of blocks we consider.
  return parts.slice(1, MAX_CARDS * 4);
}

// ─── Site-specific extractors ────────────────────────────────────────────────────

/**
 * IndiaMART on-site search — server-rendered listing tiles. Each tile carries a
 * product title and a "₹ N / Piece|Meter|Unit" price. We split on tile boundaries
 * and pair title↔price inside each tile so a tile's price is never bound to another
 * tile's product.
 */
function extractIndiamart(html: string, seen: Set<string>): PriceCard[] {
  const out: PriceCard[] = [];

  // Tile boundary: IndiaMART wraps each product in a card container. Split loosely on
  // the listing card class families it has used ("card"/"prod" wrappers), plus the
  // price anchor as a secondary boundary so each block holds one product.
  const blocks = cardBlocks(html, /<div[^>]+class="[^"]*\b(?:card|prd|listing|prod)[^"]*"/i);

  for (const block of blocks) {
    if (out.length >= MAX_CARDS) break;
    // Title: prefer the product-title anchor/heading; fall back to the first anchor.
    let title = '';
    const titleM =
      block.match(/<(?:a|span|p|h[1-4])[^>]*(?:class="[^"]*\b(?:producttitle|prdtitle|prod-name|elp[_-]?name|title)[^"]*")[^>]*>([\s\S]*?)<\/(?:a|span|p|h[1-4])>/i) ||
      block.match(/<a[^>]+title="([^"]+)"/i) ||
      block.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    if (titleM) title = titleM[1].includes('<') ? stripTags(titleM[1]) : decodeEntities(titleM[1]).trim();
    if (!title) continue;

    // Price + unit within the SAME tile.
    const priceUnitM = block.match(
      new RegExp(`(?:₹|Rs\\.?|INR)\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:/|per)?\\s*(${UNIT_ALT})?`, 'i'),
    );
    let price = 0;
    let unit: string | null = null;
    if (priceUnitM) {
      price = toPrice(priceUnitM[1]);
      unit = normUnit(priceUnitM[2]);
    }
    if (!price) {
      const pm = block.match(PRICE_NUM_RE);
      if (pm) price = toPrice(pm[1]);
      unit = unit || unitFromText(block);
    }

    const urlM = block.match(/href="(https?:\/\/[^"']+)"/i);
    pushCard(out, 'indiamart', title, price, unit, urlM ? urlM[1] : '', seen);
  }

  return out;
}

/**
 * Moglix / IndustryBuying — SPA pages whose SSR HTML still ships product data as
 * JSON. JSON-LD first, then __NEXT_DATA__/state JSON, then a light visible-HTML
 * pass over price anchors as a last resort.
 */
function extractJsonFirst(html: string, site: string, seen: Set<string>): PriceCard[] {
  const ld = cardsFromLdJson(html, site, seen);
  if (ld.length) return ld;

  const nextData = nextDataBlock(html);
  if (nextData) {
    const fromNext = cardsFromStateJson(nextData, site, seen);
    if (fromNext.length) return fromNext;
  }

  // Some SPAs stash the catalogue in a window.__STATE__ / __INITIAL_STATE__ blob.
  const stateM = html.match(/window\.__(?:INITIAL_STATE|STATE|PRELOADED_STATE|APP_DATA)__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i);
  if (stateM) {
    const fromState = cardsFromStateJson(stateM[1], site, seen);
    if (fromState.length) return fromState;
  }

  // Last resort: structural title↔price pairs from visible tiles.
  return extractVisiblePairs(html, site, seen);
}

/**
 * Generic visible-HTML fallback: find repeating product tiles (anchor + a price node
 * nearby) and pair them within the block. Used when a site ships no usable JSON.
 */
function extractVisiblePairs(html: string, site: string, seen: Set<string>): PriceCard[] {
  const out: PriceCard[] = [];
  const blocks = cardBlocks(html, /<(?:div|li|article)[^>]+class="[^"]*\b(?:product|prod|card|item|listing|search-result|grid-cell)[^"]*"/i);

  for (const block of blocks) {
    if (out.length >= MAX_CARDS) break;
    const titleM =
      block.match(/<(?:a|span|p|h[1-4])[^>]*(?:class="[^"]*\b(?:name|title|product)[^"]*")[^>]*>([\s\S]*?)<\/(?:a|span|p|h[1-4])>/i) ||
      block.match(/<a[^>]+title="([^"]+)"/i) ||
      block.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleM) continue;
    const title = titleM[1].includes('<') ? stripTags(titleM[1]) : decodeEntities(titleM[1]).trim();
    if (!title) continue;

    const pm = block.match(PRICE_NUM_RE) || block.match(/(?:price[^>]*>|data-price="?)\s*[₹]?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const price = pm ? toPrice(pm[1]) : 0;
    if (!price) continue;

    const urlM = block.match(/href="(https?:\/\/[^"']+|\/[^"']+)"/i);
    pushCard(out, site, title, price, unitFromText(block), urlM ? urlM[1] : '', seen);
  }
  return out;
}

/**
 * Amazon.in search — s-search-result cards. Each result carries an <h2> title and a
 * span.a-offscreen price ("₹1,299.00"). We split on the result-card boundary and pair
 * title↔price inside each card.
 */
function extractAmazon(html: string, seen: Set<string>): PriceCard[] {
  const out: PriceCard[] = [];
  // Amazon marks each result with data-component-type="s-search-result".
  const blocks = html.split(/data-component-type="s-search-result"/i).slice(1, MAX_CARDS * 3);

  for (const block of blocks) {
    if (out.length >= MAX_CARDS) break;
    // Title: the <h2> text (may wrap an <a><span>). Grab the h2 inner content.
    const h2M = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    let title = h2M ? stripTags(h2M[1]) : '';
    if (!title) {
      const altM = block.match(/<a[^>]+class="[^"]*a-link-normal[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      if (altM) title = stripTags(altM[1]);
    }
    if (!title) continue;

    // Price: span.a-offscreen holds the rendered "₹1,299.00".
    const priceM =
      block.match(/<span[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/i) ||
      block.match(/class="a-price-whole"[^>]*>\s*([\d,]+)/i);
    const price = priceM ? toPrice(priceM[1]) : 0;
    if (!price) continue;

    // Amazon prices are per item; no per-unit word.
    pushCard(out, 'amazon', title, price, null, '', seen);
  }

  return out;
}

// ─── Public entry point ──────────────────────────────────────────────────────────

/**
 * Fetch a marketplace's on-site search page (via the injected fetchHtml) and extract
 * up to 20 candidate price cards. Never throws: any parse error, or a null page,
 * yields []. Scoring/matching is the caller's job (product-match.ts).
 */
export async function searchMarketplace(
  site: MarketSite,
  productName: string,
  fetchHtml: (url: string) => Promise<string | null>,
): Promise<PriceCard[]> {
  try {
    const q = String(productName || '').trim();
    if (!q) return [];
    const html = await fetchHtml(site.searchUrl(q));
    if (!html) return [];

    const seen = new Set<string>();
    let cards: PriceCard[];
    switch (site.name) {
      case 'indiamart':
        cards = extractIndiamart(html, seen);
        break;
      case 'amazon':
        cards = extractAmazon(html, seen);
        break;
      case 'moglix':
      case 'industrybuying':
        cards = extractJsonFirst(html, site.name, seen);
        break;
      default:
        // Unknown site: JSON-LD is the safest universal try.
        cards = extractJsonFirst(html, site.name, seen);
    }
    return cards.slice(0, MAX_CARDS);
  } catch {
    return [];
  }
}
