import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SfaService } from '../../core/services/sfa.service';

type Tab = 'today' | 'beat' | 'order' | 'collect' | 'performance' | 'visits';

interface OrderLine {
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  thumbnail?: string;
}

/**
 * `wa-my-sales` — the flagship field-sales workspace a SALESMAN sees after logging
 * into the portal with email/password (session-authed, not the token webview).
 * Mobile-first, six sticky tabs, designed to be understood at a glance by a
 * salesman in the field:
 *   • Today — greeting, day-at-a-glance target rings, today's numbers, market
 *     outstanding, promises due, and a "Start my day" jump into the beat.
 *   • Beat  — scannable beat cards (outstanding / open bills / last-visit
 *     recency), check-in/out flow with an active-visit banner, quick jumps to
 *     order & collect.
 *   • Order — customer picker, fast product search with thumbnails + MRP + live
 *     stock + scheme badges, qty steppers, running total, success state with
 *     scheme savings & free items.
 *   • Collect — open bills with overdue emphasis, cash/cheque/upi/online receipts,
 *     promise-to-pay.
 *   • Performance — date range, KPI summary, CSS bar chart, top products.
 *   • Visits — timeline log with status chips, times, outcome, note.
 * All calls go through SfaService (session cookies); emitted values are used as
 * already-unwrapped data. Every field access is null-safe and snake_case-tolerant.
 */
