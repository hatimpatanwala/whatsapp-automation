/**
 * Product Matching Engine (Master Blueprint) — decides whether a marketplace
 * search-result card is REALLY the same product as an ERP item, with a confidence
 * score. This replaces the old "grab any ₹ figure within 260 chars of the brand"
 * heuristic that produced random prices.
 *
 * The decisive guard is the SIZE GATE on normalized units: a "500 LTR" tank can
 * never match a "1000 LTR" tank, and a "3 MTR" pipe never matches a "6 MTR" pipe,
 * because every dimensioned quantity in the product name must be present in the
 * card (within 1% tolerance) or the card is rejected outright.
 *
 * Pure functions, no dependencies — unit-testable and reused for both raw-fetch
 * and browser-fetched cards.
 */

/** A quantity reduced to a canonical (magnitude, dimension) pair for comparison. */
export interface SizeDim {
  mag: number;
  dim: 'len' | 'vol' | 'mass' | 'inch' | 'num';
}

export interface ProductTokens {
  raw: string;
  brand: string;          // first significant word (or a known brand)
  models: string[];       // model/SKU codes: ab-80, type-a, sch-40 → collapsed to alnum
  sizes: SizeDim[];        // every dimensioned quantity (and bare numbers)
  words: Set<string>;      // all significant alpha tokens (for word-overlap)
}

/** Named confidence tiers (Master Prompt): Exact ≥95 / High ≥90 / Likely ≥80 / Reject. */
export type MatchTier = 'exact' | 'high' | 'likely' | 'reject';

export interface MatchResult {
  score: number;           // 0..1 weighted
  tier: MatchTier;
  accept: boolean;         // tier !== 'reject' (all gates passed AND score ≥ 0.80)
  brand: number;           // component scores (for logging/debug)
  model: number;
  size: number;
  overlap: number;
}

/** Strong identifiers off the ERP record — a title hit on these outranks fuzzy scoring. */
export interface ProductIds {
  barcode?: string | null;
  sku?: string | null;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'set', 'pack', 'of', 'a', 'in', 'white', 'black', 'blue', 'red', 'green', 'grey', 'gray', 'ivory', 'colour', 'color', 'new', 'best', 'quality', 'premium', 'heavy', 'duty']);

/** A small known-brand set sharpens brand matching; unknown brands fall back to the leading word. */
const KNOWN_BRANDS = new Set(['sintex', 'abro', 'astral', 'finolex', 'supreme', 'prince', 'ashirvad', 'kisan', 'vectus', 'plasto', 'nikko', 'kaju', 'ori-plast', 'oriplast', 'jindal', 'tata', 'apollo', 'skipper']);

const UNIT_MAP: Record<string, { dim: SizeDim['dim']; scale: number }> = {
  mm: { dim: 'len', scale: 0.001 },
  cm: { dim: 'len', scale: 0.01 },
  m: { dim: 'len', scale: 1 }, mt: { dim: 'len', scale: 1 }, mtr: { dim: 'len', scale: 1 }, metre: { dim: 'len', scale: 1 }, meter: { dim: 'len', scale: 1 }, feet: { dim: 'len', scale: 0.3048 }, ft: { dim: 'len', scale: 0.3048 },
  ltr: { dim: 'vol', scale: 1 }, litre: { dim: 'vol', scale: 1 }, liter: { dim: 'vol', scale: 1 }, l: { dim: 'vol', scale: 1 },
  ml: { dim: 'vol', scale: 0.001 },
  kg: { dim: 'mass', scale: 1 }, gm: { dim: 'mass', scale: 0.001 }, gram: { dim: 'mass', scale: 0.001 }, g: { dim: 'mass', scale: 0.001 },
  inch: { dim: 'inch', scale: 1 }, in: { dim: 'inch', scale: 1 }, '"': { dim: 'inch', scale: 1 },
};

const UNIT_ALT = Object.keys(UNIT_MAP).sort((a, b) => b.length - a.length).join('|');
// number (with optional fraction/decimal) immediately followed by an optional unit.
const SIZE_RE = new RegExp(`(\\d+(?:\\.\\d+)?(?:/\\d+)?)\\s*(${UNIT_ALT})?`, 'gi');
// dash-joined or fused alphanumeric model codes, and known spec prefixes.
const MODEL_RES = [
  /\b([a-z]{2,})-([a-z0-9]{1,3})\b/gi,          // ab-80, type-a, sch-40, sdr-13
  /\b([a-z]{2,}\d{1,4}[a-z]?)\b/gi,             // ab80, m10
  /\b(type|sch|sdr|class|cl|grade|no|series)\s?-?\s?([a-z0-9.]+)\b/gi, // type a, class-3
];

function parseNum(s: string): number {
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return b ? a / b : a;
  }
  return Number(s);
}

/**
 * Normalize every DIMENSIONED quantity in a text to canonical (mag, dim) pairs.
 * Unit-less bare numbers (catalog years, edition/qty/pack counts like "2023", "2 door")
 * are deliberately NOT emitted — gating on them caused both false-rejects (the card
 * lacks the year) and false-accepts (any stray digit satisfied the gate).
 */
export function normalizeSizes(text: string): SizeDim[] {
  const out: SizeDim[] = [];
  for (const m of text.matchAll(SIZE_RE)) {
    const unit = (m[2] || '').toLowerCase();
    const u = unit ? UNIT_MAP[unit] : null;
    if (!u) continue; // no unit → not a real size, skip
    const n = parseNum(m[1]);
    if (!isFinite(n) || n <= 0) continue;
    out.push({ mag: n * u.scale, dim: u.dim });
  }
  return out;
}

