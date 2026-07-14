# AI Insights Pro — Premium Business-Intelligence Module (Implementation Plan)

Status: **approved plan, not yet implemented**. The existing `/erp/insights` card (plan feature `erp`)
stays exactly as-is; everything below is a separate premium module behind a new plan flag.

## 0. Ground rules
- Do NOT change the current AI Insights card's UI/response for plan users.
- New capability ships behind a new plan feature flag, toggleable per plan and per tenant
  (existing super-admin machinery).
- Shared internal accuracy fixes (section 4) improve both, without changing the included card's surface.

## 1. Premium gating
- New plan flag `premiumInsights` ("AI Insights Pro — market pricing, forecasting & stock planning"):
  - `frontend/src/app/features/super-admin/subscriptions/plan-form.component.ts` → featureFlags + form control + payload
  - `frontend/src/app/core/services/feature.service.ts` → FEATURE_KEYS
  - Backend gate: `@RequiresFeature('premiumInsights')` + `ErpFeatureGuard` (same as `sfa`)
  - Per-tenant enable already works: `PATCH /admin/tenants/:id/features {"features":{"premiumInsights":true}}`
- Upsell UX: locked nav item (existing locked-feature render path in main-layout), lock screen on the
  page with highlights + Upgrade CTA, small "Pro" teaser chip on the existing AI Insights card
  (only when `erp` on and premium off).

## 2. Backend module `src/modules/erp/intel/`

### 2a. product-analytics.service.ts — Product Performance
Source: 8y of `invoices.items` JSONB + `products` + `inventory`.
Per-product: revenue/qty (30/90/365d), velocity (units/wk), momentum (3mo vs prior 3mo),
margin % (needs purchase_price), ABC class (80/15/5 cumulative revenue), days-of-cover
(stock ÷ velocity → stockout/overstock flags), dead stock (stock>0, no sales N days),
composite performance score 0–100 with visible sub-scores.

### 2b. market-price.service.ts — Market Pricing Intelligence
**Constraint: free & open-source only — no paid APIs.** Tiered sources, provenance-labeled:
1. Self-hosted web search + deterministic extraction (primary automated path):
   - **SearXNG** (open-source metasearch, AGPL) run as a docker container in the same
     compose stack on the EC2 — gives a free, keyless JSON search API.
   - Query "<product name> price India" → fetch top result pages (plain HTTP, cheerio) →
     extract ₹-price candidates via deterministic regex/heuristics (₹/Rs patterns near
     product-name tokens; drop outliers via IQR) → {low, median, high, sources}.
   - Cached in `market_prices`; weekly refresh of top-N revenue products + per-product
     on-demand refresh. Label "market estimate · fetched <date> · <n> sources".
   - Honest caveat: big marketplaces block scrapers; coverage will be partial and
     branded/commodity items (SINTEX tanks, CPVC fittings) will work far better than
     obscure SKUs. Confidence field reflects source count.
2. Optional **Ollama** (open-source, self-hosted LLM) parsing assist: if OLLAMA_URL is set,
   a small local model (e.g. qwen2.5:3b / llama3.2:3b) cleans noisy extractions. Strictly
   optional — the regex path works without it. NOTE: the current EC2 likely can't run
   this comfortably; ship regex-first, Ollama as an opt-in for bigger hosts.
3. Manual competitor prices (works day one, offline): drawer to record observed prices.
4. Cross-tenant anonymized benchmark — DEFERRED (needs ≥3 distinct tenants with overlapping catalog).

Output: your avg selling price (last 90d from invoice lines) vs market low/median/high →
badge Underpriced/Competitive/Overpriced + ₹ opportunity at current volume.

Migration 086: `market_prices (product_id, source['llm'|'manual'|'benchmark'], price_low,
price_median, price_high, region, confidence, source_note, fetched_at)` + sync columns.

### 2c. forecast.service.ts — 4-Month Forecast & Stock Planner
Deterministic TS (~100 lines, no ML deps):
- Monthly qty series per product → Holt-Winters (seasonal-12) if ≥24mo history; Holt linear if ≥8mo;
  weighted moving average otherwise; clamp ≥0. Outlier damping (median-based) in series builder.
- Backtest: hold out last 4 months → MAPE per product → confidence grade High/Med/Low shown in UI.
- Stock recommendation: 4mo forecast demand + lead time (default 14d, configurable) +
  safety stock (95% service × σ) − current stock → recommended order qty; overstock flag.
- "Best performers next 4 months" ranked by forecast revenue with seasonality callouts.
- `forecast_cache (product_id, month, qty, model, mape, generated_at)`; daily/on-demand refresh.
- Narrative: deterministic templates (same style as the existing engine's fallback — already
  good). Optional Ollama hook (OLLAMA_URL) for LLM-polished narrative; NO paid APIs.

### 2d. intel.controller.ts — `/erp/intel/*`
GET overview · GET performance · GET market-prices · POST market-prices/refresh/:productId ·
POST market-prices/manual · GET forecast · GET stock-plan.
All `@RequiresFeature('premiumInsights')` + Roles('owner','seller') + PermissionGuard reports:read.

## 3. Frontend page `/erp/intel` — "AI Insights Pro"
Tabs: Overview (headline cards + narrative) · Product Performance (sortable table + sparklines) ·
Market Pricing (your price vs low/median/high, badges, refresh, manual drawer) ·
Forecast & Stock Planner (chart + table with confidence + recommended order qty, CSV export).
Locked upsell state; nav item; dashboard teaser chip.

## 4. Shared engine accuracy fixes (no surface change)
- Partial-month growth bug: compare same-day-count periods (current "down 44%" compares a
  partial latest month vs a full prior month).
- Net credit_notes out of sales momentum/top-product figures.
- Cache: stale-while-revalidate.
- Mixed-UOM qty display guard.

## 5. GST + PAN validation
- Party Master ALREADY validates (frontend `party-master.component.ts:20-24` format+checksum+state;
  backend `party.service.ts validateParty()` PAN format + PAN⊆GSTIN[2:12], enforced on save).
  Step 1: Playwright-verify, fix anything broken.
- Extend to gaps: shared `gst-validation.ts` frontend util + reuse backend validateParty in
  customer/supplier services; wire into portal Customers form, tally quick-create, party-picker
  create, supplier forms; soft warn on invoice Bill-To GSTIN.
- PAN 4th-char entity hint (P/C/F/…) helper text; GSTN portal fetch already exists (gstin-lookup).

## 6. Build order
1. Validation extension + engine accuracy fixes (~½d)
2. Premium flag + module scaffold + Product Performance + page shell w/ lock (~1d)
3. Forecast + Stock Planner + backtest (~1–1½d)
4. Market Pricing: SearXNG container + regex extraction + manual entry (~1–1½d)
5. Deploy (incl. searxng service in compose) + super-admin toggle + Playwright verify (~½d)

## 7. Caveats
- FREE/OSS ONLY: no Anthropic/paid APIs anywhere in this module. Stack additions:
  SearXNG (AGPL, docker) as an internal-only service; optional Ollama (MIT) if the host
  can run it. Existing insights' Claude hook stays dormant unless a key is ever provided.
- Web-scraped market prices are best-effort: marketplaces block bots, so coverage is
  partial; confidence is surfaced per product and manual entry always wins over scraped.
- Short-history products get low-confidence naive forecasts (labeled).
- Cross-tenant benchmark deferred (too few tenants).
- One-off order spikes damped via median-based outlier handling.
- SearXNG must be bound to the internal docker network only (never exposed publicly).