@Component({
  selector: 'wa-my-sales',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-slate-50 text-slate-900 pb-28">
      <!-- ── HEADER ─────────────────────────────────────────────── -->
      <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-100 shadow-sm">
        <div class="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-sm font-bold text-sm">
            {{ initials() }}
          </div>
          <div class="min-w-0 flex-1">
            <h1 class="text-[15px] font-bold truncate leading-tight">My Sales</h1>
            <p class="text-[11px] text-slate-400 leading-tight truncate">
              <i class="pi pi-map-marker text-[9px]"></i>
              {{ salesman()?.name || 'Loading…' }}{{ salesman()?.route ? ' · ' + salesman()?.route : '' }}{{ salesman()?.area ? ' · ' + salesman()?.area : '' }}
            </p>
          </div>
          <button (click)="refresh()" [disabled]="loading()"
            class="w-9 h-9 rounded-xl border border-slate-200 text-slate-500 flex items-center justify-center shrink-0 active:bg-slate-50 disabled:opacity-40">
            <i class="pi pi-refresh text-sm" [class.pi-spin]="loading()"></i>
          </button>
        </div>
        <div class="max-w-2xl mx-auto px-2 flex gap-1 overflow-x-auto no-scrollbar">
          @for (t of tabs; track t.id) {
            <button (click)="go(t.id)"
              class="px-3 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5"
              [class.border-indigo-600]="view() === t.id"
              [class.text-indigo-700]="view() === t.id"
              [class.border-transparent]="view() !== t.id"
              [class.text-slate-400]="view() !== t.id">
              <i class="pi text-[11px]" [ngClass]="t.icon"></i>{{ t.label }}
            </button>
          }
        </div>
      </header>

      @if (error()) {
        <div class="max-w-2xl mx-auto px-4 pt-4">
          <div class="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <i class="pi pi-exclamation-triangle text-red-500 mt-0.5"></i>
            <div class="flex-1">
              <p class="text-sm font-semibold text-red-800">{{ error() }}</p>
              <button (click)="refresh()" class="text-[12px] font-semibold text-red-600 mt-1 underline">Try again</button>
            </div>
          </div>
        </div>
      }

      <main class="max-w-2xl mx-auto px-4 py-4">

        <!-- ── TODAY ──────────────────────────────────────────────── -->
        @if (view() === 'today') {
          @if (loading() && !me()) {
            <div class="space-y-3">
              <div class="h-24 rounded-2xl bg-slate-200/60 animate-pulse"></div>
              <div class="grid grid-cols-2 gap-3">
                <div class="h-24 rounded-2xl bg-slate-200/60 animate-pulse"></div>
                <div class="h-24 rounded-2xl bg-slate-200/60 animate-pulse"></div>
              </div>
              <div class="h-40 rounded-2xl bg-slate-200/60 animate-pulse"></div>
            </div>
          } @else {
            <!-- Hero greeting -->
            <div class="rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white p-5 mb-3 shadow-sm">
              <p class="text-[13px] text-indigo-100">{{ greeting() }},</p>
              <p class="text-xl font-bold leading-tight">{{ (salesman()?.name || 'there') }} 👋</p>
              <p class="text-[12px] text-indigo-100 mt-1">
                <i class="pi pi-users text-[10px]"></i>
                {{ me()?.stats?.today?.beatSize ?? me()?.stats?.beatSize ?? 0 }} customer(s) on today's beat.
                @if (todaySoFar()) { <span> You're off to a good start.</span> }
                @else { <span> Let's make it a strong day.</span> }
              </p>
            </div>

            <!-- Day at a glance: target rings -->
            <h2 class="text-[12px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <i class="pi pi-bullseye"></i> Day at a glance · this month vs target
            </h2>
            <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <div class="grid grid-cols-3 gap-2">
                <!-- Sales ring -->
                <div class="flex flex-col items-center text-center">
                  <div class="relative w-[76px] h-[76px]">
                    <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="#eef2f7" stroke-width="4"></circle>
                      <circle cx="18" cy="18" r="15.5" fill="none" [attr.stroke]="ringColor('sales')" stroke-width="4"
                        stroke-linecap="round" stroke-dasharray="97.4"
                        [attr.stroke-dashoffset]="ringOffset(me()?.stats?.month?.sales, me()?.stats?.target?.amount)"
                        class="transition-all duration-700"></circle>
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                      <span class="text-sm font-bold tabular-nums leading-none">{{ ringLabel(me()?.stats?.month?.sales, me()?.stats?.target?.amount) }}</span>
                    </div>
                  </div>
                  <p class="text-[11px] font-semibold text-slate-600 mt-1.5">Sales</p>
                  <p class="text-[10px] text-slate-400 tabular-nums">₹{{ fmtShort(me()?.stats?.month?.sales) }} / {{ fmtShort(me()?.stats?.target?.amount) }}</p>
                </div>
                <!-- Collection ring -->
                <div class="flex flex-col items-center text-center">
                  <div class="relative w-[76px] h-[76px]">
                    <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="#eef2f7" stroke-width="4"></circle>
                      <circle cx="18" cy="18" r="15.5" fill="none" [attr.stroke]="ringColor('collect')" stroke-width="4"
                        stroke-linecap="round" stroke-dasharray="97.4"
                        [attr.stroke-dashoffset]="ringOffset(me()?.stats?.month?.collected, me()?.stats?.target?.collection)"
                        class="transition-all duration-700"></circle>
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                      <span class="text-sm font-bold tabular-nums leading-none">{{ ringLabel(me()?.stats?.month?.collected, me()?.stats?.target?.collection) }}</span>
                    </div>
                  </div>
                  <p class="text-[11px] font-semibold text-slate-600 mt-1.5">Collection</p>
                  <p class="text-[10px] text-slate-400 tabular-nums">₹{{ fmtShort(me()?.stats?.month?.collected) }} / {{ fmtShort(me()?.stats?.target?.collection) }}</p>
                </div>
                <!-- Visits ring -->
                <div class="flex flex-col items-center text-center">
                  <div class="relative w-[76px] h-[76px]">
                    <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="#eef2f7" stroke-width="4"></circle>
                      <circle cx="18" cy="18" r="15.5" fill="none" [attr.stroke]="ringColor('visits')" stroke-width="4"
                        stroke-linecap="round" stroke-dasharray="97.4"
                        [attr.stroke-dashoffset]="ringOffset(me()?.stats?.month?.visits, me()?.stats?.target?.visits)"
                        class="transition-all duration-700"></circle>
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                      <span class="text-sm font-bold tabular-nums leading-none">{{ ringLabel(me()?.stats?.month?.visits, me()?.stats?.target?.visits) }}</span>
                    </div>
                  </div>
                  <p class="text-[11px] font-semibold text-slate-600 mt-1.5">Visits</p>
                  <p class="text-[10px] text-slate-400 tabular-nums">{{ fmtQty(me()?.stats?.month?.visits) }} / {{ fmtQty(me()?.stats?.target?.visits) }}</p>
                </div>
              </div>
              <!-- Encouraging remaining line -->
              <div class="mt-3 pt-3 border-t border-slate-100 text-[12px] text-slate-500 leading-relaxed">
                @if (!me()?.stats?.target?.amount && !me()?.stats?.target?.collection && !me()?.stats?.target?.visits) {
                  <p class="text-slate-400"><i class="pi pi-info-circle text-[10px]"></i> No monthly targets set yet — ask your manager to set them and these rings will track your progress.</p>
                }
                @if (remaining(me()?.stats?.month?.sales, me()?.stats?.target?.amount) > 0) {
                  <p><i class="pi pi-arrow-up-right text-indigo-500 text-[10px]"></i> <span class="font-semibold text-slate-700">₹{{ fmt(remaining(me()?.stats?.month?.sales, me()?.stats?.target?.amount)) }}</span> more in sales to hit your target.</p>
                } @else if (me()?.stats?.target?.amount) {
                  <p class="text-emerald-700 font-semibold"><i class="pi pi-check-circle text-[10px]"></i> Sales target reached — brilliant!</p>
                }
                @if (remaining(me()?.stats?.month?.collected, me()?.stats?.target?.collection) > 0) {
                  <p class="mt-0.5"><i class="pi pi-arrow-up-right text-emerald-500 text-[10px]"></i> <span class="font-semibold text-slate-700">₹{{ fmt(remaining(me()?.stats?.month?.collected, me()?.stats?.target?.collection)) }}</span> more to collect to reach goal.</p>
                } @else if (me()?.stats?.target?.collection) {
                  <p class="mt-0.5 text-emerald-700 font-semibold"><i class="pi pi-check-circle text-[10px]"></i> Collection target reached!</p>
                }
              </div>
            </div>

            <!-- Today's numbers -->
            <h2 class="text-[12px] font-bold text-slate-400 uppercase tracking-wide mt-5 mb-2">Today so far</h2>
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <div class="flex items-center gap-1.5 text-indigo-600 mb-1">
                  <i class="pi pi-shopping-cart text-[12px]"></i>
                  <p class="text-[11px] font-semibold text-slate-400 uppercase">Sales</p>
                </div>
                <p class="text-xl font-bold tabular-nums">₹{{ fmt(me()?.stats?.today?.sales) }}</p>
                <p class="text-[11px] text-slate-400">{{ fmtQty(me()?.stats?.today?.orders) }} order(s)</p>
              </div>
              <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <div class="flex items-center gap-1.5 text-emerald-600 mb-1">
                  <i class="pi pi-wallet text-[12px]"></i>
                  <p class="text-[11px] font-semibold text-slate-400 uppercase">Collected</p>
                </div>
                <p class="text-xl font-bold tabular-nums text-emerald-700">₹{{ fmt(me()?.stats?.today?.collected) }}</p>
                <p class="text-[11px] text-slate-400">{{ collectedToday()?.count || 0 }} receipt(s)</p>
              </div>
              <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <div class="flex items-center gap-1.5 text-amber-600 mb-1">
                  <i class="pi pi-map text-[12px]"></i>
                  <p class="text-[11px] font-semibold text-slate-400 uppercase">Visits</p>
                </div>
                <p class="text-xl font-bold tabular-nums">{{ fmtQty(me()?.stats?.today?.visits) }}</p>
                <p class="text-[11px] text-slate-400">of {{ fmtQty(me()?.stats?.target?.visits) }} target</p>
              </div>
              <div class="bg-white rounded-2xl border border-red-100 p-4 shadow-sm">
                <div class="flex items-center gap-1.5 text-red-500 mb-1">
                  <i class="pi pi-exclamation-circle text-[12px]"></i>
                  <p class="text-[11px] font-semibold text-slate-400 uppercase">To collect (market)</p>
                </div>
                <p class="text-xl font-bold tabular-nums text-red-600">₹{{ fmt(me()?.pendingTotal) }}</p>
                <p class="text-[11px] text-slate-400">{{ me()?.pendingBills || 0 }} unpaid bill(s)</p>
              </div>
            </div>

            <!-- Start my day + promises jump -->
            <div class="grid grid-cols-3 gap-3 mt-4">
              <button (click)="go('beat')" class="rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white p-4 text-left shadow-sm active:scale-[0.98] transition-transform">
                <i class="pi pi-play-circle text-lg"></i>
                <p class="text-sm font-bold mt-1">Start my day</p>
                <p class="text-[11px] opacity-80">Go to your beat</p>
              </button>
              <button (click)="go('collect')" class="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-500 text-white p-4 text-left shadow-sm active:scale-[0.98] transition-transform">
                <i class="pi pi-wallet text-lg"></i>
                <p class="text-sm font-bold mt-1">Collections</p>
                <p class="text-[11px] opacity-80">Dues &amp; statements</p>
              </button>
              <button (click)="jumpToPromises()"
                class="rounded-2xl border p-4 text-left shadow-sm active:scale-[0.98] transition-transform"
                [class.bg-amber-50]="me()?.promisesDue?.length" [class.border-amber-200]="me()?.promisesDue?.length"
                [class.bg-white]="!me()?.promisesDue?.length" [class.border-slate-100]="!me()?.promisesDue?.length">
                <i class="pi pi-calendar-clock text-lg" [class.text-amber-600]="me()?.promisesDue?.length" [class.text-slate-400]="!me()?.promisesDue?.length"></i>
                <p class="text-sm font-bold mt-1 tabular-nums">{{ me()?.promisesDue?.length || 0 }} promise(s)</p>
                <p class="text-[11px] text-slate-500">due today — go collect</p>
              </button>
            </div>

            <!-- Promises due today list -->
            @if (me()?.promisesDue?.length) {
              <h2 class="text-[12px] font-bold text-slate-400 uppercase tracking-wide mt-5 mb-2">Promises due today</h2>
              @for (p of me()?.promisesDue || []; track $index) {
                <div class="bg-white rounded-2xl border border-amber-200 p-3 mb-2 flex items-center justify-between shadow-sm">
                  <div class="min-w-0 flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                      <i class="pi pi-calendar-clock text-sm"></i>
                    </div>
                    <div class="min-w-0">
                      <p class="text-sm font-semibold truncate">{{ p.customerName || p.customerName || 'Customer' }}</p>
                      <p class="text-[11px] text-slate-400 truncate">{{ p.invoiceNumber || p.invoiceNumber || 'On account' }}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <p class="text-sm font-bold tabular-nums text-amber-700">₹{{ fmt(p.amount) }}</p>
                    <button (click)="collectForPromise(p)" class="text-[11px] font-semibold bg-emerald-600 text-white rounded-lg px-3 py-1.5">Collect</button>
                  </div>
                </div>
              }
            }
          }
        }

        <!-- ── BEAT ───────────────────────────────────────────────── -->
        @if (view() === 'beat') {
          <!-- Active-visit controls, reused both at the top (out-of-beat check-ins)
               and inline within the checked-in party's beat card (in-beat), so the
               salesman never has to scroll up to enter data. -->
          <ng-template #activeVisitCard>
          @if (activeVisit(); as v) {
            <div class="bg-white rounded-2xl border-2 border-emerald-300 p-4 mb-3 shadow-sm">
              <div class="flex items-center gap-2 mb-3">
                <span class="relative flex h-2.5 w-2.5">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <p class="text-sm font-bold flex-1 truncate">Checked in · {{ activeCustomer()?.name || v.customerName || 'Customer' }}</p>
                <span class="text-[11px] text-slate-400 tabular-nums">{{ (v.checkinAt || v.checkinAt) ? 'since ' + timeShort(v.checkinAt || v.checkinAt) : 'now' }}</span>
              </div>
              <div class="grid grid-cols-2 gap-2 mb-3">
                <button (click)="orderFromVisit()" class="text-[13px] font-semibold bg-indigo-600 text-white rounded-xl py-2.5 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform">
                  <i class="pi pi-shopping-cart text-xs"></i> Take order
                </button>
                <button (click)="collectFromVisit()" class="text-[13px] font-semibold bg-emerald-600 text-white rounded-xl py-2.5 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform">
                  <i class="pi pi-wallet text-xs"></i> Collect
                </button>
              </div>
              <textarea [(ngModel)]="visitNote" rows="2" placeholder="Add a visit note…"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm mb-2 resize-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none"></textarea>
              <label class="text-[11px] font-semibold text-slate-400 uppercase">How did the visit go?</label>
              <select [(ngModel)]="checkoutOutcome" class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm my-1 bg-white">
                <option value="order_taken">Order taken</option>
                <option value="payment_collected">Payment collected</option>
                <option value="no_order">No order today</option>
                <option value="closed">Shop closed</option>
              </select>
              <button (click)="doCheckout()" [disabled]="busy()"
                class="w-full mt-2 bg-slate-900 text-white font-semibold rounded-xl py-2.5 disabled:opacity-50 flex items-center justify-center gap-1.5">
                <i class="pi pi-sign-out text-xs"></i>{{ busy() ? 'Saving…' : 'Check out' }}
              </button>
            </div>
          }
          </ng-template>

          @if (activeVisit() && !activeInBeat()) {
            <ng-container [ngTemplateOutlet]="activeVisitCard" />
          }

          <div class="relative mb-3">
            <i class="pi pi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></i>
            <input [(ngModel)]="custQ" (ngModelChange)="searchCustomers()" placeholder="Find a customer outside your beat…"
              class="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none" />
          </div>
          @if (custQ && customers().length) {
            <div class="bg-white rounded-2xl border border-slate-100 p-1 mb-3 shadow-sm">
              @for (c of customers(); track c.id) {
                <button (click)="checkIn(c)" class="w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl active:bg-slate-50">
                  <div class="min-w-0">
                    <p class="text-[13px] font-medium truncate">{{ c.name }}</p>
                    <p class="text-[11px] text-slate-400 truncate">{{ c.area || c.route || '—' }}</p>
                  </div>
                  <span class="text-[11px] text-indigo-600 font-semibold shrink-0 flex items-center gap-1"><i class="pi pi-sign-in text-[10px]"></i> Check in</span>
                </button>
              }
            </div>
          }

          <h2 class="text-[12px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <i class="pi pi-directions"></i> Today's beat @if (beat().length) { <span class="text-slate-300">·</span> <span class="text-slate-400 normal-case font-semibold">{{ beat().length }} stops</span> }
          </h2>
          @if (loading()) {
            @for (i of [1,2,3]; track i) { <div class="h-24 rounded-2xl bg-slate-200/60 animate-pulse mb-2"></div> }
          }
          @for (c of beat(); track c.customerId) {
            <div class="bg-white rounded-2xl border border-slate-100 p-3.5 mb-2 shadow-sm">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex items-start gap-3">
                  <div class="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 font-bold text-sm">
                    {{ initialsOf(c.name) }}
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ c.name }}</p>
                    <p class="text-[11px] text-slate-400 truncate">
                      <i class="pi pi-map-marker text-[9px]"></i> {{ c.area || c.route || 'No area' }}
                    </p>
                    <span class="inline-flex items-center gap-1 text-[10px] font-semibold mt-1 px-1.5 py-0.5 rounded-md"
                      [class.bg-slate-100]="!c.lastVisitAt" [class.text-slate-500]="!c.lastVisitAt"
                      [class.bg-emerald-50]="c.lastVisitAt" [class.text-emerald-700]="c.lastVisitAt">
                      <i class="pi pi-clock text-[9px]"></i>{{ lastVisitLabel(c.lastVisitAt) }}
                    </span>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-sm font-bold tabular-nums" [class.text-red-600]="num(c.outstanding) > 0" [class.text-slate-400]="num(c.outstanding) <= 0">₹{{ fmt(c.outstanding) }}</p>
                  @if ((c.openBills || 0) > 0) {
                    <span class="inline-block text-[10px] font-bold text-red-600 bg-red-50 rounded-md px-1.5 py-0.5 mt-1">{{ c.openBills }} due</span>
                  } @else {
                    <span class="inline-block text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-md px-1.5 py-0.5 mt-1">Clear</span>
                  }
                </div>
              </div>
              @if (isActiveCard(c)) {
                <div class="mt-3"><ng-container [ngTemplateOutlet]="activeVisitCard" /></div>
              } @else {
                <button (click)="checkIn(c)" [disabled]="busy()"
                  class="w-full mt-3 text-[13px] font-semibold bg-indigo-600 text-white rounded-xl py-2 disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform">
                  <i class="pi pi-sign-in text-xs"></i> Check in
                </button>
              }
            </div>
          } @empty {
            @if (!loading()) {
              <div class="bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-sm">
                <i class="pi pi-directions text-slate-300 text-3xl"></i>
                <p class="text-sm font-semibold text-slate-600 mt-2">No customers in your beat yet</p>
                <p class="text-[12px] text-slate-400 mt-1">Ask your manager to assign your route, or use the search above to visit any customer.</p>
              </div>
            }
          }
        }

        <!-- ── ORDER ──────────────────────────────────────────────── -->
        @if (view() === 'order') {
          @if (orderCustomer(); as oc) {
            <div class="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2.5 mb-3">
              <i class="pi pi-user text-indigo-500 text-sm"></i>
              <p class="text-[13px] font-semibold text-indigo-800 flex-1 truncate">Ordering for {{ oc.name }}</p>
              <button (click)="clearOrderCustomer()" class="text-[11px] font-semibold text-indigo-600">Change</button>
            </div>
          } @else {
            <div class="bg-white rounded-2xl border border-slate-100 p-4 mb-3 shadow-sm">
              <p class="text-sm font-bold text-slate-700 mb-1">Who is this order for?</p>
              <p class="text-[12px] text-slate-400 mb-3">Search and tap a customer to start.</p>
              <div class="relative">
                <i class="pi pi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></i>
                <input [(ngModel)]="custQ" (ngModelChange)="searchCustomers()" placeholder="Search customer…"
                  class="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none" />
              </div>
            </div>
            @for (c of customers(); track c.id) {
              <button (click)="pickOrderCustomer(c)" class="w-full text-left flex items-center justify-between bg-white rounded-xl border border-slate-100 px-3 py-2.5 mb-1.5 shadow-sm active:bg-slate-50">
                <div class="min-w-0">
                  <p class="text-[13px] font-medium truncate">{{ c.name }}</p>
                  <p class="text-[11px] text-slate-400 truncate">{{ c.area || c.route || '—' }}</p>
                </div>
                <span class="text-[11px] text-slate-400 shrink-0 tabular-nums">{{ c.phone }}</span>
              </button>
            } @empty {
              @if (custQ) { <p class="text-[13px] text-slate-400 text-center py-4">No customer found for "{{ custQ }}".</p> }
            }
          }

          @if (orderCustomer()) {
            <div class="relative my-3">
              <i class="pi pi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></i>
              <input [(ngModel)]="prodQ" (ngModelChange)="searchProducts()" placeholder="Search items to add…"
                class="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              @for (p of products(); track p.id) {
                <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden flex flex-col shadow-sm">
                  <div class="relative aspect-[4/3] bg-slate-50 flex items-center justify-center">
                    @if (p.thumbnail) { <img [src]="p.thumbnail" class="w-full h-full object-cover" loading="lazy" /> }
                    @else { <i class="pi pi-box text-slate-200 text-3xl"></i> }
                    @if (p.badge) { <span class="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow flex items-center gap-1"><i class="pi pi-percentage text-[8px]"></i>{{ p.badge }}</span> }
                    <span class="absolute bottom-1.5 right-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                      [class.bg-emerald-100]="num(p.stock) > 0" [class.text-emerald-700]="num(p.stock) > 0"
                      [class.bg-red-100]="num(p.stock) <= 0" [class.text-red-600]="num(p.stock) <= 0">
                      {{ num(p.stock) > 0 ? fmtQty(p.stock) + ' in stock' : 'Out of stock' }}
                    </span>
                  </div>
                  <div class="p-2.5 flex-1 flex flex-col">
                    <p class="text-[13px] font-semibold leading-snug line-clamp-2 flex-1">{{ p.name }}</p>
                    <div class="flex items-baseline gap-1.5 mt-1">
                      <p class="text-sm font-bold tabular-nums">₹{{ fmt(p.price) }}</p>
                      @if (p.mrp && num(p.mrp) > num(p.price)) { <p class="text-[11px] text-slate-400 line-through tabular-nums">₹{{ fmt(p.mrp) }}</p> }
                      @if (p.uom) { <p class="text-[10px] text-slate-400">/ {{ p.uom }}</p> }
                    </div>
                    @if (qtyOf(p.id); as q) {
                      <div class="flex items-center gap-1 mt-2">
                        <button (click)="stepProduct(p, -1)" class="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 font-bold text-lg active:scale-95 transition-transform">−</button>
                        <span class="flex-1 text-center text-sm font-bold tabular-nums">{{ q }}</span>
                        <button (click)="stepProduct(p, 1)" class="w-9 h-9 rounded-xl bg-indigo-600 text-white font-bold text-lg active:scale-95 transition-transform">+</button>
                      </div>
                    } @else {
                      <button (click)="stepProduct(p, 1)" class="mt-2 w-full py-2 rounded-xl bg-indigo-600 text-white text-[12px] font-bold active:scale-[0.98] transition-transform flex items-center justify-center gap-1"><i class="pi pi-plus text-[10px]"></i> Add</button>
                    }
                  </div>
                </div>
              } @empty {
                <div class="col-span-2 bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-sm">
                  <i class="pi pi-box text-slate-300 text-3xl"></i>
                  <p class="text-sm font-semibold text-slate-600 mt-2">No items found</p>
                  <p class="text-[12px] text-slate-400 mt-1">Try a different search term.</p>
                </div>
              }
            </div>

            <!-- Floating View Cart — jumps straight to the order summary so the
                 salesman doesn't scroll the whole item list to place the order. -->
            @if (orderLines().length) {
              <button (click)="scrollToCart()"
                class="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 bg-slate-900 text-white rounded-full shadow-lg px-5 py-3 flex items-center gap-2 text-[13px] font-bold active:scale-95 transition-transform">
                <i class="pi pi-shopping-cart"></i> View cart · {{ orderLines().length }} item(s) · ₹{{ fmt(orderTotal()) }}
              </button>
            }

            @if (orderResult(); as r) {
              <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mt-4 text-center">
                <i class="pi pi-check-circle text-emerald-500 text-3xl"></i>
                <p class="text-base font-bold text-emerald-800 mt-1">Order placed!</p>
                <p class="text-[13px] font-semibold text-emerald-700">{{ r.orderNumber || 'Confirmed' }}</p>
                @if (r.schemeDiscount) { <p class="text-[12px] text-emerald-700 mt-1"><i class="pi pi-gift text-[10px]"></i> Scheme saved ₹{{ fmt(r.schemeDiscount) }}</p> }
                @for (s of r.appliedSchemes || []; track $index) { <p class="text-[11px] text-emerald-600">{{ s.name || s.label || s }}</p> }
                @for (f of r.freeItems || []; track $index) { <p class="text-[11px] text-emerald-600">+ {{ f.quantity }} × {{ f.name || f.productName }} FREE</p> }
                <button (click)="orderResult.set(null)" class="text-[12px] font-semibold text-emerald-700 underline mt-2">Start another order</button>
              </div>
            }

            @if (orderLines().length) {
              <h2 id="msCartSummary" class="text-[12px] font-bold text-slate-400 uppercase tracking-wide mt-5 mb-2 flex items-center gap-1.5 scroll-mt-20">
                <i class="pi pi-list"></i> Order · {{ orderLines().length }} item(s)
              </h2>
              <div class="bg-white rounded-2xl border border-slate-100 p-3 shadow-sm">
                @for (l of orderLines(); track l.productId) {
                  <div class="flex items-center gap-2 py-1.5">
                    <div class="flex-1 min-w-0">
                      <p class="text-[13px] font-medium truncate">{{ l.productName }}</p>
                      <div class="flex items-center gap-1 mt-0.5">
                        <span class="text-[11px] text-slate-400">₹</span>
                        <input type="number" [ngModel]="l.unitPrice" (ngModelChange)="setPrice(l, $event)"
                          class="w-20 rounded-lg border border-slate-200 px-2 py-1 text-[12px] tabular-nums" />
                        <span class="text-[11px] text-slate-400 tabular-nums">× {{ l.quantity }} = <span class="font-semibold text-slate-600">₹{{ fmt(l.unitPrice * l.quantity) }}</span></span>
                      </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <button (click)="stepLine(l, -1)" class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-sm">−</button>
                      <span class="w-7 text-center text-sm font-bold tabular-nums">{{ l.quantity }}</span>
                      <button (click)="stepLine(l, 1)" class="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-sm">+</button>
                    </div>
                  </div>
                }
                <div class="flex items-center justify-between border-t border-slate-100 pt-2.5 mt-1.5">
                  <p class="text-[13px] font-bold">Total</p>
                  <p class="text-lg font-bold tabular-nums">₹{{ fmt(orderTotal()) }}</p>
                </div>
              </div>

              @if (sheetError()) { <p class="text-[12px] text-red-600 mt-2"><i class="pi pi-exclamation-circle text-[10px]"></i> {{ sheetError() }}</p> }
              <button (click)="submitOrder()" [disabled]="busy()"
                class="mt-3 w-full bg-indigo-600 text-white font-bold rounded-xl py-3.5 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform">
                @if (busy()) { <i class="pi pi-spin pi-spinner"></i> Placing… }
                @else { <i class="pi pi-check"></i> Place order · ₹{{ fmt(orderTotal()) }} }
              </button>
            }
          }
        }

        <!-- ── COLLECT ────────────────────────────────────────────── -->
        @if (view() === 'collect') {
          @if (collectCustomer(); as cc) {
            <div class="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 mb-3">
              <i class="pi pi-user text-emerald-600 text-sm"></i>
              <p class="text-[13px] font-semibold text-emerald-800 flex-1 truncate">{{ cc.name }}</p>
              @if (collectBills().length) {
                <button (click)="sendStatement()" class="text-[11px] font-semibold text-green-700 flex items-center gap-1"><i class="pi pi-whatsapp text-[11px]"></i> Statement</button>
              }
              <button (click)="clearCollectCustomer()" class="text-[11px] font-semibold text-emerald-700">Change</button>
            </div>
          } @else {
            <div class="bg-white rounded-2xl border border-slate-100 p-4 mb-3 shadow-sm">
              <p class="text-sm font-bold text-slate-700 mb-1">Collect from which customer?</p>
              <p class="text-[12px] text-slate-400 mb-3">Search a customer to see their open bills.</p>
              <div class="relative">
                <i class="pi pi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></i>
                <input [(ngModel)]="custQ" (ngModelChange)="searchCustomers()" placeholder="Search customer…"
                  class="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 outline-none" />
              </div>
            </div>
            @for (c of customers(); track c.id) {
              <button (click)="pickCollectCustomer(c)" class="w-full text-left flex items-center justify-between bg-white rounded-xl border border-slate-100 px-3 py-2.5 mb-1.5 shadow-sm active:bg-slate-50">
                <div class="min-w-0">
                  <p class="text-[13px] font-medium truncate">{{ c.name }}</p>
                  <p class="text-[11px] text-slate-400 truncate">{{ c.area || c.route || '—' }}</p>
                </div>
                <span class="text-sm font-bold tabular-nums shrink-0" [class.text-red-600]="num(c.outstanding) > 0" [class.text-slate-400]="num(c.outstanding) <= 0">₹{{ fmt(c.outstanding) }}</span>
              </button>
            } @empty {
              @if (custQ) { <p class="text-[13px] text-slate-400 text-center py-4">No customer found for "{{ custQ }}".</p> }
            }
          }

          @if (collectCustomer()) {
            <h2 class="text-[12px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <i class="pi pi-file"></i> Open bills
              <span class="ml-auto normal-case text-slate-500">Total ₹{{ fmt(billsTotal()) }}</span>
            </h2>
            @if (collectBills().length) {
              @if (agingBuckets(); as ag) {
                <div class="grid grid-cols-5 gap-1 mb-2.5 text-center">
                  <div class="bg-white rounded-lg border border-slate-100 py-1.5"><p class="text-[9px] text-slate-400 uppercase">Current</p><p class="text-[11px] font-bold tabular-nums text-slate-700">₹{{ short(ag.current) }}</p></div>
                  <div class="bg-white rounded-lg border border-amber-100 py-1.5"><p class="text-[9px] text-slate-400 uppercase">1–30</p><p class="text-[11px] font-bold tabular-nums text-amber-700">₹{{ short(ag.d1_30) }}</p></div>
                  <div class="bg-white rounded-lg border border-orange-100 py-1.5"><p class="text-[9px] text-slate-400 uppercase">31–60</p><p class="text-[11px] font-bold tabular-nums text-orange-700">₹{{ short(ag.d31_60) }}</p></div>
                  <div class="bg-white rounded-lg border border-red-100 py-1.5"><p class="text-[9px] text-slate-400 uppercase">61–90</p><p class="text-[11px] font-bold tabular-nums text-red-600">₹{{ short(ag.d61_90) }}</p></div>
                  <div class="bg-white rounded-lg border border-red-200 py-1.5"><p class="text-[9px] text-slate-400 uppercase">90+</p><p class="text-[11px] font-bold tabular-nums text-red-700">₹{{ short(ag.d90p) }}</p></div>
                </div>
              }
            }
            @if (billsLoading()) {
              @for (i of [1,2]; track i) { <div class="h-20 rounded-2xl bg-slate-200/60 animate-pulse mb-2"></div> }
            }
            @for (b of collectBills(); track b.id) {
              <div class="bg-white rounded-2xl border p-3.5 mb-2 shadow-sm" [class.border-red-200]="overdueDays(b) > 0" [class.border-slate-100]="overdueDays(b) <= 0">
                <div class="flex items-center justify-between">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ b.invoiceNumber || b.invoiceNumber }}</p>
                    <p class="text-[11px] text-slate-400">{{ (b.issuedAt || b.issuedAt) | date:'d MMM yy' }}{{ (b.dueDate || b.dueDate) ? ' · due ' + ((b.dueDate || b.dueDate) | date:'d MMM') : '' }}</p>
                    @if (overdueDays(b) > 0) {
                      <span class="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 rounded-md px-1.5 py-0.5 mt-1"><i class="pi pi-exclamation-triangle text-[9px]"></i> {{ overdueDays(b) }} day(s) overdue</span>
                    }
                  </div>
                  <p class="text-base font-bold tabular-nums shrink-0" [class.text-red-600]="overdueDays(b) > 0" [class.text-slate-700]="overdueDays(b) <= 0">₹{{ fmt(b.balanceDue ?? b.balanceDue) }}</p>
                </div>
                <div class="flex gap-2 mt-2.5">
                  <button (click)="openCollect(b)" class="flex-1 text-[12px] font-semibold bg-emerald-600 text-white rounded-xl py-2 flex items-center justify-center gap-1.5"><i class="pi pi-wallet text-[10px]"></i> Collect</button>
                  <button (click)="openPromise(b)" class="text-[12px] font-semibold text-amber-700 border border-amber-300 rounded-xl px-3 flex items-center gap-1.5"><i class="pi pi-calendar-clock text-[10px]"></i> Promise</button>
                </div>
              </div>
            } @empty {
              @if (!billsLoading()) {
                <div class="bg-white rounded-2xl border border-slate-100 p-6 text-center shadow-sm">
                  <i class="pi pi-check-circle text-emerald-400 text-3xl"></i>
                  <p class="text-sm font-semibold text-slate-600 mt-2">All clear — no open bills</p>
                  <p class="text-[12px] text-slate-400 mt-1">You can still record a promise-to-pay below.</p>
                </div>
              }
            }

            <button (click)="openPromise(null)" class="w-full mt-2 text-[13px] font-semibold border border-amber-300 text-amber-700 rounded-xl py-2.5 flex items-center justify-center gap-1.5"><i class="pi pi-calendar-plus text-xs"></i> Promise to pay (on account)</button>
          }
        }

        <!-- ── PERFORMANCE ────────────────────────────────────────── -->
        @if (view() === 'performance') {
          <div class="bg-white rounded-2xl border border-slate-100 p-3 mb-3 shadow-sm">
            <p class="text-[13px] font-bold text-slate-700 mb-2 flex items-center gap-1.5"><i class="pi pi-chart-line text-indigo-500"></i> How you're doing</p>
            <div class="flex items-end gap-2">
              <div class="flex-1">
                <label class="text-[11px] font-semibold text-slate-400 uppercase">From</label>
                <input type="date" [(ngModel)]="perfFrom" class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white" />
              </div>
              <div class="flex-1">
                <label class="text-[11px] font-semibold text-slate-400 uppercase">To</label>
                <input type="date" [(ngModel)]="perfTo" class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white" />
              </div>
              <button (click)="loadPerformance()" [disabled]="loading()" class="bg-indigo-600 text-white text-[13px] font-semibold rounded-xl px-4 py-2 disabled:opacity-50">Go</button>
            </div>
          </div>

          @if (loading() && !perf()) {
            <div class="grid grid-cols-2 gap-3">
              <div class="h-24 rounded-2xl bg-slate-200/60 animate-pulse"></div>
              <div class="h-24 rounded-2xl bg-slate-200/60 animate-pulse"></div>
            </div>
          } @else if (perf(); as pf) {
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <div class="flex items-center gap-1.5 text-indigo-600 mb-1"><i class="pi pi-shopping-cart text-[12px]"></i><p class="text-[11px] font-semibold text-slate-400 uppercase">Order value</p></div>
                <p class="text-xl font-bold tabular-nums">₹{{ fmt(pf.summary?.orderValue) }}</p>
                <p class="text-[11px] text-slate-400">{{ fmtQty(pf.summary?.orders) }} order(s)</p>
              </div>
              <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <div class="flex items-center gap-1.5 text-emerald-600 mb-1"><i class="pi pi-wallet text-[12px]"></i><p class="text-[11px] font-semibold text-slate-400 uppercase">Collected</p></div>
                <p class="text-xl font-bold tabular-nums text-emerald-700">₹{{ fmt(pf.summary?.collected) }}</p>
                <p class="text-[11px] text-slate-400">{{ fmtQty(pf.summary?.visits) }} visit(s)</p>
              </div>
            </div>

            @if (pf.summary?.targetAmount) {
              <div class="bg-white rounded-2xl border border-slate-100 p-4 mt-3 shadow-sm">
                <div class="flex items-baseline justify-between mb-1">
                  <p class="text-[12px] font-semibold text-slate-500">Order value vs target</p>
                  <p class="text-[12px] tabular-nums text-slate-500">{{ pct(pf.summary?.orderValue, pf.summary?.targetAmount) }}%</p>
                </div>
                <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-700" [class.bg-emerald-500]="pct(pf.summary?.orderValue, pf.summary?.targetAmount) >= 100" [class.bg-indigo-500]="pct(pf.summary?.orderValue, pf.summary?.targetAmount) < 100" [style.width.%]="pct(pf.summary?.orderValue, pf.summary?.targetAmount)"></div>
                </div>
              </div>
            }

            @if (pf.dayWise?.length) {
              <h2 class="text-[12px] font-bold text-slate-400 uppercase tracking-wide mt-5 mb-2">Sales by day</h2>
              <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <div class="flex items-end gap-1 h-32">
                  @for (d of lastDays(pf.dayWise); track $index) {
                    <div class="flex-1 flex flex-col items-center justify-end h-full group" [title]="(d.day | date:'d MMM') + ' · ₹' + fmt(d.sales)">
                      <div class="w-full rounded-t bg-gradient-to-t from-indigo-500 to-indigo-400 transition-all" [style.height.%]="barPct(d.sales, maxDaySales(pf.dayWise))"></div>
                    </div>
                  }
                </div>
                <div class="flex justify-between mt-1.5 text-[10px] text-slate-400 tabular-nums">
                  <span>{{ firstDay(pf.dayWise) | date:'d MMM' }}</span>
                  <span class="font-semibold text-slate-500">peak ₹{{ fmtShort(maxDaySales(pf.dayWise)) }}</span>
                  <span>{{ lastDay(pf.dayWise) | date:'d MMM' }}</span>
                </div>
              </div>
            }

            @if (pf.topProducts?.length) {
              <h2 class="text-[12px] font-bold text-slate-400 uppercase tracking-wide mt-5 mb-2 flex items-center gap-1.5"><i class="pi pi-star-fill text-amber-400"></i> Top products</h2>
              @for (tp of pf.topProducts; track $index) {
                <div class="bg-white rounded-2xl border border-slate-100 p-3 mb-2 flex items-center justify-between shadow-sm">
                  <div class="min-w-0 flex items-center gap-3">
                    <div class="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 text-[12px] font-bold tabular-nums">{{ $index + 1 }}</div>
                    <div class="min-w-0">
                      <p class="text-sm font-semibold truncate">{{ tp.productName }}</p>
                      <p class="text-[11px] text-slate-400 tabular-nums">{{ fmtQty(tp.qty) }} sold</p>
                    </div>
                  </div>
                  <p class="text-sm font-bold tabular-nums shrink-0">₹{{ fmt(tp.value) }}</p>
                </div>
              }
            }
          } @else if (!loading()) {
            <div class="bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-sm">
              <i class="pi pi-chart-bar text-slate-300 text-3xl"></i>
              <p class="text-sm font-semibold text-slate-600 mt-2">Pick a date range and tap Go</p>
              <p class="text-[12px] text-slate-400 mt-1">See your orders, collections and best-selling items.</p>
            </div>
          }
        }

        <!-- ── VISITS ─────────────────────────────────────────────── -->
        @if (view() === 'visits') {
          <div class="bg-white rounded-2xl border border-slate-100 p-3 mb-3 shadow-sm">
            <div class="flex items-end gap-2">
              <div class="flex-1">
                <label class="text-[11px] font-semibold text-slate-400 uppercase">From</label>
                <input type="date" [(ngModel)]="visitFrom" class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white" />
              </div>
              <div class="flex-1">
                <label class="text-[11px] font-semibold text-slate-400 uppercase">To</label>
                <input type="date" [(ngModel)]="visitTo" class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white" />
              </div>
              <button (click)="loadVisits()" [disabled]="loading()" class="bg-indigo-600 text-white text-[13px] font-semibold rounded-xl px-4 py-2 disabled:opacity-50">Go</button>
            </div>
          </div>

          @if (loading()) {
            @for (i of [1,2,3]; track i) { <div class="h-20 rounded-2xl bg-slate-200/60 animate-pulse mb-2"></div> }
          }
          <div class="relative">
            @if (visits().length) { <div class="absolute left-[19px] top-2 bottom-2 w-px bg-slate-200"></div> }
            @for (v of visits(); track v.id) {
              <div class="relative flex gap-3 mb-2">
                <div class="w-10 shrink-0 flex justify-center pt-3.5 z-10">
                  <span class="w-3 h-3 rounded-full ring-4 ring-slate-50"
                    [class.bg-emerald-500]="v.status === 'completed'"
                    [class.bg-indigo-500]="v.status === 'checked_in'"
                    [class.bg-slate-300]="v.status !== 'completed' && v.status !== 'checked_in'"></span>
                </div>
                <div class="flex-1 bg-white rounded-2xl border border-slate-100 p-3 shadow-sm">
                  <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold truncate">{{ v.customerName || 'Customer' }}</p>
                      <p class="text-[11px] text-slate-400 truncate">{{ v.area || '—' }}{{ v.purpose ? ' · ' + human(v.purpose) : '' }}</p>
                    </div>
                    <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1"
                      [class.bg-emerald-100]="v.status === 'completed'" [class.text-emerald-700]="v.status === 'completed'"
                      [class.bg-indigo-100]="v.status === 'checked_in'" [class.text-indigo-700]="v.status === 'checked_in'"
                      [class.bg-slate-100]="v.status !== 'completed' && v.status !== 'checked_in'"
                      [class.text-slate-500]="v.status !== 'completed' && v.status !== 'checked_in'">
                      <i class="pi text-[8px]" [ngClass]="v.status === 'completed' ? 'pi-check' : v.status === 'checked_in' ? 'pi-clock' : 'pi-circle'"></i>
                      {{ v.status === 'checked_in' ? 'Checked in' : v.status === 'completed' ? 'Completed' : human(v.status || 'planned') }}
                    </span>
                  </div>
                  <p class="text-[11px] text-slate-400 mt-1 tabular-nums">
                    {{ (v.checkinAt) ? 'In ' + (v.checkinAt | date:'d MMM, h:mm a') : '' }}{{ (v.checkoutAt) ? ' · Out ' + (v.checkoutAt | date:'h:mm a') : '' }}
                  </p>
                  @if (v.outcome) { <p class="text-[11px] text-slate-500 mt-0.5"><span class="font-semibold">Outcome:</span> {{ human(v.outcome) }}</p> }
                  @if (v.note) { <p class="text-[11px] text-slate-500 italic">"{{ v.note }}"</p> }
                </div>
              </div>
            } @empty {
              @if (!loading()) {
                <div class="bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-sm">
                  <i class="pi pi-calendar text-slate-300 text-3xl"></i>
                  <p class="text-sm font-semibold text-slate-600 mt-2">No visits in this range</p>
                  <p class="text-[12px] text-slate-400 mt-1">Check in on a beat customer to log your first visit.</p>
                </div>
              }
            }
          </div>
        }
      </main>

      <!-- ── COLLECT SHEET ──────────────────────────────────────── -->
      @if (collectFor(); as bill) {
        <div class="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center sm:justify-center" (click)="collectFor.set(null)">
          <div class="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5" (click)="$event.stopPropagation()">
            <div class="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-3 sm:hidden"></div>
            <h3 class="text-base font-bold mb-1 flex items-center gap-2"><i class="pi pi-wallet text-emerald-600"></i> Collect payment</h3>
            <p class="text-[12px] text-slate-400 mb-3">{{ bill.invoiceNumber || bill.invoiceNumber }} · balance ₹{{ fmt(bill.balanceDue ?? bill.balanceDue) }}</p>
            <label class="text-[11px] font-semibold text-slate-400 uppercase">Amount received</label>
            <input type="number" [(ngModel)]="colAmount" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-lg font-bold tabular-nums mb-3" />
            <label class="text-[11px] font-semibold text-slate-400 uppercase">Payment type</label>
            <div class="grid grid-cols-4 gap-1.5 mb-3 mt-1">
              @for (m of methods; track m) {
                <button (click)="colMethod.set(m)"
                  class="py-2 text-[12px] font-semibold rounded-xl border capitalize"
                  [class.bg-indigo-600]="colMethod() === m" [class.text-white]="colMethod() === m"
                  [class.border-indigo-600]="colMethod() === m" [class.border-slate-200]="colMethod() !== m">{{ m }}</button>
              }
            </div>
            @if (colMethod() === 'cheque') {
              <label class="text-[11px] font-semibold text-slate-400 uppercase">Cheque number</label>
              <input [(ngModel)]="colInstrument" placeholder="Cheque no" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-3" />
              <label class="text-[11px] font-semibold text-slate-400 uppercase">Cheque date</label>
              <input type="date" [(ngModel)]="colInstrumentDate" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-3" />
            }
            <label class="text-[11px] font-semibold text-slate-400 uppercase">Note (optional)</label>
            <input [(ngModel)]="colNote" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-4" />
            @if (sheetError()) { <p class="text-[12px] text-red-600 mb-2"><i class="pi pi-exclamation-circle text-[10px]"></i> {{ sheetError() }}</p> }
            <button (click)="submitCollect()" [disabled]="busy()"
              class="w-full bg-emerald-600 text-white font-bold rounded-xl py-3.5 disabled:opacity-50 flex items-center justify-center gap-2">
              @if (busy()) { <i class="pi pi-spin pi-spinner"></i> Saving… } @else { <i class="pi pi-check"></i> Save receipt }
            </button>
          </div>
        </div>
      }

      <!-- ── PROMISE SHEET ──────────────────────────────────────── -->
      @if (promiseSheet()) {
        <div class="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center sm:justify-center" (click)="promiseSheet.set(false)">
          <div class="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5" (click)="$event.stopPropagation()">
            <div class="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-3 sm:hidden"></div>
            <h3 class="text-base font-bold mb-1 flex items-center gap-2"><i class="pi pi-calendar-clock text-amber-500"></i> Promise to pay</h3>
            <p class="text-[12px] text-slate-400 mb-3">{{ promiseBill()?.invoiceNumber || promiseBill()?.invoiceNumber || 'On account' }}</p>
            <label class="text-[11px] font-semibold text-slate-400 uppercase">Amount promised</label>
            <input type="number" [(ngModel)]="prAmount" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-lg font-bold tabular-nums mb-3" />
            <label class="text-[11px] font-semibold text-slate-400 uppercase">Will pay on</label>
            <input type="date" [(ngModel)]="prDate" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-3" />
            <label class="text-[11px] font-semibold text-slate-400 uppercase">Note (optional)</label>
            <input [(ngModel)]="prNote" placeholder="e.g. after market day" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-4" />
            @if (sheetError()) { <p class="text-[12px] text-red-600 mb-2"><i class="pi pi-exclamation-circle text-[10px]"></i> {{ sheetError() }}</p> }
            <button (click)="submitPromise()" [disabled]="busy()"
              class="w-full bg-amber-500 text-white font-bold rounded-xl py-3.5 disabled:opacity-50 flex items-center justify-center gap-2">
              @if (busy()) { <i class="pi pi-spin pi-spinner"></i> Saving… } @else { <i class="pi pi-check"></i> Save promise }
            </button>
          </div>
        </div>
      }

      @if (toast()) {
        <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <i class="pi pi-check-circle text-emerald-400"></i> {{ toast() }}
        </div>
      }
    </div>
  `,
})
export class MySalesComponent implements OnInit {
  private readonly sfa = inject(SfaService);

  // Order & Collect are intentionally NOT top-level tabs: they're reached from the
  // checked-in card's "Take order" / "Collect" actions (and their views still render
  // for those flows), so they aren't duplicated in the tab bar.
  readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'today', label: 'Today', icon: 'pi-home' },
    { id: 'beat', label: 'Beat', icon: 'pi-directions' },
    { id: 'performance', label: 'Performance', icon: 'pi-chart-line' },
    { id: 'visits', label: 'Visits', icon: 'pi-calendar' },
  ];
  readonly methods = ['cash', 'cheque', 'upi', 'online'];

  readonly view = signal<Tab>('today');
  readonly loading = signal(false);
  readonly billsLoading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly sheetError = signal('');
  readonly toast = signal('');

  readonly me = signal<any>(null);
  readonly beat = signal<any[]>([]);
  readonly customers = signal<any[]>([]);
  readonly products = signal<any[]>([]);
  readonly visits = signal<any[]>([]);
  readonly perf = signal<any>(null);

  readonly salesman = computed(() => this.me()?.salesman);
  readonly collectedToday = computed(() => this.me()?.collectedToday);
  readonly todaySoFar = computed(() => {
    const t = this.me()?.stats?.today;
    return this.num(t?.sales) > 0 || this.num(t?.collected) > 0 || this.num(t?.visits) > 0;
  });

  // Active visit (Beat)
  readonly activeVisit = signal<any>(null);
  readonly activeCustomer = signal<any>(null);
  visitNote = '';
  checkoutOutcome = 'order_taken';

  // Order
  readonly orderCustomer = signal<any>(null);
  readonly orderLines = signal<OrderLine[]>([]);
  readonly orderResult = signal<any>(null);
  readonly orderTotal = computed(() => this.orderLines().reduce((s, l) => s + l.quantity * l.unitPrice, 0));

  // Collect
  readonly collectCustomer = signal<any>(null);
  readonly collectBills = signal<any[]>([]);
  readonly collectFor = signal<any>(null);
  readonly colMethod = signal('cash');
  colAmount: number | null = null;
  colInstrument = '';
  colInstrumentDate = '';
  colNote = '';

  // Promise
  readonly promiseSheet = signal(false);
  readonly promiseBill = signal<any>(null);
  private promiseCustomerId: string | null = null;
  prAmount: number | null = null;
  prDate = '';
  prNote = '';

  // Filters
  custQ = '';
  prodQ = '';
  perfFrom = this.daysAgo(30);
  perfTo = this.today();
  visitFrom = this.daysAgo(7);
  visitTo = this.today();

  ngOnInit() {
    this.loadMe();
  }

  refresh() {
    this.error.set('');
    const v = this.view();
    if (v === 'today') this.loadMe();
    else if (v === 'beat') this.loadBeat();
    else if (v === 'order') this.searchProducts();
    else if (v === 'performance') this.loadPerformance();
    else if (v === 'visits') this.loadVisits();
    else this.loadMe();
  }

  // ─── Data loaders ───────────────────────────────────────────────────────────
  private loadMe() {
    this.loading.set(true);
    this.sfa.appMe().subscribe({
      next: (d) => { this.me.set(d); this.loading.set(false); },
      error: (e) => { this.error.set(e?.error?.message || 'Could not load your workspace.'); this.loading.set(false); },
    });
  }

  go(t: Tab) {
    this.view.set(t);
    this.sheetError.set('');
    if (t === 'today') this.loadMe();
    if (t === 'beat' && !this.beat().length) this.loadBeat();
    if (t === 'order' && !this.products().length) this.searchProducts();
    if (t === 'performance' && !this.perf()) this.loadPerformance();
    if (t === 'visits' && !this.visits().length) this.loadVisits();
  }

  private loadBeat() {
    this.loading.set(true);
    this.sfa.appBeat().subscribe({
      next: (rows) => { this.beat.set(rows || []); this.loading.set(false); },
      error: () => { this.beat.set([]); this.loading.set(false); },
    });
  }

  searchCustomers() {
    this.sfa.appCustomers(this.custQ || undefined).subscribe({
      next: (rows) => this.customers.set(rows || []),
      error: () => this.customers.set([]),
    });
  }

  searchProducts() {
    this.sfa.appProducts(this.prodQ || undefined).subscribe({
      next: (rows) => this.products.set(rows || []),
      error: () => this.products.set([]),
    });
  }

  loadVisits() {
    this.loading.set(true);
    this.sfa.appVisits({ from: this.visitFrom || undefined, to: this.visitTo || undefined }).subscribe({
      next: (rows) => { this.visits.set(rows || []); this.loading.set(false); },
      error: () => { this.visits.set([]); this.loading.set(false); },
    });
  }

  loadPerformance() {
    this.loading.set(true);
    this.sfa.appPerformance({ from: this.perfFrom || undefined, to: this.perfTo || undefined }).subscribe({
      next: (d) => { this.perf.set(d); this.loading.set(false); },
      error: () => { this.perf.set(null); this.loading.set(false); },
    });
  }

  // ─── Today quick jumps ──────────────────────────────────────────────────────
  jumpToPromises() {
    if (!this.me()?.promisesDue?.length) return;
    const p = this.me().promisesDue[0];
    this.collectForPromise(p);
  }

  collectForPromise(p: any) {
    const id = p?.customerId || p?.customerId;
    const name = p?.customerName || p?.customerName || 'Customer';
    if (id) this.pickCollectCustomer({ id, name, outstanding: p?.amount });
    this.go('collect');
  }

  // ─── Beat: check-in / check-out ─────────────────────────────────────────────
  /** Jump to the order summary at the bottom of the Order tab. */
  scrollToCart(): void {
    document.getElementById('msCartSummary')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Same customer across beat rows / the active visit (tolerant of id vs customerId). */
  private sameCust(a: any, b: any): boolean {
    if (!a || !b) return false;
    return (a.customerId || a.id) === (b.customerId || b.id);
  }
  /** This beat card is the one currently checked in — render the visit controls inline. */
  isActiveCard(c: any): boolean { return this.sameCust(c, this.activeCustomer()); }
  /** The active visit belongs to a customer in today's beat (so it renders inline, not up top). */
  activeInBeat(): boolean {
    const ac = this.activeCustomer();
    return !!ac && this.beat().some((c) => this.sameCust(c, ac));
  }

  checkIn(c: any) {
    this.busy.set(true);
    this.sfa.appCheckin({ customerId: c.customerId || c.id, customerName: c.name }).subscribe({
      next: (v) => {
        this.busy.set(false);
        this.activeVisit.set(v);
        this.activeCustomer.set(c);
        this.visitNote = '';
        this.checkoutOutcome = 'order_taken';
        this.custQ = '';
        this.customers.set([]);
        this.showToast('Checked in · ' + (c.name || ''));
      },
      error: (e) => { this.busy.set(false); this.showToast(e?.error?.message || 'Could not check in'); },
    });
  }

  doCheckout() {
    const v = this.activeVisit();
    if (!v?.id) return;
    this.busy.set(true);
    this.sfa.appCheckout(v.id, { outcome: this.checkoutOutcome, note: this.visitNote || undefined }).subscribe({
      next: () => {
        this.busy.set(false);
        this.activeVisit.set(null);
        this.activeCustomer.set(null);
        this.showToast('Checked out');
        this.loadBeat();
        this.loadMe();
      },
      error: (e) => { this.busy.set(false); this.showToast(e?.error?.message || 'Could not check out'); },
    });
  }

  orderFromVisit() {
    const c = this.activeCustomer();
    if (c) this.pickOrderCustomer({ id: c.customerId || c.id, name: c.name });
    this.go('order');
  }

  collectFromVisit() {
    const c = this.activeCustomer();
    if (c) this.pickCollectCustomer({ id: c.customerId || c.id, name: c.name, outstanding: c.outstanding });
    this.go('collect');
  }

  // ─── Order ──────────────────────────────────────────────────────────────────
  clearOrderCustomer() {
    this.orderCustomer.set(null);
    this.orderResult.set(null);
    this.custQ = '';
    this.customers.set([]);
  }

  pickOrderCustomer(c: any) {
    this.orderCustomer.set(c);
    this.orderResult.set(null);
    this.customers.set([]);
    this.custQ = '';
    if (!this.products().length) this.searchProducts();
  }

  qtyOf(productId: string): number {
    return this.orderLines().find((l) => l.productId === productId)?.quantity || 0;
  }

  stepProduct(p: any, delta: number) {
    this.orderLines.update((ls) => {
      const i = ls.findIndex((l) => l.productId === p.id);
      if (i < 0) {
        if (delta <= 0) return ls;
        return [...ls, { productId: p.id, productName: p.name, quantity: delta, unitPrice: Number(p.price) || 0, thumbnail: p.thumbnail }];
      }
      const q = ls[i].quantity + delta;
      if (q <= 0) return ls.filter((_, x) => x !== i);
      const next = [...ls];
      next[i] = { ...next[i], quantity: q };
      return next;
    });
  }

  stepLine(l: OrderLine, delta: number) {
    this.stepProduct({ id: l.productId, name: l.productName, price: l.unitPrice, thumbnail: l.thumbnail }, delta);
  }

  setPrice(l: OrderLine, price: any) {
    const val = Number(price) || 0;
    this.orderLines.update((ls) => ls.map((x) => (x.productId === l.productId ? { ...x, unitPrice: val } : x)));
  }

  submitOrder() {
    const c = this.orderCustomer();
    if (!c?.id || !this.orderLines().length) return;
    this.busy.set(true);
    this.sheetError.set('');
    this.sfa.appTakeOrder({
      customerId: c.id,
      items: this.orderLines().map((l) => ({ productId: l.productId, productName: l.productName, quantity: l.quantity, unitPrice: l.unitPrice })),
    }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.orderResult.set(r);
        this.orderLines.set([]);
        this.showToast('Order ' + (r?.orderNumber || 'placed'));
        this.loadMe();
      },
      error: (e) => { this.busy.set(false); this.sheetError.set(e?.error?.message || 'Could not place order.'); },
    });
  }

  // ─── Collect ────────────────────────────────────────────────────────────────
  clearCollectCustomer() {
    this.collectCustomer.set(null);
    this.collectBills.set([]);
  }

  pickCollectCustomer(c: any) {
    this.collectCustomer.set(c);
    this.customers.set([]);
    this.custQ = '';
    this.collectBills.set([]);
    this.billsLoading.set(true);
    this.sfa.appCustomer(c.id).subscribe({
      next: (d) => { this.collectBills.set((d?.bills || []).filter((b: any) => Number(b.balanceDue ?? b.balanceDue) > 0)); this.billsLoading.set(false); },
      error: () => { this.collectBills.set([]); this.billsLoading.set(false); },
    });
  }

  openCollect(b: any) {
    this.collectFor.set(b);
    this.colAmount = Number(b.balanceDue ?? b.balanceDue) || null;
    this.colMethod.set('cash');
    this.colInstrument = '';
    this.colInstrumentDate = '';
    this.colNote = '';
    this.sheetError.set('');
  }

  submitCollect() {
    const b = this.collectFor();
    if (!b?.id) return;
    if (!(Number(this.colAmount) > 0)) { this.sheetError.set('Enter the amount received.'); return; }
    if (this.colMethod() === 'cheque' && !this.colInstrument.trim()) { this.sheetError.set('Cheque number is required.'); return; }
    this.busy.set(true);
    this.sfa.appCollect({
      invoiceId: b.id,
      amount: Number(this.colAmount),
      method: this.colMethod(),
      instrumentNo: this.colInstrument || undefined,
      instrumentDate: this.colInstrumentDate || undefined,
      note: this.colNote || undefined,
    }).subscribe({
      next: () => {
        this.busy.set(false);
        this.collectFor.set(null);
        this.showToast('Payment recorded');
        const c = this.collectCustomer();
        if (c) this.pickCollectCustomer(c);
        this.loadMe();
      },
      error: (e) => { this.busy.set(false); this.sheetError.set(e?.error?.message || 'Could not record payment.'); },
    });
  }

  // ─── Promise ────────────────────────────────────────────────────────────────
  openPromise(b: any) {
    this.promiseBill.set(b);
    this.promiseCustomerId = b?.customerId || b?.customerId || this.collectCustomer()?.id || null;
    this.prAmount = b ? Number(b.balanceDue ?? b.balanceDue) || null : null;
    this.prDate = '';
    this.prNote = '';
    this.sheetError.set('');
    this.promiseSheet.set(true);
  }

  submitPromise() {
    if (!this.promiseCustomerId) { this.sheetError.set('No customer selected.'); return; }
    if (!(Number(this.prAmount) > 0) || !this.prDate) { this.sheetError.set('Amount and date are required.'); return; }
    this.busy.set(true);
    this.sfa.appPromise({
      customerId: this.promiseCustomerId,
      invoiceId: this.promiseBill()?.id || undefined,
      amount: Number(this.prAmount),
      promiseDate: this.prDate,
      note: this.prNote || undefined,
    }).subscribe({
      next: () => {
        this.busy.set(false);
        this.promiseSheet.set(false);
        this.showToast('Promise saved');
        this.loadMe();
      },
      error: (e) => { this.busy.set(false); this.sheetError.set(e?.error?.message || 'Could not save promise.'); },
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  num(n: any): number { return Number(n) || 0; }

  /** Machine value → readable, e.g. "order_taken" → "Order taken". */
  human(v: any): string {
    const s = String(v ?? '').trim();
    if (!s) return '';
    return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }

  fmt(n: any) { return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  fmtQty(n: any) { return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }

  /** Compact ₹ for tight ring captions: 12.5k / 1.2L / 3.4Cr. */
  fmtShort(n: any): string {
    const v = Number(n) || 0;
    const a = Math.abs(v);
    if (a >= 1e7) return (v / 1e7).toFixed(a >= 1e8 ? 0 : 1) + 'Cr';
    if (a >= 1e5) return (v / 1e5).toFixed(a >= 1e6 ? 0 : 1) + 'L';
    if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
    return String(Math.round(v));
  }

  pct(part: any, whole: any): number {
    const w = Number(whole) || 0;
    if (w <= 0) return 0;
    return Math.min(100, Math.round(((Number(part) || 0) / w) * 100));
  }

  remaining(part: any, whole: any): number {
    const w = Number(whole) || 0;
    if (w <= 0) return 0;
    return Math.max(0, w - (Number(part) || 0));
  }

  /** SVG ring dash offset (circumference ≈ 97.4 for r=15.5). */
  ringOffset(part: any, whole: any): number {
    const CIRC = 97.4;
    return CIRC - (this.pct(part, whole) / 100) * CIRC;
  }

  /** Ring centre label — "—" when no target is set (avoids a misleading red 0%). */
  ringLabel(part: any, whole: any): string {
    return (Number(whole) || 0) <= 0 ? '—' : this.pct(part, whole) + '%';
  }

  /** Colour a ring by which metric + how close to goal (red→amber→emerald). */
  ringColor(metric: 'sales' | 'collect' | 'visits'): string {
    let p = 0, target = 0;
    const s = this.me()?.stats;
    if (metric === 'sales') { p = this.pct(s?.month?.sales, s?.target?.amount); target = Number(s?.target?.amount) || 0; }
    else if (metric === 'collect') { p = this.pct(s?.month?.collected, s?.target?.collection); target = Number(s?.target?.collection) || 0; }
    else { p = this.pct(s?.month?.visits, s?.target?.visits); target = Number(s?.target?.visits) || 0; }
    if (target <= 0) return '#cbd5e1'; // no target set — neutral, not a "failing" red
    if (p >= 100) return '#10b981'; // emerald-500
    if (p >= 60) return metric === 'collect' ? '#059669' : metric === 'visits' ? '#f59e0b' : '#6366f1';
    if (p >= 30) return '#f59e0b'; // amber-500
    return '#ef4444'; // red-500
  }

  barPct(v: any, max: number): number {
    if (!max) return 2;
    return Math.max(2, Math.round(((Number(v) || 0) / max) * 100));
  }

  maxDaySales(days: any[]): number {
    return (days || []).reduce((m, d) => Math.max(m, Number(d.sales) || 0), 0);
  }

  /** Keep the last ~14 days so the CSS bar chart stays readable. */
  lastDays(days: any[]): any[] {
    const arr = days || [];
    return arr.length > 14 ? arr.slice(-14) : arr;
  }
  firstDay(days: any[]): any { const a = this.lastDays(days); return a[0]?.day; }
  lastDay(days: any[]): any { const a = this.lastDays(days); return a[a.length - 1]?.day; }

  initials(): string {
    return this.initialsOf(this.salesman()?.name) || '👤';
  }

  initialsOf(name: any): string {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((s: string) => s[0]?.toUpperCase()).join('');
  }

  greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /** "Not visited yet" / "Today" / "Yesterday" / "3 days ago" / "12 Jun". */
  lastVisitLabel(at: any): string {
    if (!at) return 'Not visited yet';
    const d = new Date(at);
    if (isNaN(d.getTime())) return 'Not visited yet';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const that = new Date(d); that.setHours(0, 0, 0, 0);
    const days = Math.round((today.getTime() - that.getTime()) / 86400000);
    if (days <= 0) return 'Visited today';
    if (days === 1) return 'Visited yesterday';
    if (days < 30) return 'Visited ' + days + ' days ago';
    return 'Visited ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  timeShort(at: any): string {
    const d = new Date(at);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }

  /** Days a bill is past its due date (0 if not overdue / no due date). */
  billsTotal(): number { return this.collectBills().reduce((s, b) => s + (Number(b.balanceDue) || 0), 0); }
  /** Ageing of the selected customer's open bills by days overdue. */
  agingBuckets() {
    const g = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
    for (const b of this.collectBills()) {
      const amt = Number(b.balanceDue) || 0; const od = this.overdueDays(b);
      if (od <= 0) g.current += amt; else if (od <= 30) g.d1_30 += amt;
      else if (od <= 60) g.d31_60 += amt; else if (od <= 90) g.d61_90 += amt; else g.d90p += amt;
    }
    return g;
  }
  short(n: unknown): string {
    const v = Number(n) || 0, a = Math.abs(v);
    if (a >= 1e7) return (v / 1e7).toFixed(1) + 'Cr';
    if (a >= 1e5) return (v / 1e5).toFixed(1) + 'L';
    if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k';
    return String(Math.round(v));
  }
  /** Compose the customer's outstanding statement and share it on WhatsApp. */
  sendStatement() {
    const cc = this.collectCustomer(); const bills = this.collectBills();
    if (!cc || !bills.length) { this.showToast('No open bills to send'); return; }
    const phone = String(cc.phone || '').replace(/\D/g, '');
    if (!phone) { this.showToast('No phone number on file'); return; }
    const lines = bills.map((b: any) => { const od = this.overdueDays(b); return `• ${b.invoiceNumber} — ₹${this.fmt(b.balanceDue)}${od > 0 ? ` (${od}d overdue)` : ''}`; }).join('\n');
    const msg = `Hello ${cc.name}, your outstanding statement:\n\n${lines}\n\nTotal due: ₹${this.fmt(this.billsTotal())}\n\nKindly arrange payment. Thank you!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  overdueDays(b: any): number {
    const due = b?.dueDate || b?.dueDate;
    if (!due) return 0;
    const d = new Date(due);
    if (isNaN(d.getTime())) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    const days = Math.round((today.getTime() - d.getTime()) / 86400000);
    return days > 0 ? days : 0;
  }

  private showToast(msg: string) { this.toast.set(msg); setTimeout(() => this.toast.set(''), 3000); }

  private today(): string { return new Date().toISOString().slice(0, 10); }
  private daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