/** Split a product/card name into brand, model codes, sizes and significant words. */
export function tokenizeProduct(name: string): ProductTokens {
  const raw = String(name || '');
  // Strip thousands separators INSIDE numbers first ("1,000 ltr" → "1000 ltr"),
  // THEN turn stray punctuation into spaces and " into an inch token.
  let work = raw.toLowerCase()
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/"/g, ' inch ')
    .replace(/,/g, ' ');

  const KNOWN_PREFIX = /^(type|sch|sdr|class|cl|grade|no|series)$/;

  // 1) Model codes first (so their trailing digits aren't misread as sizes).
  const models = new Set<string>();
  for (const re of MODEL_RES) {
    for (const m of work.matchAll(re)) {
      const alpha = (m[1] || '').toLowerCase();
      if (UNIT_MAP[alpha]) continue;               // "110mm" is a size, not a model
      const code = (m[1] + (m[2] || '')).toLowerCase().replace(/[^a-z0-9]/g, '');
      // A real model code carries a DIGIT (ab-80, sch-40, m10) or a known spec
      // prefix (type-a, class-3). Pure dashed words (hi-fi, co-op) are NOT models.
      if (code.length >= 2 && (/\d/.test(code) || KNOWN_PREFIX.test(alpha))) models.add(code);
    }
  }
  // Remove matched model spans so the size pass and word pass don't see their digits.
  for (const re of MODEL_RES) work = work.replace(re, ' ');

  // 2) Sizes from what remains.
  const sizes = normalizeSizes(work);

  // 3) Significant alpha words (drop pure numbers, units, stopwords).
  const words = new Set<string>();
  for (const t of work.split(/[^a-z0-9]+/)) {
    if (t.length < 2 || STOP.has(t) || UNIT_MAP[t] || /^\d/.test(t)) continue;
    words.add(t);
  }

  // 4) Brand: a known brand token if present, else the first significant word.
  let brand = '';
  for (const w of words) { if (KNOWN_BRANDS.has(w)) { brand = w; break; } }
  if (!brand) {
    const first = raw.toLowerCase().split(/[^a-z0-9]+/).find((t) => t.length >= 2 && !STOP.has(t) && !UNIT_MAP[t] && !/^\d/.test(t));
    brand = first || '';
  }

  return { raw, brand, models: [...models], sizes, words };
}

/**
 * MULTISET size gate: every product size must be matched by a DISTINCT card size
 * (same dim, ≤1% magnitude gap). Consuming a card size once means a 3m×3m product
 * needs TWO "3 m" values on the card, not one satisfying both.
 */
function sizesCovered(want: SizeDim[], have: SizeDim[]): boolean {
  if (!want.length) return true;
  const pool = have.slice();
  for (const w of want) {
    const tol = w.mag * 0.01 + 1e-9;
    const idx = pool.findIndex((h) => h.dim === w.dim && Math.abs(h.mag - w.mag) <= tol);
    if (idx === -1) return false;
    pool.splice(idx, 1);
  }
  return true;
}

/** Alphanumeric-only, lower-cased — for barcode/SKU substring hits in a title. */
function alnum(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tierFor(score: number, gatesOk: boolean): MatchTier {
  if (!gatesOk) return 'reject';
  if (score >= 0.95) return 'exact';
  if (score >= 0.90) return 'high';
  if (score >= 0.80) return 'likely';
  return 'reject';
}

/**
 * Weighted, gated, tiered confidence that a card title is the same product.
 * A barcode/SKU hit in the title is decisive (blueprint: "never rely on title only")
 * and short-circuits to Exact.
 */
export function scoreCard(product: ProductTokens, cardTitle: string, ids?: ProductIds): MatchResult {
  const card = tokenizeProduct(cardTitle);
  if (!card.words.size && !card.sizes.length) {
    return { score: 0, tier: 'reject', accept: false, brand: 0, model: 0, size: 0, overlap: 0 };
  }

  // Strong identifier: a barcode (≥8 digits) or SKU (≥4 alnum) present in the title
  // is an exact match regardless of fuzzy score.
  const titleAlnum = alnum(cardTitle);
  const bc = alnum(ids?.barcode || '');
  const sku = alnum(ids?.sku || '');
  if ((bc.length >= 8 && titleAlnum.includes(bc)) || (sku.length >= 4 && titleAlnum.includes(sku))) {
    return { score: 1, tier: 'exact', accept: true, brand: 1, model: 1, size: 1, overlap: 1 };
  }

  // Brand (hard floor): must be present; a product with NO brand word contributes
  // little so size+model alone can't sneak past the threshold.
  const brandScore = product.brand
    ? (card.words.has(product.brand) || card.brand === product.brand ? 1 : 0)
    : 0.25;

  // Size GATE (multiset): every product size matched by a distinct card size.
  const sizeScore = sizesCovered(product.sizes, card.sizes) ? 1 : 0;

  // Model GATE: every product model code must be present in the card.
  const modelScore = product.models.length
    ? product.models.filter((m) => card.models.includes(m)).length / product.models.length
    : 1;

  // Word overlap (soft): share of the product's words the card also has.
  let shared = 0;
  for (const w of product.words) if (card.words.has(w)) shared++;
  const overlap = product.words.size ? shared / product.words.size : 0;

  const score = 0.30 * brandScore + 0.25 * modelScore + 0.30 * sizeScore + 0.15 * overlap;
  const gatesOk =
    brandScore > 0 &&
    sizeScore === 1 &&
    (product.models.length === 0 || modelScore === 1) &&
    (brandScore === 1 || overlap >= 0.5); // brandless names need real word evidence
  const tier = tierFor(score, gatesOk);

  return {
    score: Math.round(score * 100) / 100,
    tier,
    accept: tier !== 'reject',
    brand: brandScore,
    model: modelScore,
    size: sizeScore,
    overlap: Math.round(overlap * 100) / 100,
  };
}
