import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { FeatureService } from '../../../core/services/feature.service';

type TabId = 'overview' | 'monthplan' | 'performance' | 'pricing' | 'forecast';
type SortDir = 'asc' | 'desc';
type FcView = 'forecast' | 'plan';
type PerfFilter = 'all' | 'A' | 'B' | 'C' | 'fast-moving' | 'rising' | 'declining' | 'stockout-risk' | 'overstock' | 'dead-stock';
type MpFilter = 'all' | 'needs-stock' | 'sold-before' | 'has-market';
type BulkStatus = 'pending' | 'running' | 'ok' | 'no-data' | 'error';

interface OverviewData {
  asOf?: string;
  topPerformer?: { name: string; score: number; revenue90: number } | null;
  topRiser?: { name: string; momentumPct: number } | null;
  forecastWinner?: { name: string; totalRevenue: number; confidence: string } | null;
  stockoutRiskCount?: number;
  deadStockCount?: number;
  pricedCount?: number;
  underpricedCount?: number;
  overpricedCount?: number;
  searchAvailable?: boolean;
}

type RecoType = 'buy' | 'reorder-soon' | 'price-up' | 'price-down' | 'promote-dead' | 'switch-supplier';
/** Chip groups over recommendation types: Buy={buy,reorder-soon}, Pricing={price-up,price-down}, Dead stock={promote-dead}, Supplier={switch-supplier}. */
type RecoFilter = 'all' | 'buy' | 'pricing' | 'dead' | 'supplier';

interface Recommendation {
  type: RecoType; productId: string; productName: string;
  title: string; reason: string;
  confidence: 'high' | 'medium' | 'low';
  impact: number | null; impactLabel?: string | null;
  action?: Record<string, unknown>;
  risks?: string[];
}
interface RecoData { generatedAt?: string; recommendations?: Recommendation[]; }

interface PerfProduct {
  productId: string; name: string; uom?: string;
  revenue90?: number; qty90?: number; orders90?: number; velocityPerWeek?: number;
  momentumPct?: number | null; marginPct?: number | null;
  abcClass?: 'A' | 'B' | 'C'; stock?: number; daysOfCover?: number | null;
  score?: number; flags?: string[];
  healthClass?: 'fast-moving' | 'slow-moving' | 'dead-stock' | 'inactive';
  marginClass?: 'high' | 'low' | null;
}
interface PerfData { asOf?: string; products?: PerfProduct[]; }

interface ForecastMonth { ym: string; qty: number; }
interface ForecastProduct {
  productId: string; name: string; uom?: string;
  months?: ForecastMonth[]; totalQty?: number; totalRevenue?: number;
  confidence?: 'high' | 'medium' | 'low'; mapePct?: number | null;
  model?: string; seasonalPeakMonth?: string | null;
}
interface ForecastData { generatedAt?: string; asOf?: string; horizonMonths?: number; products?: ForecastProduct[]; }

interface PlanProduct {
  productId: string; name: string; uom?: string;
  stock?: number; forecastQty?: number; safetyStock?: number; recommendedOrderQty?: number;
  overstock?: boolean | number; confidence?: string;
  avgDailySales?: number; reorderPoint?: number; eoq?: number | null;
  demand7?: number; demand30?: number; demand90?: number; demand365?: number;
  runsOutInDays?: number | null;
}
interface PlanData {
  assumptions?: {
    leadTimeDays?: number; serviceLevelPct?: number; horizonMonths?: number;
    orderCost?: number; holdingRatePct?: number;
  };
  products?: PlanProduct[];
}

interface MarketRow {
  productId: string; name: string; yourPrice?: number;
  marketLow?: number | null; marketMedian?: number | null; marketAvg?: number | null; marketHigh?: number | null;
  source?: string | null; confidence?: string | null; fetchedAt?: string | null;
  sourceNote?: string | null; position?: 'under' | 'competitive' | 'over' | null;
  monthlyVolumeValue?: number; points?: number | null;
}
interface MarketData { searchAvailable?: boolean; llmEnabled?: boolean; products?: MarketRow[]; }

/** Server-side bulk market-price refresh progress (refresh-all / refresh-status). */
interface BulkRefreshState {
  running?: boolean; total?: number; done?: number; ok?: number; noData?: number;
  statuses?: Record<string, BulkStatus>;
}

interface MpHistory { year?: number; ym?: string; qtySold?: number; revenue?: number; estProfit?: number | null; }
interface MpProduct {
  productId: string; name: string; uom?: string;
  /** [0] = same month two years ago, [1] = same month last year. */
  history?: MpHistory[];
  currentStock?: number; recommendedStock?: number; stockBasis?: string;
  shortfall?: number; yourPrice?: number | null; marketMedian?: number | null;
  marketSource?: string | null; recommendedPrice?: number | null; priceBasis?: string;
  minPrice?: number | null; premiumPrice?: number | null;
  estProfitPotential?: number | null;
}
interface MonthPlanData {
  month?: string; monthName?: string; asOf?: string; growthFactor?: number; profitNote?: string;
  products?: MpProduct[];
}

/**
 * AI Insights Pro — the premium business-intelligence cockpit for the ERP.
 * Five tabs backed by /erp/intel/*:
 *   • Overview — the AI Recommendations action feed (buy / pricing / dead-stock /
 *     supplier suggestions with impact & confidence, type-filter chips), then the
 *     headline winners (top performer / rising star / forecast winner)
 *     plus clickable risk counters that jump to the relevant tab.
 *   • Month Planner — "what should I stock next month": per-product history for
 *     the same calendar month in the last two years, growth-adjusted recommended
 *     stock/price, shortfall vs current stock, CSV export.
 *   • Product Performance — sortable 0-100 scored table (ABC class, momentum,
 *     margin, days of cover, health flags) with quick filter chips.
 *   • Market Pricing — your price vs public-web market low/median/high, with
 *     manual entry, per-product web refresh and a bulk "Sync all prices" run
 *     (server-side queue polled every 2.5s with per-row progress).
 *   • Forecast & Stock Planner — 4-month demand forecast with mini bar charts,
 *     and a reorder planner (safety stock + recommended order qty, CSV export).
 * Feature-gated by `premiumInsights`; shows an upgrade lock screen (and calls
 * no APIs) when the tenant's plan doesn't include it.
 */
