import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { FeatureService } from '../../../core/services/feature.service';

type TabId = 'overview' | 'performance' | 'pricing' | 'forecast';
type SortDir = 'asc' | 'desc';
type FcView = 'forecast' | 'plan';

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

interface PerfProduct {
  productId: string; name: string; uom?: string;
  revenue90?: number; qty90?: number; orders90?: number; velocityPerWeek?: number;
  momentumPct?: number | null; marginPct?: number | null;
  abcClass?: 'A' | 'B' | 'C'; stock?: number; daysOfCover?: number | null;
  score?: number; flags?: string[];
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
}
interface PlanData {
  assumptions?: { leadTimeDays?: number; serviceLevelPct?: number; horizonMonths?: number };
  products?: PlanProduct[];
}

interface MarketRow {
  productId: string; name: string; yourPrice?: number;
  marketLow?: number | null; marketMedian?: number | null; marketHigh?: number | null;
  source?: string | null; confidence?: string | null; fetchedAt?: string | null;
  sourceNote?: string | null; position?: 'under' | 'competitive' | 'over' | null;
  monthlyVolumeValue?: number; points?: number | null;
}
interface MarketData { searchAvailable?: boolean; products?: MarketRow[]; }

/**
 * AI Insights Pro — the premium business-intelligence cockpit for the ERP.
 * Four tabs backed by /erp/intel/*:
 *   • Overview — headline winners (top performer / rising star / forecast winner)
 *     plus clickable risk counters that jump to the relevant tab.
 *   • Product Performance — sortable 0-100 scored table (ABC class, momentum,
 *     margin, days of cover, health flags).
 *   • Market Pricing — your price vs public-web market low/median/high, with
 *     manual entry and per-product web refresh.
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
              @if (perfLoading() && !perf()) {
                <div class="animate-pulse p-4 space-y-3">
                  <div class="h-8 bg-gray-100 rounded-xl"></div>
                  <div class="h-8 bg-gray-100 rounded-xl"></div>
                  <div class="h-8 bg-gray-100 rounded-xl"></div>
                  <div class="h-8 bg-gray-100 rounded-xl"></div>
                </div>
              } @else if (!perfShown().length) {
                <p class="text-sm text-gray-400 px-4 py-10 text-center">{{ perfQ() ? 'No products match your search.' : 'No products with sales history yet.' }}</p>
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
            <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 class="text-sm font-bold text-gray-700">Your prices vs the market</h2>
                @if (marketLoading()) { <span class="text-[12px] text-gray-400">Loading…</span> }
              </div>
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
                        <th class="px-4 py-2.5">Product</th>
                        <th class="px-4 py-2.5 text-right">Your price</th>
                        <th class="px-4 py-2.5 text-right">Market low</th>
                        <th class="px-4 py-2.5 text-right">Median</th>
                        <th class="px-4 py-2.5 text-right">High</th>
                        <th class="px-4 py-2.5">Position</th>
                        <th class="px-4 py-2.5">Source</th>
                        <th class="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (p of marketRows(); track p.productId) {
                        <tr class="border-b border-gray-50 hover:bg-gray-50/60 align-top">
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
                          </td>
                          <td class="px-4 py-2.5 text-right whitespace-nowrap">
                            @if (market()?.searchAvailable) {
                              <button (click)="refreshRow(p)" [disabled]="refreshingId() !== null"
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
                    Assumes {{ a.leadTimeDays ?? leadTime() }}-day lead time · {{ a.serviceLevelPct ?? 95 }}% service level · {{ a.horizonMonths ?? 4 }}-month horizon
                  </p>
                }
                <button (click)="exportCsv()" [disabled]="!stockPlan()?.products?.length"
                  class="ml-auto rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold px-4 py-2 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-40 transition-colors">
                  <i class="pi pi-download mr-1.5" style="font-size:.75rem"></i>Export CSV
                </button>
              </div>
              <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 class="text-sm font-bold text-gray-700">What to reorder</h2>
                  @if (planLoading()) { <span class="text-[12px] text-gray-400">Loading…</span> }
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
                          <th class="px-4 py-2.5 text-right">Forecast demand (4 mo)</th>
                          <th class="px-4 py-2.5 text-right">Safety stock</th>
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
                            <td class="px-4 py-2.5 text-right tabular-nums">{{ inrQty(p.forecastQty) }}</td>
                            <td class="px-4 py-2.5 text-right tabular-nums text-gray-500">{{ inrQty(p.safetyStock) }}</td>
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
export class ErpIntelComponent implements OnInit {
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

  // ── Product performance ─────────────────────────────────────────────────────
  readonly perf = signal<PerfData | null>(null);
  readonly perfLoading = signal(false);
  readonly perfError = signal('');
  readonly perfQ = signal('');
  readonly perfSortKey = signal<string>('score');
  readonly perfSortDir = signal<SortDir>('desc');

  readonly perfCols: { key: string; label: string; right?: boolean }[] = [
    { key: 'name', label: 'Product' },
    { key: 'abcClass', label: 'ABC' },
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
    const rows = this.perf()?.products || [];
    const filtered = q ? rows.filter((p) => (p?.name || '').toLowerCase().includes(q)) : [...rows];
    const key = this.perfSortKey();
    const dir = this.perfSortDir();
    return filtered.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[key];
      const bv = (b as unknown as Record<string, unknown>)[key];
      const an = av === null || av === undefined;
      const bn = bv === null || bv === undefined;
      if (an && bn) return 0;
      if (an) return 1; // nulls always last
      if (bn) return -1;
      const c = typeof av === 'string' || typeof bv === 'string'
        ? String(av).localeCompare(String(bv))
        : (Number(av) || 0) - (Number(bv) || 0);
      return dir === 'asc' ? c : -c;
    });
  });
  readonly perfShown = computed(() => this.perfFiltered().slice(0, 100));

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

  readonly marketRows = computed<MarketRow[]>(() =>
    [...(this.market()?.products || [])].sort(
      (a, b) => (Number(b?.monthlyVolumeValue) || 0) - (Number(a?.monthlyVolumeValue) || 0),
    ),
  );

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

  // ── Header ──────────────────────────────────────────────────────────────────
  readonly asOf = computed(() => this.overview()?.asOf || this.perf()?.asOf || this.forecast()?.asOf || '');
  readonly anyLoading = computed(() =>
    this.ovLoading() || this.perfLoading() || this.marketLoading() || this.fcLoading() || this.planLoading());

  ngOnInit() {
    if (this.locked()) return; // premium off → lock screen only, no API calls
    this.loadOverview();
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  go(t: TabId) {
    if (this.locked()) return;
    this.tab.set(t);
    if (t === 'overview' && !this.overview() && !this.ovLoading()) this.loadOverview();
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
    this.ovLoading.set(true);
    this.ovError.set('');
    this.api.get<OverviewData>('/erp/intel/overview').subscribe({
      next: (r) => { this.overview.set(r || {}); this.ovLoading.set(false); },
      error: (e) => { this.ovError.set(this.msg(e, 'Could not load the overview.')); this.ovLoading.set(false); },
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
      this.perfSortDir.set(key === 'name' || key === 'abcClass' ? 'asc' : 'desc');
    }
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

  exportCsv() {
    const rows = this.stockPlan()?.products || [];
    if (!rows.length) return;
    const esc = (v: unknown): string => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [
      'name,stock,forecastQty,safetyStock,recommendedOrderQty',
      ...rows.map((p) => [esc(p.name), Number(p.stock) || 0, Number(p.forecastQty) || 0, Number(p.safetyStock) || 0, Number(p.recommendedOrderQty) || 0].join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stock-plan.csv';
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