@Component({
  selector: 'wa-erp-intel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (locked()) {
      <!-- ══ LOCKED — upgrade teaser ══════════════════════════════════ -->
      <div class="min-h-[80vh] bg-gray-50 flex items-center justify-center px-4 py-10">
        <div class="max-w-md w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-lg mb-5">
            <i class="pi pi-sparkles" style="font-size:1.6rem"></i>
          </div>
          <div class="flex items-center justify-center gap-2 mb-1">
            <h1 class="text-xl font-bold text-gray-900">AI Insights Pro</h1>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white uppercase tracking-wide">Pro</span>
          </div>
          <p class="text-[13px] text-gray-400 mb-6">Premium business intelligence for your catalogue — know what to stock, what to push and what to charge.</p>
          <ul class="text-left space-y-2.5 mb-7">
            @for (b of lockBullets; track b) {
              <li class="flex items-center gap-2.5 text-[13.5px] text-gray-700">
                <i class="pi pi-check-circle text-indigo-600" style="font-size:.9rem"></i>
                <span>{{ b }}</span>
              </li>
            }
          </ul>
          <button (click)="goUpgrade()"
            class="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold py-3 shadow-sm hover:opacity-90 transition-opacity">
            <i class="pi pi-lock-open mr-1.5" style="font-size:.8rem"></i> Upgrade to unlock
          </button>
        </div>
      </div>
    } @else {
      <div class="min-h-screen bg-gray-50 text-gray-900">

        <!-- ── HEADER ─────────────────────────────────────────────── -->
        <header class="bg-white border-b border-gray-100">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <i class="pi pi-sparkles" style="font-size:1.1rem"></i>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h1 class="text-lg font-bold leading-tight">AI Insights Pro</h1>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white uppercase tracking-wide shadow-sm">Pro</span>
              </div>
              <p class="text-[12px] text-gray-400 leading-tight">{{ asOf() ? 'As of ' + fmtDate(asOf()) : 'Performance, pricing, forecast & stock planning' }}</p>
            </div>
            <button (click)="refresh()" [disabled]="anyLoading()"
              class="text-gray-400 hover:text-indigo-600 disabled:opacity-40 transition-colors" title="Refresh">
              <i class="pi" [class.pi-refresh]="!anyLoading()" [class.pi-spin]="anyLoading()" [class.pi-spinner]="anyLoading()"></i>
            </button>
          </div>
          <div class="max-w-6xl mx-auto px-2 sm:px-4 flex gap-1 overflow-x-auto no-scrollbar">
            @for (t of tabList; track t.id) {
              <button (click)="go(t.id)"
                class="px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-colors"
                [class.border-indigo-600]="tab() === t.id"
                [class.text-indigo-700]="tab() === t.id"
                [class.border-transparent]="tab() !== t.id"
                [class.text-gray-400]="tab() !== t.id">
                <i class="pi {{ t.icon }} mr-1" style="font-size:.7rem"></i>{{ t.label }}</button>
            }
          </div>
        </header>

        <main class="max-w-6xl mx-auto px-4 sm:px-6 py-6">

          <!-- ══ OVERVIEW ═════════════════════════════════════════════ -->
          @if (tab() === 'overview') {
            @if (ovError()) {
              <div class="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 flex items-center justify-between gap-3">
                <span>{{ ovError() }}</span>
                <button (click)="loadOverview()" class="font-semibold underline shrink-0">Retry</button>
              </div>
            }

            <!-- AI Recommendations feed — the star of the page -->
            <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-5">
              <div class="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
                <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <i class="pi pi-bolt" style="font-size:.7rem"></i>
                </div>
                <h2 class="text-sm font-bold text-gray-700">AI Recommendations</h2>
                @if (recos()?.generatedAt) { <span class="text-[11px] text-gray-400">Generated {{ fmtDate(recos()!.generatedAt) }}</span> }
                @if (recoLoading()) { <span class="ml-auto text-[12px] text-gray-400">Loading…</span> }
              </div>
              @if (recoError()) {
                <div class="px-4 py-3 bg-red-50 text-red-700 text-sm flex items-center justify-between gap-3">
                  <span>{{ recoError() }}</span>
                  <button (click)="loadRecos()" class="font-semibold underline shrink-0">Retry</button>
                </div>
              } @else if (recoLoading() && !recos()) {
                <div class="animate-pulse p-4 space-y-3">
                  <div class="h-12 bg-gray-100 rounded-xl"></div>
                  <div class="h-12 bg-gray-100 rounded-xl"></div>
                  <div class="h-12 bg-gray-100 rounded-xl"></div>
                </div>
              } @else if (recos()) {
                <!-- type filter chips -->
                <div class="px-4 py-2.5 border-b border-gray-100 flex flex-wrap gap-1.5">
                  @for (c of recoChips(); track c.id) {
                    <button (click)="setRecoFilter(c.id)"
                      class="px-2.5 py-1 rounded-full text-[12px] font-semibold transition-colors whitespace-nowrap"
                      [class.bg-indigo-600]="recoFilter() === c.id" [class.text-white]="recoFilter() === c.id"
                      [class.bg-gray-100]="recoFilter() !== c.id" [class.text-gray-500]="recoFilter() !== c.id">
                      {{ c.label }} ({{ c.count }})</button>
                  }
                </div>
                @if (!recoShown().length) {
                  <p class="text-sm text-gray-400 px-4 py-8 text-center">No actions needed right now — you're on top of things ✅</p>
                } @else {
                  <div class="divide-y divide-gray-50">
                    @for (r of recoShown(); track $index) {
                      <div class="px-4 py-3 flex items-start gap-3 hover:bg-gray-50/60 transition-colors">
                        <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" [class]="recoIconCls(r.type)">
                          <i class="pi {{ recoIcon(r.type) }}" style="font-size:.8rem"></i>
                        </div>
                        <div class="min-w-0 flex-1">
                          <p class="text-[13.5px] font-bold text-gray-900">{{ r.title }}</p>
                          <p class="text-[13px] text-slate-500">{{ r.reason }}</p>
                          @if (r.risks?.length) {
                            <p class="text-[11px] text-slate-400 mt-0.5 flex items-start gap-1">
                              <i class="pi pi-exclamation-triangle text-amber-500 mt-px" style="font-size:.65rem"></i>
                              <span>{{ r.risks!.join(' · ') }}</span>
                            </p>
                          }
                        </div>
                        <div class="text-right shrink-0">
                          @if (r.impact != null) {
                            <p class="text-[14px] font-bold text-gray-900 tabular-nums leading-tight">₹{{ inr(r.impact) }}</p>
                            @if (r.impactLabel) { <p class="text-[10px] text-gray-400">{{ r.impactLabel }}</p> }
                          } @else {
                            <p class="text-[14px] font-bold text-gray-300 leading-tight">—</p>
                          }
                          <span class="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize" [class]="confCls(r.confidence)">{{ r.confidence }}</span>
                        </div>
                      </div>
                    }
                  </div>
                  @if (recoFiltered().length > 10) {
                    <button (click)="recoExpanded.set(!recoExpanded())"
                      class="w-full py-2.5 text-[12.5px] font-semibold text-indigo-600 hover:bg-indigo-50/50 border-t border-gray-50 transition-colors">
                      {{ recoExpanded() ? 'Show less' : 'Show all ' + recoFiltered().length }}
                    </button>
                  }
                }
              }
            </div>

            @if (ovLoading() && !overview()) {
              <div class="animate-pulse grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                <div class="h-28 bg-white rounded-2xl border border-gray-100"></div>
                <div class="h-28 bg-white rounded-2xl border border-gray-100"></div>
                <div class="h-28 bg-white rounded-2xl border border-gray-100"></div>
              </div>
              <div class="animate-pulse grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="h-24 bg-white rounded-2xl border border-gray-100"></div>
                <div class="h-24 bg-white rounded-2xl border border-gray-100"></div>
                <div class="h-24 bg-white rounded-2xl border border-gray-100"></div>
                <div class="h-24 bg-white rounded-2xl border border-gray-100"></div>
              </div>
            } @else if (overview()) {
              <!-- headline cards -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                <div class="bg-white rounded-2xl border border-gray-100 p-5">
                  <div class="flex items-center gap-2 mb-2.5">
                    <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-sm"><i class="pi pi-star-fill" style="font-size:.8rem"></i></div>
                    <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Top performer</p>
                  </div>
                  @if (overview()?.topPerformer; as tp) {
                    <p class="text-[15px] font-bold text-gray-900 truncate" [title]="tp.name">{{ tp.name }}</p>
                    <div class="flex items-center gap-2 mt-1">
                      <span class="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 tabular-nums">Score {{ tp.score }}</span>
                      <span class="text-[12px] text-gray-400 tabular-nums">₹{{ inr(tp.revenue90) }} · 90d</span>
                    </div>
                  } @else {
                    <p class="text-[15px] font-bold text-gray-300">—</p>
                    <p class="text-[11px] text-gray-400">Not enough sales history yet</p>
                  }
                </div>
                <div class="bg-white rounded-2xl border border-gray-100 p-5">
                  <div class="flex items-center gap-2 mb-2.5">
                    <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><i class="pi pi-arrow-up-right" style="font-size:.8rem"></i></div>
                    <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Rising star</p>
                  </div>
                  @if (overview()?.topRiser; as tr) {
                    <p class="text-[15px] font-bold text-gray-900 truncate" [title]="tr.name">{{ tr.name }}</p>
                    <p class="text-[12px] font-semibold text-emerald-600 mt-1 tabular-nums">
                      <i class="pi pi-arrow-up" style="font-size:.6rem"></i> +{{ inrQty(tr.momentumPct) }}% momentum
                    </p>
                  } @else {
                    <p class="text-[15px] font-bold text-gray-300">—</p>
                    <p class="text-[11px] text-gray-400">No breakout products right now</p>
                  }
                </div>
                <div class="bg-white rounded-2xl border border-gray-100 p-5">
                  <div class="flex items-center gap-2 mb-2.5">
                    <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><i class="pi pi-chart-line" style="font-size:.8rem"></i></div>
                    <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Forecast winner</p>
                  </div>
                  @if (overview()?.forecastWinner; as fw) {
                    <p class="text-[15px] font-bold text-gray-900 truncate" [title]="fw.name">{{ fw.name }}</p>
                    <div class="flex items-center gap-2 mt-1">
                      <span class="text-[12px] text-gray-500 tabular-nums">₹{{ inr(fw.totalRevenue) }} next 4 mo</span>
                      <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize" [class]="confCls(fw.confidence)">{{ fw.confidence || '—' }}</span>
                    </div>
                  } @else {
                    <p class="text-[15px] font-bold text-gray-300">—</p>
                    <p class="text-[11px] text-gray-400">Forecast needs more order history</p>
                  }
                </div>
              </div>

              <!-- count cards → jump to tabs -->
              <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <button (click)="go('performance')" class="text-left bg-white rounded-2xl border border-gray-100 p-4 hover:border-amber-200 hover:shadow-sm transition-all">
                  <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Stockout risks</p>
                  <p class="text-2xl font-bold tabular-nums text-amber-600">{{ overview()?.stockoutRiskCount ?? 0 }}</p>
                  <p class="text-[11px] text-gray-400 mt-0.5">May run out soon <i class="pi pi-arrow-right" style="font-size:.55rem"></i></p>
                </button>
                <button (click)="go('performance')" class="text-left bg-white rounded-2xl border border-gray-100 p-4 hover:border-indigo-200 hover:shadow-sm transition-all">
                  <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Dead stock</p>
                  <p class="text-2xl font-bold tabular-nums text-gray-700">{{ overview()?.deadStockCount ?? 0 }}</p>
                  <p class="text-[11px] text-gray-400 mt-0.5">No sales, money parked <i class="pi pi-arrow-right" style="font-size:.55rem"></i></p>
                </button>
                <button (click)="go('pricing')" class="text-left bg-white rounded-2xl border border-gray-100 p-4 hover:border-emerald-200 hover:shadow-sm transition-all">
                  <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Underpriced</p>
                  <p class="text-2xl font-bold tabular-nums text-emerald-600">{{ overview()?.underpricedCount ?? 0 }}</p>
                  <p class="text-[11px] text-gray-400 mt-0.5">of {{ overview()?.pricedCount ?? 0 }} priced <i class="pi pi-arrow-right" style="font-size:.55rem"></i></p>
                </button>
                <button (click)="go('pricing')" class="text-left bg-white rounded-2xl border border-gray-100 p-4 hover:border-amber-200 hover:shadow-sm transition-all">
                  <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Overpriced</p>
                  <p class="text-2xl font-bold tabular-nums text-amber-600">{{ overview()?.overpricedCount ?? 0 }}</p>
                  <p class="text-[11px] text-gray-400 mt-0.5">of {{ overview()?.pricedCount ?? 0 }} priced <i class="pi pi-arrow-right" style="font-size:.55rem"></i></p>
                </button>
              </div>
            } @else if (!ovLoading()) {
              <div class="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 text-sm">Nothing to show yet — insights appear once you have some sales.</div>
            }
          }

          <!-- ══ MONTH PLANNER ════════════════════════════════════════ -->
          @if (tab() === 'monthplan') {
            @if (mpError()) {
              <div class="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 flex items-center justify-between gap-3">
                <span>{{ mpError() }}</span>
                <button (click)="loadMonthPlan()" class="font-semibold underline shrink-0">Retry</button>
              </div>
            }
            <!-- month selector + summary strip -->
            <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex flex-wrap items-center gap-3">
              <select [ngModel]="mpMonth()" (ngModelChange)="onMpMonth($event)"
                class="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold bg-white">
                @for (m of mpMonths; track m.value) { <option [value]="m.value">{{ m.label }}</option> }
              </select>
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-semibold text-gray-700">
                  Planning for {{ mpMonthName() }} · based on {{ mpMonthName() }} {{ mpYear() - 2 }} + {{ mpYear() - 1 }} sales
                  @if (monthPlan()?.growthFactor) { <span>· growth ×{{ inrQty(monthPlan()!.growthFactor) }}</span> }
                </p>
                @if (monthPlan()?.profitNote) { <p class="text-[11px] text-gray-400">{{ monthPlan()!.profitNote }}</p> }
              </div>
              <button (click)="mpExportCsv()" [disabled]="!mpFiltered().length"
                class="ml-auto rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold px-4 py-2 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-40 transition-colors">
                <i class="pi pi-download mr-1.5" style="font-size:.75rem"></i>Export CSV
              </button>
            </div>
            <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <!-- filter chips + search -->
              <div class="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-1.5">
                @for (c of mpChips; track c.id) {
                  <button (click)="mpFilter.set(c.id)"
                    class="px-2.5 py-1 rounded-full text-[12px] font-semibold transition-colors whitespace-nowrap"
                    [class.bg-indigo-600]="mpFilter() === c.id" [class.text-white]="mpFilter() === c.id"
                    [class.bg-gray-100]="mpFilter() !== c.id" [class.text-gray-500]="mpFilter() !== c.id">{{ c.label }}</button>
                }
                <input [ngModel]="mpQ()" (ngModelChange)="mpQ.set($event)" placeholder="Search products…"
                  class="ml-auto rounded-xl border border-gray-200 px-3 py-1.5 text-sm w-full sm:w-56" />
                @if (mpLoading()) { <span class="text-[12px] text-gray-400">Loading…</span> }
              </div>
              @if (mpLoading() && !monthPlan()) {
                <div class="animate-pulse p-4 space-y-3">
                  <div class="h-10 bg-gray-100 rounded-xl"></div>
                  <div class="h-10 bg-gray-100 rounded-xl"></div>
                  <div class="h-10 bg-gray-100 rounded-xl"></div>
                  <div class="h-10 bg-gray-100 rounded-xl"></div>
                </div>
              } @else if (!mpShown().length) {
                <p class="text-sm text-gray-400 px-4 py-10 text-center">
                  {{ mpQ() || mpFilter() !== 'all' ? 'No products match your filters.' : 'Nothing to plan for this month yet — the planner needs some sales history.' }}
                </p>
              } @else {
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-[11px] font-semibold text-gray-400 uppercase border-b border-gray-100">
                        @for (c of mpCols(); track c.key) {
                          <th class="px-4 py-2.5 cursor-pointer select-none whitespace-nowrap hover:text-indigo-600 align-top"
                            [class.text-right]="c.right" (click)="mpSortBy(c.key)">
                            {{ c.label }}
                            <i class="pi" style="font-size:.55rem"
                              [class.pi-sort-alt]="mpSortKey() !== c.key"
                              [class.pi-sort-amount-down]="mpSortKey() === c.key && mpSortDir() === 'desc'"
                              [class.pi-sort-amount-up-alt]="mpSortKey() === c.key && mpSortDir() === 'asc'"
                              [class.text-indigo-600]="mpSortKey() === c.key"></i>
                            @if (c.sub) { <span class="block text-[9px] font-normal normal-case text-gray-300">{{ c.sub }}</span> }
                          </th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (p of mpShown(); track p.productId) {
                        <tr class="border-b border-gray-50 hover:bg-gray-50/60 align-top">
                          <td class="px-4 py-2.5 font-semibold max-w-[13rem]">
                            <div class="truncate" [title]="p.name">{{ p.name }}</div>
                            @if (p.uom) { <div class="text-[10px] text-gray-400 font-normal">{{ p.uom }}</div> }
                          </td>
                          <td class="px-4 py-2.5 text-right tabular-nums">
                            @if (hist(p, 0); as h) {
                              <div class="font-bold">{{ inrQty(h.qtySold) }}</div>
                              <div class="text-[11px] text-gray-400">{{ h.estProfit != null ? '₹' + inr(h.estProfit) + ' profit' : '—' }}</div>
                            } @else { <span class="text-gray-300">—</span> }
                          </td>
                          <td class="px-4 py-2.5 text-right tabular-nums">
                            @if (hist(p, 1); as h) {
                              <div class="font-bold">{{ inrQty(h.qtySold) }}</div>
                              <div class="text-[11px] text-gray-400">{{ h.estProfit != null ? '₹' + inr(h.estProfit) + ' profit' : '—' }}</div>
                            } @else { <span class="text-gray-300">—</span> }
                          </td>
                          <td class="px-4 py-2.5 text-right tabular-nums">{{ inrQty(p.currentStock) }}</td>
                          <td class="px-4 py-2.5 text-right tabular-nums">
                            <div class="font-bold text-indigo-700">{{ inrQty(p.recommendedStock) }}</div>
                            @if (p.stockBasis) { <div class="text-[10px] text-gray-400 whitespace-normal max-w-[9rem] ml-auto">{{ p.stockBasis }}</div> }
                          </td>
                          <td class="px-4 py-2.5 text-right">
                            @if ((p.shortfall ?? 0) > 0) {
                              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 tabular-nums whitespace-nowrap">{{ inrQty(p.shortfall) }} short</span>
                            } @else { <span class="text-[11px] text-gray-400">OK</span> }
                          </td>
                          <td class="px-4 py-2.5 text-right tabular-nums">{{ p.yourPrice != null ? '₹' + inr(p.yourPrice) : '—' }}</td>
                          <td class="px-4 py-2.5 text-right tabular-nums" [title]="p.marketSource || ''">{{ p.marketMedian != null ? '₹' + inr(p.marketMedian) : '—' }}</td>
                          <td class="px-4 py-2.5 text-right tabular-nums">
                            @if (p.recommendedPrice != null) {
                              <div class="font-bold">₹{{ inr(p.recommendedPrice) }}</div>
                              @if (priceRange(p); as range) { <div class="text-[10px] text-gray-400 whitespace-nowrap">{{ range }}</div> }
                              @if (p.priceBasis) { <div class="text-[10px] text-gray-400 whitespace-normal max-w-[9rem] ml-auto">{{ p.priceBasis }}</div> }
                            } @else { <span class="text-gray-300">—</span> }
                          </td>
                          <td class="px-4 py-2.5 text-right tabular-nums font-semibold">{{ p.estProfitPotential != null ? '₹' + inr(p.estProfitPotential) : '—' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <p class="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-50">Showing {{ mpShown().length }} of {{ mpFiltered().length }} products</p>
              }
            </div>
          }

          <!-- ══ PRODUCT PERFORMANCE ══════════════════════════════════ -->
          @if (tab() === 'performance') {
            @if (perfError()) {
              <div class="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 flex items-center justify-between gap-3">
                <span>{{ perfError() }}</span>
                <button (click)="loadPerf()" class="font-semibold underline shrink-0">Retry</button>
              </div>
            }
            <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div class="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
                <h2 class="text-sm font-bold text-gray-700">Product performance</h2>
                <input [ngModel]="perfQ()" (ngModelChange)="perfQ.set($event)" placeholder="Search products…"
                  class="ml-auto rounded-xl border border-gray-200 px-3 py-1.5 text-sm w-full sm:w-64" />
                @if (perfLoading()) { <span class="text-[12px] text-gray-400">Loading…</span> }
              </div>
              <!-- quick filter chips -->
              <div class="px-4 py-2.5 border-b border-gray-100 flex flex-wrap gap-1.5">
                @for (c of perfChips(); track c.id) {
                  <button (click)="perfFilter.set(c.id)"
                    class="px-2.5 py-1 rounded-full text-[12px] font-semibold transition-colors whitespace-nowrap"
                    [class.bg-indigo-600]="perfFilter() === c.id" [class.text-white]="perfFilter() === c.id"
                    [class.bg-gray-100]="perfFilter() !== c.id" [class.text-gray-500]="perfFilter() !== c.id">
                    {{ c.label }} ({{ c.count }})</button>
                }
              </div>
              @if (perfLoading() && !perf()) {
                <div class="animate-pulse p-4 space-y-3">
                  <div class="h-8 bg-gray-100 rounded-xl"></div>
                  <div class="h-8 bg-gray-100 rounded-xl"></div>
                  <div class="h-8 bg-gray-100 rounded-xl"></div>
                  <div class="h-8 bg-gray-100 rounded-xl"></div>
                </div>
              } @else if (!perfShown().length) {
                <p class="text-sm text-gray-400 px-4 py-10 text-center">{{ perfQ() || perfFilter() !== 'all' ? 'No products match your filters.' : 'No products with sales history yet.' }}</p>
              } @else {
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-[11px] font-semibold text-gray-400 uppercase border-b border-gray-100">
                        @for (c of perfCols; track c.key) {
                          <th class="px-4 py-2.5 cursor-pointer select-none whitespace-nowrap hover:text-indigo-600"
                            [class.text-right]="c.right" (click)="sortBy(c.key)">
                            {{ c.label }}
                            <i class="pi" style="font-size:.55rem"
                              [class.pi-sort-alt]="perfSortKey() !== c.key"
                              [class.pi-sort-amount-down]="perfSortKey() === c.key && perfSortDir() === 'desc'"
                              [class.pi-sort-amount-up-alt]="perfSortKey() === c.key && perfSortDir() === 'asc'"
                              [class.text-indigo-600]="perfSortKey() === c.key"></i>
                          </th>
                        }
                        <th class="px-4 py-2.5 whitespace-nowrap">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (p of perfShown(); track p.productId) {
                        <tr class="border-b border-gray-50 hover:bg-gray-50/60 align-top">
                          <td class="px-4 py-2.5 font-semibold max-w-[14rem]">
                            <div class="truncate" [title]="p.name">{{ p.name }}</div>
                          </td>
                          <td class="px-4 py-2.5">
                            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full" [class]="abcCls(p.abcClass)">{{ p.abcClass || '—' }}</span>
                          </td>
                          <td class="px-4 py-2.5 whitespace-nowrap">
                            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full" [class]="healthCls(p.healthClass)">{{ healthLabel(p.healthClass) }}</span>
                            @if (p.marginClass === 'high') {
                              <span class="ml-1 text-[9px] font-bold px-1 py-0.5 rounded-full bg-emerald-100 text-emerald-700" title="High margin">HM</span>
                            } @else if (p.marginClass === 'low') {
                              <span class="ml-1 text-[9px] font-bold px-1 py-0.5 rounded-full bg-rose-100 text-rose-700" title="Low margin">LM</span>
                            }
                          </td>
                          <td class="px-4 py-2.5 min-w-[7rem]">
                            <div class="flex items-center gap-2">
                              <span class="text-[12px] font-bold tabular-nums w-7">{{ p.score ?? 0 }}</span>
                              <div class="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden min-w-[3rem]">
                                <div class="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" [style.width.%]="clampPct(p.score)"></div>
                              </div>
                            </div>
                          </td>
                          <td class="px-4 py-2.5 text-right tabular-nums font-semibold">₹{{ inr(p.revenue90) }}</td>
                          <td class="px-4 py-2.5 text-right tabular-nums">{{ inrQty(p.qty90) }} <span class="text-[10px] text-gray-400">{{ p.uom || '' }}</span></td>
                          <td class="px-4 py-2.5 text-right tabular-nums">{{ inrQty(p.velocityPerWeek) }}</td>
                          <td class="px-4 py-2.5 text-right tabular-nums">
                            @if (p.momentumPct != null) {
                              <span class="font-semibold" [class.text-emerald-600]="p.momentumPct > 0" [class.text-red-500]="p.momentumPct < 0" [class.text-gray-400]="p.momentumPct === 0">
                                <i class="pi" [class.pi-arrow-up]="p.momentumPct > 0" [class.pi-arrow-down]="p.momentumPct < 0" style="font-size:.55rem"></i>
                                {{ absVal(p.momentumPct) }}%
                              </span>
                            } @else { <span class="text-gray-300">—</span> }
                          </td>
                          <td class="px-4 py-2.5 text-right tabular-nums">{{ p.marginPct != null ? inrQty(p.marginPct) + '%' : '—' }}</td>
                          <td class="px-4 py-2.5 text-right tabular-nums">{{ inrQty(p.stock) }}</td>
                          <td class="px-4 py-2.5 text-right tabular-nums"
                            [class.text-red-600]="p.daysOfCover != null && p.daysOfCover < 14"
                            [class.font-semibold]="p.daysOfCover != null && (p.daysOfCover < 14 || p.daysOfCover > 180)"
                            [class.text-amber-600]="p.daysOfCover != null && p.daysOfCover > 180">
                            {{ p.daysOfCover != null ? inr(p.daysOfCover) : '—' }}
                          </td>
                          <td class="px-4 py-2.5">
                            <div class="flex flex-wrap gap-1 max-w-[12rem]">
                              @for (f of (p.flags || []); track f) {
                                <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" [class]="flagCls(f)">{{ flagLabel(f) }}</span>
                              }
                            </div>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <p class="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-50">Showing {{ perfShown().length }} of {{ perfFiltered().length }} products</p>
              }
            </div>
          }

          <!-- ══ MARKET PRICING ═══════════════════════════════════════ -->
          @if (tab() === 'pricing') {
            @if (marketError()) {
              <div class="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 flex items-center justify-between gap-3">
                <span>{{ marketError() }}</span>
                <button (click)="loadMarket()" class="font-semibold underline shrink-0">Retry</button>
              </div>
            }
            @if (market() && market()!.searchAvailable === false) {
              <div class="mb-4 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-800 text-sm px-4 py-2.5 flex items-center gap-2">
                <i class="pi pi-info-circle" style="font-size:.85rem"></i>
                Web price search isn't configured — enter market prices manually.
              </div>
            }
            @if (bulkBanner()) {
              <div class="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-2.5 flex items-center justify-between gap-3">
                <span><i class="pi pi-check-circle mr-1.5" style="font-size:.85rem"></i>{{ bulkBanner() }}</span>
                <button (click)="bulkBanner.set('')" class="text-emerald-700 hover:text-emerald-900 shrink-0" title="Dismiss">
                  <i class="pi pi-times" style="font-size:.75rem"></i>
                </button>
              </div>
            }
            <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div class="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
                <h2 class="text-sm font-bold text-gray-700">Your prices vs the market</h2>
                @if (market()?.llmEnabled) {
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 whitespace-nowrap"
                    title="An AI model reads the web results to extract prices">LLM extraction on</span>
                }
                @if (marketLoading()) { <span class="text-[12px] text-gray-400">Loading…</span> }
                @if (market()?.searchAvailable) {
                  <div class="ml-auto flex items-center gap-2">
                    <span class="text-[11px] text-gray-400 hidden sm:inline">skips manually-priced items</span>
                    <button (click)="startBulkRefresh()" [disabled]="bulkRunning() || bulkStarting()"
                      class="rounded-xl bg-indigo-600 text-white text-[12.5px] font-semibold px-3.5 py-1.5 hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                      @if (bulkRunning() || bulkStarting()) {
                        <i class="pi pi-spin pi-spinner mr-1" style="font-size:.7rem"></i>Syncing… {{ bulk()?.done || 0 }}/{{ bulk()?.total || 0 }}
                      } @else {
                        <i class="pi pi-sync mr-1" style="font-size:.7rem"></i>Sync all prices
                      }
                    </button>
                  </div>
                }
              </div>
              @if (bulkRunning()) {
                <div class="h-1 w-full bg-indigo-100 overflow-hidden">
                  <div class="h-full bg-indigo-600 transition-all duration-500" [style.width.%]="bulkPct()"></div>
                </div>
              }
              @if (marketLoading() && !market()) {
                <div class="animate-pulse p-4 space-y-3">
                  <div class="h-8 bg-gray-100 rounded-xl"></div>
                  <div class="h-8 bg-gray-100 rounded-xl"></div>
                  <div class="h-8 bg-gray-100 rounded-xl"></div>
                </div>
              } @else if (!marketRows().length) {
                <p class="text-sm text-gray-400 px-4 py-10 text-center">No priced products yet — set selling prices on your products first.</p>
              } @else {
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-[11px] font-semibold text-gray-400 uppercase border-b border-gray-100">
                        @for (c of mkCols; track c.label) {
                          <th class="px-4 py-2.5 whitespace-nowrap" [class.text-right]="c.right"
                            [ngClass]="c.key ? 'cursor-pointer select-none hover:text-indigo-600' : ''"
                            (click)="mkSortBy(c.key)">
                            {{ c.label }}
                            @if (c.key) {
                              <i class="pi" style="font-size:.55rem"
                                [class.pi-sort-alt]="mkSortKey() !== c.key"
                                [class.pi-sort-amount-down]="mkSortKey() === c.key && mkSortDir() === 'desc'"
                                [class.pi-sort-amount-up-alt]="mkSortKey() === c.key && mkSortDir() === 'asc'"
                                [class.text-indigo-600]="mkSortKey() === c.key"></i>
                            }
                          </th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (p of marketRows(); track p.productId) {
                        <tr class="border-b border-gray-50 hover:bg-gray-50/60 align-top"
                          [ngClass]="rowBulk(p.productId) === 'running' ? 'bg-indigo-50/40' : ''">
                          <td class="px-4 py-2.5 max-w-[14rem]">
                            <div class="font-semibold truncate" [title]="p.name">{{ p.name }}</div>
                            @if (p.monthlyVolumeValue) { <div class="text-[11px] text-gray-400 tabular-nums">₹{{ inr(p.monthlyVolumeValue) }}/mo volume</div> }
                          </td>
                          <td class="px-4 py-2.5 text-right tabular-nums font-semibold">₹{{ inr(p.yourPrice) }}</td>
                          <td class="px-4 py-2.5 text-right tabular-nums text-gray-500">{{ p.marketLow != null ? '₹' + inr(p.marketLow) : '—' }}</td>
                          <td class="px-4 py-2.5 text-right tabular-nums">
                            @if (p.marketMedian != null) {
                              <span class="font-semibold">₹{{ inr(p.marketMedian) }}</span>
                            } @else {
                              <span class="text-gray-300">—</span>
                              <button (click)="openPrice(p)" class="ml-1.5 text-[12px] font-semibold text-indigo-600 hover:underline">Add</button>
                            }
                          </td>
                          <td class="px-4 py-2.5 text-right tabular-nums text-gray-500">{{ p.marketAvg != null ? '₹' + inr(p.marketAvg) : '—' }}</td>
                          <td class="px-4 py-2.5 text-right tabular-nums text-gray-500">{{ p.marketHigh != null ? '₹' + inr(p.marketHigh) : '—' }}</td>
                          <td class="px-4 py-2.5">
                            @if (p.position === 'under') {
                              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">Below market</span>
                            } @else if (p.position === 'over') {
                              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">Above market</span>
                            } @else if (p.position === 'competitive') {
                              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">Competitive</span>
                            } @else { <span class="text-gray-300">—</span> }
                          </td>
                          <td class="px-4 py-2.5">
                            @if (p.source === 'manual') {
                              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-600 text-white" [title]="p.sourceNote || ''">manual</span>
                            } @else if (p.source === 'search') {
                              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap" [title]="p.sourceNote || ''">web{{ p.points ? ' · ' + p.points + ' pts' : '' }}</span>
                              @if (p.fetchedAt) { <span class="block text-[10px] text-gray-400 mt-0.5">{{ fmtDate(p.fetchedAt) }}</span> }
                            } @else { <span class="text-gray-300">—</span> }
                            @if (matchTier(p.sourceNote); as tier) {
                              <span class="ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" [class]="tierCls(tier)" [title]="p.sourceNote || ''">{{ tierLabel(tier) }}</span>
                            }
                          </td>
                          <td class="px-4 py-2.5 text-right whitespace-nowrap">
                            @if (rowBulkBusy(p.productId)) {
                              <i class="pi pi-spin pi-spinner text-indigo-500 mr-3" style="font-size:.8rem" title="Queued for price sync"></i>
                            } @else if (market()?.searchAvailable) {
                              <button (click)="refreshRow(p)" [disabled]="refreshingId() !== null || bulkRunning()"
                                class="text-[12px] font-semibold text-indigo-600 hover:underline disabled:opacity-40 mr-3">
                                <i class="pi" style="font-size:.6rem"
                                  [class.pi-refresh]="refreshingId() !== p.productId"
                                  [class.pi-spinner]="refreshingId() === p.productId"
                                  [class.pi-spin]="refreshingId() === p.productId"></i>
                                Refresh
                              </button>
                            }
                            <button (click)="openPrice(p)" class="text-[12px] font-semibold text-gray-500 hover:text-indigo-600 hover:underline">Set price</button>
                            @if (rowMsg()[p.productId]) {
                              <p class="text-[11px] text-amber-600 mt-1 max-w-[12rem] ml-auto whitespace-normal text-right">{{ rowMsg()[p.productId] }}</p>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
              <p class="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-50 flex items-center gap-1.5">
                <i class="pi pi-info-circle" style="font-size:.65rem"></i>
                Market figures are estimates from public web sources or your own entries — verify before repricing.
              </p>
            </div>
          }

          <!-- ══ FORECAST & STOCK PLANNER ═════════════════════════════ -->
          @if (tab() === 'forecast') {
            <div class="flex items-center gap-2 mb-4">
              <button (click)="setFcView('forecast')"
                class="px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-colors"
                [class.bg-indigo-600]="fcView() === 'forecast'" [class.text-white]="fcView() === 'forecast'"
                [class.bg-gray-100]="fcView() !== 'forecast'" [class.text-gray-600]="fcView() !== 'forecast'">Forecast</button>
              <button (click)="setFcView('plan')"
                class="px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-colors"
                [class.bg-indigo-600]="fcView() === 'plan'" [class.text-white]="fcView() === 'plan'"
                [class.bg-gray-100]="fcView() !== 'plan'" [class.text-gray-600]="fcView() !== 'plan'">Stock plan</button>
            </div>

            <!-- ── Forecast ── -->
            @if (fcView() === 'forecast') {
              @if (fcError()) {
                <div class="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 flex items-center justify-between gap-3">
                  <span>{{ fcError() }}</span>
                  <button (click)="loadForecast()" class="font-semibold underline shrink-0">Retry</button>
                </div>
              }
              <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div class="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
                  <h2 class="text-sm font-bold text-gray-700">Demand forecast — next {{ forecast()?.horizonMonths || 4 }} months</h2>
                  <input [ngModel]="fcQ()" (ngModelChange)="fcQ.set($event)" placeholder="Search products…"
                    class="ml-auto rounded-xl border border-gray-200 px-3 py-1.5 text-sm w-full sm:w-64" />
                  @if (fcLoading()) { <span class="text-[12px] text-gray-400">Loading…</span> }
                </div>
                @if (fcLoading() && !forecast()) {
                  <div class="animate-pulse p-4 space-y-3">
                    <div class="h-10 bg-gray-100 rounded-xl"></div>
                    <div class="h-10 bg-gray-100 rounded-xl"></div>
                    <div class="h-10 bg-gray-100 rounded-xl"></div>
                  </div>
                } @else if (!fcShown().length) {
                  <p class="text-sm text-gray-400 px-4 py-10 text-center">{{ fcQ() ? 'No products match your search.' : 'Not enough order history to forecast yet.' }}</p>
                } @else {
                  <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                      <thead>
                        <tr class="text-left text-[11px] font-semibold text-gray-400 uppercase border-b border-gray-100">
                          <th class="px-4 py-2.5">Product</th>
                          <th class="px-4 py-2.5">Next 4 months</th>
                          <th class="px-4 py-2.5 text-right">Total qty</th>
                          <th class="px-4 py-2.5 text-right">Est. revenue</th>
                          <th class="px-4 py-2.5">Confidence</th>
                          <th class="px-4 py-2.5">Peak</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (p of fcShown(); track p.productId) {
                          <tr class="border-b border-gray-50 hover:bg-gray-50/60">
                            <td class="px-4 py-2.5 font-semibold max-w-[14rem]"><div class="truncate" [title]="p.name">{{ p.name }}</div></td>
                            <td class="px-4 py-2.5">
                              <div class="flex items-end gap-1 h-9">
                                @for (m of (p.months || []); track m.ym) {
                                  <div class="w-6 flex flex-col items-center gap-0.5">
                                    <div class="w-3 rounded-t bg-gradient-to-t from-indigo-500 to-purple-400"
                                      [style.height.%]="barPct(p, m)"
                                      [title]="fmtYm(m.ym) + ': ' + inrQty(m.qty) + (p.uom ? ' ' + p.uom : '')"></div>
                                    <span class="text-[8px] text-gray-400 leading-none">{{ fmtYm(m.ym) }}</span>
                                  </div>
                                }
                              </div>
                            </td>
                            <td class="px-4 py-2.5 text-right tabular-nums">{{ inrQty(p.totalQty) }} <span class="text-[10px] text-gray-400">{{ p.uom || '' }}</span></td>
                            <td class="px-4 py-2.5 text-right tabular-nums font-semibold">₹{{ inr(p.totalRevenue) }}</td>
                            <td class="px-4 py-2.5">
                              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize" [class]="confCls(p.confidence)"
                                [title]="p.mapePct != null ? 'backtested error ' + inrQty(p.mapePct) + '%' : ''">{{ p.confidence || '—' }}</span>
                            </td>
                            <td class="px-4 py-2.5 text-[12px] text-gray-500">{{ p.seasonalPeakMonth ? fmtYm(p.seasonalPeakMonth) : '—' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <p class="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-50">Showing {{ fcShown().length }} of {{ fcFiltered().length }} products, by estimated revenue</p>
                }
              </div>
            }

            <!-- ── Stock plan ── -->
            @if (fcView() === 'plan') {
              @if (planError()) {
                <div class="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 flex items-center justify-between gap-3">
                  <span>{{ planError() }}</span>
                  <button (click)="loadStockPlan()" class="font-semibold underline shrink-0">Retry</button>
                </div>
              }
              <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex flex-wrap items-end gap-4">
                <div>
                  <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Lead time (days)</label>
                  <input type="number" min="0" [ngModel]="leadTime()" (ngModelChange)="onLeadTime($event)"
                    class="w-28 rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums" />
                </div>
                @if (stockPlan()?.assumptions; as a) {
                  <p class="text-[12px] text-gray-400 pb-2">
                    Assumes {{ a.leadTimeDays ?? leadTime() }}-day lead time · {{ a.serviceLevelPct ?? 95 }}% service level · {{ a.horizonMonths ?? 4 }}-month horizon@if (a.orderCost != null) { <span> · order cost ₹{{ inr(a.orderCost) }}</span> }@if (a.holdingRatePct != null) { <span> · holding {{ inrQty(a.holdingRatePct) }}%/yr</span> }
                  </p>
                }
                <button (click)="exportCsv()" [disabled]="!stockPlan()?.products?.length"
                  class="ml-auto rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold px-4 py-2 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-40 transition-colors">
                  <i class="pi pi-download mr-1.5" style="font-size:.75rem"></i>Export CSV
                </button>
              </div>
              <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div class="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
                  <h2 class="text-sm font-bold text-gray-700">What to reorder</h2>
                  @if (planLoading()) { <span class="text-[12px] text-gray-400">Loading…</span> }
                  @if ((stockPlan()?.products || []).length) {
                    <div class="ml-auto flex items-center gap-2.5 text-[11px] text-gray-400 tabular-nums whitespace-nowrap">
                      <span class="text-[10px] font-semibold uppercase tracking-wide">Demand next</span>
                      <span>7d <span class="font-bold text-gray-700">{{ inrQty(planDemand().d7) }}</span></span>
                      <span>30d <span class="font-bold text-gray-700">{{ inrQty(planDemand().d30) }}</span></span>
                      <span>90d <span class="font-bold text-gray-700">{{ inrQty(planDemand().d90) }}</span></span>
                      <span>365d <span class="font-bold text-gray-700">{{ inrQty(planDemand().d365) }}</span></span>
                    </div>
                  }
                </div>
                @if (planLoading() && !stockPlan()) {
                  <div class="animate-pulse p-4 space-y-3">
                    <div class="h-8 bg-gray-100 rounded-xl"></div>
                    <div class="h-8 bg-gray-100 rounded-xl"></div>
                    <div class="h-8 bg-gray-100 rounded-xl"></div>
                  </div>
                } @else if (!(stockPlan()?.products || []).length) {
                  <p class="text-sm text-gray-400 px-4 py-10 text-center">Nothing to plan yet — the planner needs forecastable products.</p>
                } @else {
                  <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                      <thead>
                        <tr class="text-left text-[11px] font-semibold text-gray-400 uppercase border-b border-gray-100">
                          <th class="px-4 py-2.5">Product</th>
                          <th class="px-4 py-2.5 text-right">Current stock</th>
                          <th class="px-4 py-2.5 text-right">Runs out</th>
                          <th class="px-4 py-2.5 text-right">ADS/day</th>
                          <th class="px-4 py-2.5 text-right">Forecast demand (4 mo)</th>
                          <th class="px-4 py-2.5 text-right">Demand 365d</th>
                          <th class="px-4 py-2.5 text-right">Safety stock</th>
                          <th class="px-4 py-2.5 text-right">Reorder at</th>
                          <th class="px-4 py-2.5 text-right">EOQ</th>
                          <th class="px-4 py-2.5 text-right">Recommended order</th>
                          <th class="px-4 py-2.5">Status</th>
                          <th class="px-4 py-2.5">Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (p of (stockPlan()?.products || []); track p.productId) {
                          <tr class="border-b border-gray-50 hover:bg-gray-50/60">
                            <td class="px-4 py-2.5 font-semibold max-w-[14rem]"><div class="truncate" [title]="p.name">{{ p.name }}</div></td>
                            <td class="px-4 py-2.5 text-right tabular-nums">{{ inrQty(p.stock) }} <span class="text-[10px] text-gray-400">{{ p.uom || '' }}</span></td>
                            <td class="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                              @if (p.runsOutInDays != null) {
                                <span [class]="runsOutCls(p.runsOutInDays)">{{ inr(p.runsOutInDays) }}d</span>
                              } @else { <span class="text-gray-300">—</span> }
                            </td>
                            <td class="px-4 py-2.5 text-right tabular-nums text-gray-500">{{ inrQty(p.avgDailySales) }}</td>
                            <td class="px-4 py-2.5 text-right tabular-nums">{{ inrQty(p.forecastQty) }}</td>
                            <td class="px-4 py-2.5 text-right tabular-nums text-gray-500">{{ inrQty(p.demand365) }}</td>
                            <td class="px-4 py-2.5 text-right tabular-nums text-gray-500">{{ inrQty(p.safetyStock) }}</td>
                            <td class="px-4 py-2.5 text-right tabular-nums text-gray-500">{{ inrQty(p.reorderPoint) }}</td>
                            <td class="px-4 py-2.5 text-right tabular-nums text-gray-500">{{ p.eoq != null ? inrQty(p.eoq) : '—' }}</td>
                            <td class="px-4 py-2.5 text-right tabular-nums">
                              @if ((p.recommendedOrderQty || 0) > 0) {
                                <span class="font-bold text-indigo-700">{{ inrQty(p.recommendedOrderQty) }}</span>
                              } @else { <span class="text-gray-300">—</span> }
                            </td>
                            <td class="px-4 py-2.5">
                              @if (isOverstock(p)) {
                                <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Overstock</span>
                              } @else { <span class="text-gray-300">—</span> }
                            </td>
                            <td class="px-4 py-2.5">
                              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize" [class]="confCls(p.confidence)">{{ p.confidence || '—' }}</span>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              </div>
            }
          }
        </main>

        <!-- ── SET-PRICE MODAL ────────────────────────────────────────── -->
        @if (priceFor(); as target) {
          <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" (click)="closePrice()">
            <div class="w-full max-w-md bg-white rounded-2xl shadow-xl p-6" (click)="$event.stopPropagation()">
              <div class="flex items-center gap-3 mb-1">
                <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shrink-0"><i class="pi pi-tag" style="font-size:.85rem"></i></div>
                <div class="min-w-0">
                  <h3 class="font-bold text-gray-900 leading-tight">Set market price</h3>
                  <p class="text-[12px] text-gray-400 truncate" [title]="target.name">{{ target.name }}</p>
                </div>
              </div>
              <div class="grid grid-cols-3 gap-3 mt-5">
                <div>
                  <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Low</label>
                  <input type="number" min="0" [(ngModel)]="priceForm.priceLow" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums" placeholder="₹" />
                </div>
                <div>
                  <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Median *</label>
                  <input type="number" min="0" [(ngModel)]="priceForm.priceMedian" class="w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm tabular-nums" placeholder="₹" />
                </div>
                <div>
                  <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">High</label>
                  <input type="number" min="0" [(ngModel)]="priceForm.priceHigh" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums" placeholder="₹" />
                </div>
              </div>
              <div class="mt-3">
                <label class="block text-[11px] font-semibold text-gray-400 uppercase mb-1">Note</label>
                <input [(ngModel)]="priceForm.note" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="e.g. distributor quote, mandi rate…" />
              </div>
              @if (priceErr()) { <p class="text-sm text-red-600 mt-3">{{ priceErr() }}</p> }
              <div class="flex gap-2 mt-5">
                <button (click)="closePrice()" class="flex-1 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold py-2.5">Cancel</button>
                <button (click)="savePrice()" [disabled]="savingPrice()"
                  class="flex-1 rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2.5 hover:bg-indigo-700 disabled:opacity-50">
                  {{ savingPrice() ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class ErpIntelComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly features = inject(FeatureService);
  private readonly router = inject(Router);

  readonly locked = computed(() => !this.features.hasFeature('premiumInsights'));

  readonly lockBullets = [
    'Product performance scores',
    'Market price comparison',
    '4-month demand forecast',
    'Stock planner',
  ];

  readonly tabList: { id: TabId; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: 'pi-th-large' },
    { id: 'monthplan', label: 'Month Planner', icon: 'pi-calendar' },
    { id: 'performance', label: 'Product Performance', icon: 'pi-chart-bar' },
    { id: 'pricing', label: 'Market Pricing', icon: 'pi-tag' },
    { id: 'forecast', label: 'Forecast & Stock', icon: 'pi-chart-line' },
  ];

  readonly tab = signal<TabId>('overview');
  readonly fcView = signal<FcView>('forecast');

  // ── Overview ────────────────────────────────────────────────────────────────
  readonly overview = signal<OverviewData | null>(null);
  readonly ovLoading = signal(false);
  readonly ovError = signal('');

  // ── AI Recommendations feed ─────────────────────────────────────────────────
  readonly recos = signal<RecoData | null>(null);
  readonly recoLoading = signal(false);
  readonly recoError = signal('');
  readonly recoFilter = signal<RecoFilter>('all');
  readonly recoExpanded = signal(false);

  private readonly recoChipDefs: { id: RecoFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'buy', label: 'Buy' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'dead', label: 'Dead stock' },
    { id: 'supplier', label: 'Supplier' },
  ];
  readonly recoChips = computed<{ id: RecoFilter; label: string; count: number }[]>(() => {
    const rows = this.recos()?.recommendations || [];
    return this.recoChipDefs.map((c) => ({
      ...c,
      count: c.id === 'all' ? rows.length : rows.filter((r) => this.recoGroup(r?.type) === c.id).length,
    }));
  });

  readonly recoFiltered = computed<Recommendation[]>(() => {
    const f = this.recoFilter();
    const rows = this.recos()?.recommendations || [];
    return f === 'all' ? rows : rows.filter((r) => this.recoGroup(r?.type) === f);
  });
  readonly recoShown = computed(() => this.recoExpanded() ? this.recoFiltered() : this.recoFiltered().slice(0, 10));

  private recoGroup(t: RecoType | undefined): RecoFilter {
    if (t === 'buy' || t === 'reorder-soon') return 'buy';
    if (t === 'price-up' || t === 'price-down') return 'pricing';
    if (t === 'promote-dead') return 'dead';
    return 'supplier';
  }

  setRecoFilter(f: RecoFilter) {
    this.recoFilter.set(f);
    this.recoExpanded.set(false); // collapse when switching so the top 10 of the new group shows
  }

  recoIcon(t: RecoType): string {
    const map: Record<RecoType, string> = {
      'buy': 'pi-shopping-cart',
      'reorder-soon': 'pi-clock',
      'price-up': 'pi-arrow-up',
      'price-down': 'pi-arrow-down',
      'promote-dead': 'pi-tag',
      'switch-supplier': 'pi-sync',
    };
    return map[t] || 'pi-bolt';
  }

  recoIconCls(t: RecoType): string {
    const map: Record<RecoType, string> = {
      'buy': 'bg-indigo-50 text-indigo-600',
      'reorder-soon': 'bg-slate-100 text-slate-600',
      'price-up': 'bg-emerald-50 text-emerald-600',
      'price-down': 'bg-amber-50 text-amber-600',
      'promote-dead': 'bg-rose-50 text-rose-600',
      'switch-supplier': 'bg-violet-50 text-violet-600',
    };
    return map[t] || 'bg-gray-100 text-gray-500';
  }

  // ── Product performance ─────────────────────────────────────────────────────
  readonly perf = signal<PerfData | null>(null);
  readonly perfLoading = signal(false);
  readonly perfError = signal('');
  readonly perfQ = signal('');
  readonly perfFilter = signal<PerfFilter>('all');
  readonly perfSortKey = signal<string>('score');
  readonly perfSortDir = signal<SortDir>('desc');

  private readonly perfChipDefs: { id: PerfFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'A', label: 'A-class' },
    { id: 'B', label: 'B' },
    { id: 'C', label: 'C' },
    { id: 'fast-moving', label: 'Fast movers' },
    { id: 'rising', label: 'Rising' },
    { id: 'declining', label: 'Declining' },
    { id: 'stockout-risk', label: 'Stockout risk' },
    { id: 'overstock', label: 'Overstock' },
    { id: 'dead-stock', label: 'Dead stock' },
  ];
  readonly perfChips = computed<{ id: PerfFilter; label: string; count: number }[]>(() => {
    const rows = this.perf()?.products || [];
    return this.perfChipDefs.map((c) => ({ ...c, count: rows.filter((p) => this.perfMatch(p, c.id)).length }));
  });

  private perfMatch(p: PerfProduct, f: PerfFilter): boolean {
    if (f === 'all') return true;
    if (f === 'A' || f === 'B' || f === 'C') return p?.abcClass === f;
    if (f === 'fast-moving') return p?.healthClass === 'fast-moving';
    return (p?.flags || []).includes(f);
  }

  readonly perfCols: { key: string; label: string; right?: boolean }[] = [
    { key: 'name', label: 'Product' },
    { key: 'abcClass', label: 'ABC' },
    { key: 'healthClass', label: 'Health' },
    { key: 'score', label: 'Score' },
    { key: 'revenue90', label: 'Revenue 90d', right: true },
    { key: 'qty90', label: 'Qty', right: true },
    { key: 'velocityPerWeek', label: 'Velocity/wk', right: true },
    { key: 'momentumPct', label: 'Momentum', right: true },
    { key: 'marginPct', label: 'Margin', right: true },
    { key: 'stock', label: 'Stock', right: true },
    { key: 'daysOfCover', label: 'Days of cover', right: true },
  ];

  readonly perfFiltered = computed<PerfProduct[]>(() => {
    const q = this.perfQ().trim().toLowerCase();
    const f = this.perfFilter();
    const rows = this.perf()?.products || [];
    const filtered = rows.filter((p) => this.perfMatch(p, f) && (!q || (p?.name || '').toLowerCase().includes(q)));
    const key = this.perfSortKey();
    const dir = this.perfSortDir();
    return filtered.sort((a, b) => this.cmp(this.perfVal(a, key), this.perfVal(b, key), dir));
  });
  readonly perfShown = computed(() => this.perfFiltered().slice(0, 100));

  /** Sortable cell value — healthClass sorts by rank (fast → inactive), not alphabetically. */
  private perfVal(p: PerfProduct, key: string): unknown {
    if (key === 'healthClass') {
      const order: Record<string, number> = { 'fast-moving': 0, 'slow-moving': 1, 'dead-stock': 2, 'inactive': 3 };
      return p?.healthClass != null ? order[p.healthClass] : null;
    }
    return (p as unknown as Record<string, unknown>)[key];
  }

  /** Generic table comparator — strings locale-compared, numbers numeric, nulls always last. */
  private cmp(av: unknown, bv: unknown, dir: SortDir): number {
    const an = av === null || av === undefined;
    const bn = bv === null || bv === undefined;
    if (an && bn) return 0;
    if (an) return 1; // nulls always last
    if (bn) return -1;
    const c = typeof av === 'string' || typeof bv === 'string'
      ? String(av).localeCompare(String(bv))
      : (Number(av) || 0) - (Number(bv) || 0);
    return dir === 'asc' ? c : -c;
  }

  // ── Market pricing ──────────────────────────────────────────────────────────
  readonly market = signal<MarketData | null>(null);
  readonly marketLoading = signal(false);
  readonly marketError = signal('');
  readonly refreshingId = signal<string | null>(null);
  readonly rowMsg = signal<Record<string, string>>({});
  readonly priceFor = signal<MarketRow | null>(null);
  readonly savingPrice = signal(false);
  readonly priceErr = signal('');
  priceForm: { priceLow: number | null; priceMedian: number | null; priceHigh: number | null; note: string } =
    { priceLow: null, priceMedian: null, priceHigh: null, note: '' };

  /** Market table columns; rows sortable on the keyed ones (default: monthly volume desc). */
  readonly mkCols: { key?: string; label: string; right?: boolean }[] = [
    { key: 'name', label: 'Product' },
    { key: 'yourPrice', label: 'Your price', right: true },
    { label: 'Market low', right: true },
    { key: 'marketMedian', label: 'Median', right: true },
    { key: 'marketAvg', label: 'Avg', right: true },
    { label: 'High', right: true },
    { key: 'position', label: 'Position' },
    { label: 'Source' },
    { label: 'Actions', right: true },
  ];
  readonly mkSortKey = signal<string>(''); // '' → default order (monthly volume value desc)
  readonly mkSortDir = signal<SortDir>('desc');

  readonly marketRows = computed<MarketRow[]>(() => {
    const rows = [...(this.market()?.products || [])];
    const key = this.mkSortKey();
    if (!key) {
      return rows.sort((a, b) => (Number(b?.monthlyVolumeValue) || 0) - (Number(a?.monthlyVolumeValue) || 0));
    }
    const dir = this.mkSortDir();
    return rows.sort((a, b) => this.cmp(this.mkVal(a, key), this.mkVal(b, key), dir));
  });

  private mkVal(p: MarketRow, key: string): unknown {
    if (key === 'position') {
      const order: Record<string, number> = { under: 0, competitive: 1, over: 2 };
      return p?.position != null ? order[p.position] : null;
    }
    if (key === 'marketAvg') return p?.marketAvg ?? null;
    return (p as unknown as Record<string, unknown>)[key];
  }

  /** Parse the match-quality tier out of a sourceNote like "…best indiamart (exact)". */
  matchTier(note: string | null | undefined): 'exact' | 'high' | 'likely' | null {
    const m = /\((exact|high|likely)\)/.exec(String(note ?? ''));
    return m ? (m[1] as 'exact' | 'high' | 'likely') : null;
  }
  tierLabel(t: 'exact' | 'high' | 'likely'): string {
    return { exact: 'Exact', high: 'High', likely: 'Likely' }[t];
  }
  tierCls(t: 'exact' | 'high' | 'likely'): string {
    return {
      exact: 'bg-emerald-100 text-emerald-700',
      high: 'bg-teal-100 text-teal-700',
      likely: 'bg-amber-100 text-amber-700',
    }[t];
  }

  // ── Bulk market-price sync ──────────────────────────────────────────────────
  readonly bulk = signal<BulkRefreshState | null>(null);
  readonly bulkStarting = signal(false);
  readonly bulkBanner = signal('');
  readonly bulkRunning = computed(() => !!this.bulk()?.running);
  readonly bulkPct = computed(() => {
    const b = this.bulk();
    const total = Number(b?.total) || 0;
    return total > 0 ? Math.min(100, Math.round(((Number(b?.done) || 0) / total) * 100)) : 0;
  });
  private bulkTimer: ReturnType<typeof setInterval> | null = null;
  private bulkPollBusy = false;
  private bulkPollCount = 0;

  // ── Month planner ───────────────────────────────────────────────────────────
  /** The next 6 calendar months from today — the planning horizon. */
  readonly mpMonths: { value: string; label: string }[] = (() => {
    const out: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      });
    }
    return out;
  })();

  readonly mpMonth = signal<string>(this.mpMonths[0].value);
  readonly monthPlan = signal<MonthPlanData | null>(null);
  readonly mpLoading = signal(false);
  readonly mpError = signal('');
  readonly mpQ = signal('');
  readonly mpFilter = signal<MpFilter>('all');
  readonly mpSortKey = signal<string>('recommendedStock');
  readonly mpSortDir = signal<SortDir>('desc');

  readonly mpChips: { id: MpFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'needs-stock', label: 'Needs stock' },
    { id: 'sold-before', label: 'Sold this month before' },
    { id: 'has-market', label: 'Has market price' },
  ];

  readonly mpYear = computed(() => {
    const m = /^(\d{4})-/.exec(this.mpMonth());
    return m ? Number(m[1]) : new Date().getFullYear();
  });
  readonly mpMonthName = computed(() =>
    this.monthPlan()?.monthName
    || (this.mpMonths.find((x) => x.value === this.mpMonth())?.label.split(' ')[0] ?? ''));

  readonly mpCols = computed<{ key: string; label: string; sub?: string; right?: boolean }[]>(() => {
    const mn = this.mpMonthName();
    const y = this.mpYear();
    const yy = (n: number) => "'" + String(n % 100).padStart(2, '0');
    return [
      { key: 'name', label: 'Product' },
      { key: 'h0', label: `${mn} ${yy(y - 2)}`, sub: 'Qty · Est. profit', right: true },
      { key: 'h1', label: `${mn} ${yy(y - 1)}`, sub: 'Qty · Est. profit', right: true },
      { key: 'currentStock', label: 'Current stock', right: true },
      { key: 'recommendedStock', label: 'Recommended stock', right: true },
      { key: 'shortfall', label: 'Shortfall', right: true },
      { key: 'yourPrice', label: 'Your price', right: true },
      { key: 'marketMedian', label: 'Market ₹', right: true },
      { key: 'recommendedPrice', label: 'Recommended price', right: true },
      { key: 'estProfitPotential', label: 'Est. profit potential ₹', right: true },
    ];
  });

  readonly mpFiltered = computed<MpProduct[]>(() => {
    const q = this.mpQ().trim().toLowerCase();
    const f = this.mpFilter();
    const rows = this.monthPlan()?.products || [];
    const filtered = rows.filter((p) => {
      if (q && !(p?.name || '').toLowerCase().includes(q)) return false;
      if (f === 'needs-stock') return (Number(p?.shortfall) || 0) > 0;
      if (f === 'sold-before') return (p?.history || []).some((h) => (Number(h?.qtySold) || 0) > 0);
      if (f === 'has-market') return p?.marketMedian != null;
      return true;
    });
    const key = this.mpSortKey();
    const dir = this.mpSortDir();
    return filtered.sort((a, b) => this.cmp(this.mpVal(a, key), this.mpVal(b, key), dir));
  });
  readonly mpShown = computed(() => this.mpFiltered().slice(0, 100));

  private mpVal(p: MpProduct, key: string): unknown {
    if (key === 'h0') return this.hist(p, 0)?.qtySold ?? null;
    if (key === 'h1') return this.hist(p, 1)?.qtySold ?? null;
    return (p as unknown as Record<string, unknown>)[key];
  }

  /** Safe access to the two-years-ago (0) / last-year (1) history slot. */
  hist(p: MpProduct, i: number): MpHistory | null {
    return (p?.history && p.history[i]) || null;
  }

  /** "min ₹X · premium ₹Y" under the recommended price — skips whichever is null. */
  priceRange(p: MpProduct): string {
    const parts: string[] = [];
    if (p?.minPrice != null) parts.push('min ₹' + this.inr(p.minPrice));
    if (p?.premiumPrice != null) parts.push('premium ₹' + this.inr(p.premiumPrice));
    return parts.join(' · ');
  }

  // ── Forecast ────────────────────────────────────────────────────────────────
  readonly forecast = signal<ForecastData | null>(null);
  readonly fcLoading = signal(false);
  readonly fcError = signal('');
  readonly fcQ = signal('');

  readonly fcFiltered = computed<ForecastProduct[]>(() => {
    const q = this.fcQ().trim().toLowerCase();
    const rows = this.forecast()?.products || [];
    const filtered = q ? rows.filter((p) => (p?.name || '').toLowerCase().includes(q)) : [...rows];
    return filtered.sort((a, b) => (Number(b?.totalRevenue) || 0) - (Number(a?.totalRevenue) || 0));
  });
  readonly fcShown = computed(() => this.fcFiltered().slice(0, 100));

  // ── Stock planner ───────────────────────────────────────────────────────────
  readonly stockPlan = signal<PlanData | null>(null);
  readonly planLoading = signal(false);
  readonly planError = signal('');
  readonly leadTime = signal(14);
  private ltTimer: ReturnType<typeof setTimeout> | null = null;

  /** Demand-horizon totals (7/30/90/365 days) summed across the plan rows. */
  readonly planDemand = computed(() => {
    const rows = this.stockPlan()?.products || [];
    const sum = (k: 'demand7' | 'demand30' | 'demand90' | 'demand365') =>
      rows.reduce((s, p) => s + (Number(p?.[k]) || 0), 0);
    return { d7: sum('demand7'), d30: sum('demand30'), d90: sum('demand90'), d365: sum('demand365') };
  });

  // ── Header ──────────────────────────────────────────────────────────────────
  readonly asOf = computed(() => this.overview()?.asOf || this.monthPlan()?.asOf || this.perf()?.asOf || this.forecast()?.asOf || '');
  readonly anyLoading = computed(() =>
    this.ovLoading() || this.recoLoading() || this.mpLoading() || this.perfLoading() || this.marketLoading() || this.fcLoading() || this.planLoading());

  ngOnInit() {
    if (this.locked()) return; // premium off → lock screen only, no API calls
    this.loadOverview();
    this.checkBulkStatus(); // resume the bulk-sync UI if a run is already going
  }

  ngOnDestroy() {
    this.stopBulkPolling();
    if (this.ltTimer) clearTimeout(this.ltTimer);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  go(t: TabId) {
    if (this.locked()) return;
    this.tab.set(t);
    if (t === 'overview' && !this.overview() && !this.ovLoading()) this.loadOverview();
    if (t === 'monthplan' && !this.monthPlan() && !this.mpLoading()) this.loadMonthPlan();
    if (t === 'performance' && !this.perf() && !this.perfLoading()) this.loadPerf();
    if (t === 'pricing' && !this.market() && !this.marketLoading()) this.loadMarket();
    if (t === 'forecast') this.lazyLoadFc();
  }

  setFcView(v: FcView) {
    this.fcView.set(v);
    this.lazyLoadFc();
  }

  private lazyLoadFc() {
    if (this.fcView() === 'forecast' && !this.forecast() && !this.fcLoading()) this.loadForecast();
    if (this.fcView() === 'plan' && !this.stockPlan() && !this.planLoading()) this.loadStockPlan();
  }

  refresh() {
    if (this.locked()) return;
    this.loadOverview();
    const t = this.tab();
    if (t === 'monthplan') this.loadMonthPlan();
    if (t === 'performance') this.loadPerf();
    if (t === 'pricing') this.loadMarket();
    if (t === 'forecast') {
      if (this.fcView() === 'forecast') this.loadForecast();
      else this.loadStockPlan();
    }
  }

  goUpgrade() {
    this.router.navigate(['/settings/upgrade'], { queryParams: { feature: 'premiumInsights' } })
      .catch(() => this.router.navigate(['/settings']));
  }

  // ── Loaders ─────────────────────────────────────────────────────────────────
  loadOverview() {
    if (!this.recoLoading()) this.loadRecos(); // the feed rides along with the overview
    this.ovLoading.set(true);
    this.ovError.set('');
    this.api.get<OverviewData>('/erp/intel/overview').subscribe({
      next: (r) => { this.overview.set(r || {}); this.ovLoading.set(false); },
      error: (e) => { this.ovError.set(this.msg(e, 'Could not load the overview.')); this.ovLoading.set(false); },
    });
  }

  loadRecos() {
    this.recoLoading.set(true);
    this.recoError.set('');
    this.api.get<RecoData>('/erp/intel/recommendations').subscribe({
      next: (r) => { this.recos.set(r || { recommendations: [] }); this.recoLoading.set(false); },
      error: (e) => { this.recoError.set(this.msg(e, 'Could not load recommendations.')); this.recoLoading.set(false); },
    });
  }

  loadMonthPlan() {
    this.mpLoading.set(true);
    this.mpError.set('');
    this.api.get<MonthPlanData>('/erp/intel/month-plan', { month: this.mpMonth() }).subscribe({
      next: (r) => { this.monthPlan.set(r || { products: [] }); this.mpLoading.set(false); },
      error: (e) => { this.mpError.set(this.msg(e, 'Could not load the month plan.')); this.mpLoading.set(false); },
    });
  }

  loadPerf() {
    this.perfLoading.set(true);
    this.perfError.set('');
    this.api.get<PerfData>('/erp/intel/performance').subscribe({
      next: (r) => { this.perf.set(r || { products: [] }); this.perfLoading.set(false); },
      error: (e) => { this.perfError.set(this.msg(e, 'Could not load product performance.')); this.perfLoading.set(false); },
    });
  }

  loadMarket() {
    this.marketLoading.set(true);
    this.marketError.set('');
    this.api.get<MarketData>('/erp/intel/market-prices').subscribe({
      next: (r) => { this.market.set(r || { products: [] }); this.marketLoading.set(false); },
      error: (e) => { this.marketError.set(this.msg(e, 'Could not load market prices.')); this.marketLoading.set(false); },
    });
  }

  loadForecast() {
    this.fcLoading.set(true);
    this.fcError.set('');
    this.api.get<ForecastData>('/erp/intel/forecast').subscribe({
      next: (r) => { this.forecast.set(r || { products: [] }); this.fcLoading.set(false); },
      error: (e) => { this.fcError.set(this.msg(e, 'Could not load the forecast.')); this.fcLoading.set(false); },
    });
  }

  loadStockPlan() {
    this.planLoading.set(true);
    this.planError.set('');
    this.api.get<PlanData>('/erp/intel/stock-plan', { leadTimeDays: this.leadTime() }).subscribe({
      next: (r) => { this.stockPlan.set(r || { products: [] }); this.planLoading.set(false); },
      error: (e) => { this.planError.set(this.msg(e, 'Could not load the stock plan.')); this.planLoading.set(false); },
    });
  }

  // ── Performance table sorting ───────────────────────────────────────────────
  sortBy(key: string) {
    if (this.perfSortKey() === key) {
      this.perfSortDir.set(this.perfSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.perfSortKey.set(key);
      // healthClass ranks fast→inactive, so ascending puts fast movers first.
      this.perfSortDir.set(key === 'name' || key === 'abcClass' || key === 'healthClass' ? 'asc' : 'desc');
    }
  }

  // ── Month planner actions ───────────────────────────────────────────────────
  onMpMonth(v: string) {
    if (!v || v === this.mpMonth()) return;
    this.mpMonth.set(v);
    this.loadMonthPlan();
  }

  mpSortBy(key: string) {
    if (this.mpSortKey() === key) {
      this.mpSortDir.set(this.mpSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.mpSortKey.set(key);
      this.mpSortDir.set(key === 'name' ? 'asc' : 'desc');
    }
  }

  mpExportCsv() {
    const rows = this.mpFiltered();
    if (!rows.length) return;
    const lines = [
      'name,recommendedStock,currentStock,shortfall,recommendedPrice',
      ...rows.map((p) => [
        this.csvEsc(p.name),
        Number(p.recommendedStock) || 0,
        Number(p.currentStock) || 0,
        Number(p.shortfall) || 0,
        p.recommendedPrice != null ? Number(p.recommendedPrice) : '',
      ].join(',')),
    ];
    this.saveCsv(`month-plan-${this.mpMonth()}.csv`, lines);
  }

  // ── Market table sorting ────────────────────────────────────────────────────
  mkSortBy(key?: string) {
    if (!key) return;
    if (this.mkSortKey() === key) {
      this.mkSortDir.set(this.mkSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.mkSortKey.set(key);
      this.mkSortDir.set(key === 'name' ? 'asc' : 'desc');
    }
  }

  // ── Bulk market-price sync ──────────────────────────────────────────────────
  rowBulk(id: string): BulkStatus | null {
    const s = this.bulk()?.statuses;
    return (s && s[id]) || null;
  }

  /** True while this product is queued/being fetched in the bulk run. */
  rowBulkBusy(id: string): boolean {
    const s = this.rowBulk(id);
    return s === 'pending' || s === 'running';
  }

  startBulkRefresh() {
    if (this.locked() || this.bulkRunning() || this.bulkStarting()) return;
    this.bulkStarting.set(true);
    this.bulkBanner.set('');
    this.marketError.set('');
    this.api.post<BulkRefreshState>('/erp/intel/market-prices/refresh-all', {}).subscribe({
      next: (r) => {
        this.bulkStarting.set(false);
        this.bulk.set(r || {});
        if (r?.running) this.startBulkPolling();
        else this.finishBulk(r || {}); // tiny catalogue — finished before we could poll
      },
      error: (e) => {
        this.bulkStarting.set(false);
        this.marketError.set(this.msg(e, 'Could not start the price sync.'));
      },
    });
  }

  /** One-shot probe on page load: resume the polling UI if a run is in progress. */
  private checkBulkStatus() {
    this.api.get<BulkRefreshState>('/erp/intel/market-prices/refresh-status').subscribe({
      next: (r) => {
        if (r?.running) {
          this.bulk.set(r);
          this.startBulkPolling();
        }
      },
      error: () => { /* best-effort probe — stay silent */ },
    });
  }

  private startBulkPolling() {
    if (this.bulkTimer) return;
    this.bulkPollCount = 0;
    this.bulkTimer = setInterval(() => this.pollBulk(), 2500);
  }

  private stopBulkPolling() {
    if (this.bulkTimer) {
      clearInterval(this.bulkTimer);
      this.bulkTimer = null;
    }
    this.bulkPollBusy = false;
  }

  private pollBulk() {
    if (this.bulkPollBusy) return; // don't stack requests if one is slow
    this.bulkPollBusy = true;
    this.api.get<BulkRefreshState>('/erp/intel/market-prices/refresh-status').subscribe({
      next: (r) => {
        this.bulkPollBusy = false;
        this.bulk.set(r || {});
        if (r?.running) {
          this.bulkPollCount++;
          // Reload the list every ~3rd poll so freshly fetched figures show up progressively.
          if (this.bulkPollCount % 3 === 0 && !this.marketLoading()) this.loadMarket();
        } else {
          this.stopBulkPolling();
          this.finishBulk(r || {});
        }
      },
      error: () => { this.bulkPollBusy = false; /* transient — keep polling */ },
    });
  }

  private finishBulk(r: BulkRefreshState) {
    const ok = Number(r?.ok) || 0;
    const noData = Number(r?.noData) || 0;
    this.bulkBanner.set(`Done — ${ok} priced, ${noData} without web data`);
    if (!this.marketLoading()) this.loadMarket();
  }

  // ── Market pricing actions ──────────────────────────────────────────────────
  refreshRow(p: MarketRow) {
    if (!p?.productId || this.refreshingId()) return;
    this.refreshingId.set(p.productId);
    this.setRowMsg(p.productId, '');
    this.api.post<{ status?: string; message?: string }>(`/erp/intel/market-prices/refresh/${p.productId}`, {}).subscribe({
      next: (r) => {
        this.refreshingId.set(null);
        if (r?.status === 'ok') this.loadMarket();
        else this.setRowMsg(p.productId, r?.message || 'No market data found for this product.');
      },
      error: (e) => {
        this.refreshingId.set(null);
        this.setRowMsg(p.productId, this.msg(e, 'Could not refresh the market price.'));
      },
    });
  }

  private setRowMsg(id: string, message: string) {
    const next = { ...this.rowMsg() };
    if (message) next[id] = message; else delete next[id];
    this.rowMsg.set(next);
  }

  openPrice(p: MarketRow) {
    this.priceErr.set('');
    this.priceForm = {
      priceLow: p?.marketLow != null ? Number(p.marketLow) : null,
      priceMedian: p?.marketMedian != null ? Number(p.marketMedian) : null,
      priceHigh: p?.marketHigh != null ? Number(p.marketHigh) : null,
      note: '',
    };
    this.priceFor.set(p);
  }

  closePrice() {
    if (this.savingPrice()) return;
    this.priceFor.set(null);
  }

  savePrice() {
    const target = this.priceFor();
    if (!target) return;
    this.priceErr.set('');
    const median = Number(this.priceForm.priceMedian);
    if (!median || median <= 0) { this.priceErr.set('A median market price is required.'); return; }
    const low = this.priceForm.priceLow != null && this.priceForm.priceLow !== ('' as unknown) ? Number(this.priceForm.priceLow) : null;
    const high = this.priceForm.priceHigh != null && this.priceForm.priceHigh !== ('' as unknown) ? Number(this.priceForm.priceHigh) : null;
    if (low != null && low > median) { this.priceErr.set('Low cannot be above the median.'); return; }
    if (high != null && high < median) { this.priceErr.set('High cannot be below the median.'); return; }
    this.savingPrice.set(true);
    this.api.post<{ saved?: boolean }>('/erp/intel/market-prices/manual', {
      productId: target.productId,
      priceMedian: median,
      ...(low != null ? { priceLow: low } : {}),
      ...(high != null ? { priceHigh: high } : {}),
      ...(this.priceForm.note.trim() ? { note: this.priceForm.note.trim() } : {}),
    }).subscribe({
      next: () => {
        this.savingPrice.set(false);
        this.priceFor.set(null);
        this.loadMarket();
      },
      error: (e) => {
        this.savingPrice.set(false);
        this.priceErr.set(this.msg(e, 'Could not save the market price.'));
      },
    });
  }

  // ── Stock planner ───────────────────────────────────────────────────────────
  onLeadTime(v: unknown) {
    const n = Math.max(0, Math.round(Number(v) || 0));
    this.leadTime.set(n);
    if (this.ltTimer) clearTimeout(this.ltTimer);
    this.ltTimer = setTimeout(() => this.loadStockPlan(), 500);
  }

  isOverstock(p: PlanProduct): boolean {
    return !!p?.overstock && Number(p.overstock) !== 0;
  }

  /** Urgency colour for "Runs out in X days": red inside the lead time, amber under a month. */
  runsOutCls(d: number | null | undefined): string {
    if (d == null) return 'text-gray-300';
    const lt = Number(this.stockPlan()?.assumptions?.leadTimeDays ?? this.leadTime()) || 0;
    if (d <= lt) return 'text-red-600 font-bold';
    if (d <= 30) return 'text-amber-600 font-semibold';
    return 'text-gray-400';
  }

  exportCsv() {
    const rows = this.stockPlan()?.products || [];
    if (!rows.length) return;
    const lines = [
      'name,stock,forecastQty,safetyStock,recommendedOrderQty,avgDailySales,reorderPoint,eoq,demand7,demand30,demand90,demand365,runsOutInDays',
      ...rows.map((p) => [
        this.csvEsc(p.name),
        Number(p.stock) || 0,
        Number(p.forecastQty) || 0,
        Number(p.safetyStock) || 0,
        Number(p.recommendedOrderQty) || 0,
        Number(p.avgDailySales) || 0,
        Number(p.reorderPoint) || 0,
        p.eoq != null ? Number(p.eoq) : '',
        Number(p.demand7) || 0,
        Number(p.demand30) || 0,
        Number(p.demand90) || 0,
        Number(p.demand365) || 0,
        p.runsOutInDays != null ? Number(p.runsOutInDays) : '',
      ].join(',')),
    ];
    this.saveCsv('stock-plan.csv', lines);
  }

  // ── CSV helpers ─────────────────────────────────────────────────────────────
  private csvEsc(v: unknown): string {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  private saveCsv(filename: string, lines: string[]) {
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* noop */ } }, 10000);
  }

  // ── Chart / chip helpers ────────────────────────────────────────────────────
  /** Bar height (%) of one month within a product's forecast mini chart. */
  barPct(p: ForecastProduct, m: ForecastMonth): number {
    const max = Math.max(...(p?.months || []).map((x) => Number(x?.qty) || 0), 1);
    return Math.max(6, Math.round(((Number(m?.qty) || 0) / max) * 100));
  }

  clampPct(n: unknown): number {
    const v = Number(n) || 0;
    return v < 0 ? 0 : v > 100 ? 100 : v;
  }

  abcCls(c: string | undefined): string {
    if (c === 'A') return 'bg-emerald-100 text-emerald-700';
    if (c === 'B') return 'bg-indigo-100 text-indigo-700';
    return 'bg-gray-100 text-gray-600';
  }

  healthLabel(h: string | undefined): string {
    const map: Record<string, string> = { 'fast-moving': 'Fast', 'slow-moving': 'Slow', 'dead-stock': 'Dead' };
    return (h && map[h]) || '—';
  }

  healthCls(h: string | undefined): string {
    const map: Record<string, string> = {
      'fast-moving': 'bg-emerald-100 text-emerald-700',
      'slow-moving': 'bg-amber-100 text-amber-700',
      'dead-stock': 'bg-rose-100 text-rose-700',
    };
    return (h && map[h]) || 'bg-gray-100 text-gray-500';
  }

  confCls(c: string | null | undefined): string {
    if (c === 'high') return 'bg-emerald-100 text-emerald-700';
    if (c === 'medium') return 'bg-amber-100 text-amber-700';
    if (c === 'low') return 'bg-gray-100 text-gray-600';
    return 'bg-gray-50 text-gray-400';
  }

  flagLabel(f: string): string {
    const map: Record<string, string> = {
      'rising': '🔺 Rising',
      'declining': '🔻 Declining',
      'stockout-risk': '⚠ Stockout risk',
      'overstock': '📦 Overstock',
      'dead-stock': '💀 Dead stock',
    };
    return map[f] || f;
  }

  flagCls(f: string): string {
    const map: Record<string, string> = {
      'rising': 'bg-emerald-50 text-emerald-700',
      'declining': 'bg-red-50 text-red-600',
      'stockout-risk': 'bg-amber-50 text-amber-700',
      'overstock': 'bg-indigo-50 text-indigo-700',
      'dead-stock': 'bg-gray-100 text-gray-600',
    };
    return map[f] || 'bg-gray-100 text-gray-600';
  }

  // ── Formatting ──────────────────────────────────────────────────────────────
  inr(n: unknown): string {
    return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  inrQty(n: unknown): string {
    return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
  absVal(n: unknown): string {
    return Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 });
  }
  fmtDate(v: unknown): string {
    const d = new Date(v as string);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  /** 'YYYY-MM' → short month label like "Aug". Falls back to the raw value. */
  fmtYm(ym: unknown): string {
    const s = String(ym ?? '');
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) return s || '—';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-IN', { month: 'short' });
  }
  private msg(e: unknown, fallback: string): string {
    const err = e as { error?: { message?: string }; message?: string } | null;
    return err?.error?.message || err?.message || fallback;
  }
}
