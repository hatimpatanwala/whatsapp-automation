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
 * `wa-my-sales` — the field-sales workspace a SALESMAN sees after logging into
 * the portal with email/password (session-authed, not the token webview). Mobile
 * first, six sticky tabs:
 *   • Today — greeting, KPI cards, month vs target progress, promises + outstanding
 *   • Beat  — beat customers, check-in/out flow, quick jumps to order/collect
 *   • Order — pick a customer, add products, running total, place order + schemes
 *   • Collect — open bills, record cash/cheque/upi/online receipts, promise-to-pay
 *   • Performance — date range KPIs, day-wise CSS bar chart, top products
 *   • Visits — visit log with time in/out, status, outcome, note
 * All calls go through SfaService (session cookies); emitted values are used as
 * already-unwrapped data.
 */
@Component({
  selector: 'wa-my-sales',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900 pb-28">
      <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div class="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm font-bold">
            {{ initials() }}
          </div>
          <div class="min-w-0 flex-1">
            <h1 class="text-[15px] font-bold truncate leading-tight">My Sales</h1>
            <p class="text-[11px] text-gray-400 leading-tight truncate">
              {{ salesman()?.name || '…' }}{{ salesman()?.route ? ' · ' + salesman()?.route : '' }}{{ salesman()?.area ? ' · ' + salesman()?.area : '' }}
            </p>
          </div>
        </div>
        <div class="max-w-2xl mx-auto px-2 flex gap-1 overflow-x-auto no-scrollbar">
          @for (t of tabs; track t.id) {
            <button (click)="go(t.id)"
              class="px-3 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-colors"
              [class.border-indigo-600]="view() === t.id"
              [class.text-indigo-700]="view() === t.id"
              [class.border-transparent]="view() !== t.id"
              [class.text-gray-400]="view() !== t.id">{{ t.label }}</button>
          }
        </div>
      </header>

      @if (error()) {
        <div class="max-w-md mx-auto p-4">
          <div class="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p class="text-sm font-semibold text-red-800">{{ error() }}</p>
          </div>
        </div>
      }

      <main class="max-w-2xl mx-auto px-4 py-4">

        <!-- ── TODAY ──────────────────────────────────────────────── -->
        @if (view() === 'today') {
          <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
            <p class="text-[13px] text-gray-400">{{ greeting() }},</p>
            <p class="text-lg font-bold leading-tight">{{ salesman()?.name || 'there' }} 👋</p>
            <p class="text-[11px] text-gray-400 mt-0.5">Beat of {{ me()?.stats?.beatSize || 0 }} customer(s) today.</p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="bg-white rounded-2xl border border-gray-100 p-4">
              <p class="text-[11px] font-semibold text-gray-400 uppercase">Today's sales</p>
              <p class="text-xl font-bold tabular-nums mt-1">₹{{ fmt(me()?.stats?.today?.sales) }}</p>
              <p class="text-[11px] text-gray-400">{{ me()?.stats?.today?.orders || 0 }} order(s)</p>
            </div>
            <div class="bg-white rounded-2xl border border-gray-100 p-4">
              <p class="text-[11px] font-semibold text-gray-400 uppercase">Collected today</p>
              <p class="text-xl font-bold tabular-nums mt-1 text-emerald-700">₹{{ fmt(me()?.stats?.today?.collected) }}</p>
              <p class="text-[11px] text-gray-400">{{ collectedToday()?.count || 0 }} receipt(s)</p>
            </div>
            <div class="bg-white rounded-2xl border border-gray-100 p-4">
              <p class="text-[11px] font-semibold text-gray-400 uppercase">Visits today</p>
              <p class="text-xl font-bold tabular-nums mt-1">{{ me()?.stats?.today?.visits || 0 }}</p>
              <p class="text-[11px] text-gray-400">of {{ me()?.stats?.target?.visits || 0 }} target</p>
            </div>
            <div class="bg-white rounded-2xl border border-amber-200 p-4">
              <p class="text-[11px] font-semibold text-gray-400 uppercase">Market outstanding</p>
              <p class="text-xl font-bold tabular-nums mt-1 text-red-600">₹{{ fmt(me()?.pendingTotal) }}</p>
              <p class="text-[11px] text-gray-400">{{ me()?.pendingBills || 0 }} open bill(s)</p>
            </div>
          </div>

          <h2 class="text-[13px] font-bold text-gray-500 uppercase mt-5 mb-2">This month vs target</h2>
          <div class="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <div>
              <div class="flex items-baseline justify-between mb-1">
                <p class="text-[12px] font-semibold text-gray-500">Sales</p>
                <p class="text-[12px] tabular-nums">₹{{ fmt(me()?.stats?.month?.sales) }} / ₹{{ fmt(me()?.stats?.target?.amount) }}</p>
              </div>
              <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div class="h-full bg-indigo-600 rounded-full" [style.width.%]="pct(me()?.stats?.month?.sales, me()?.stats?.target?.amount)"></div>
              </div>
            </div>
            <div>
              <div class="flex items-baseline justify-between mb-1">
                <p class="text-[12px] font-semibold text-gray-500">Collection</p>
                <p class="text-[12px] tabular-nums">₹{{ fmt(me()?.stats?.month?.collected) }} / ₹{{ fmt(me()?.stats?.target?.collection) }}</p>
              </div>
              <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div class="h-full bg-emerald-600 rounded-full" [style.width.%]="pct(me()?.stats?.month?.collected, me()?.stats?.target?.collection)"></div>
              </div>
            </div>
            <div>
              <div class="flex items-baseline justify-between mb-1">
                <p class="text-[12px] font-semibold text-gray-500">Visits</p>
                <p class="text-[12px] tabular-nums">{{ me()?.stats?.month?.visits || 0 }} / {{ me()?.stats?.target?.visits || 0 }}</p>
              </div>
              <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div class="h-full bg-amber-500 rounded-full" [style.width.%]="pct(me()?.stats?.month?.visits, me()?.stats?.target?.visits)"></div>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 mt-3">
            <button (click)="go('beat')" class="bg-indigo-600 text-white rounded-2xl p-4 text-left">
              <p class="text-sm font-bold">Start visit ▸</p>
              <p class="text-[11px] opacity-80">Go to your beat</p>
            </button>
            <div class="bg-white rounded-2xl border border-amber-200 p-4">
              <p class="text-[11px] font-semibold text-gray-400 uppercase">Promises due</p>
              <p class="text-xl font-bold tabular-nums mt-1 text-amber-700">{{ me()?.promisesDue?.length || 0 }}</p>
              <p class="text-[11px] text-gray-400">follow-up(s) today</p>
            </div>
          </div>

          @if (me()?.promisesDue?.length) {
            <h2 class="text-[13px] font-bold text-gray-500 uppercase mt-5 mb-2">Promises due today</h2>
            @for (p of me()?.promisesDue || []; track $index) {
              <div class="bg-white rounded-xl border border-amber-200 p-3 mb-2 flex items-center justify-between">
                <div class="min-w-0">
                  <p class="text-sm font-semibold truncate">{{ p.customerName || p.customer_name || 'Customer' }}</p>
                  <p class="text-[11px] text-gray-400">{{ p.invoiceNumber || p.invoice_number || 'On account' }}</p>
                </div>
                <p class="text-sm font-bold tabular-nums text-amber-700">₹{{ fmt(p.amount) }}</p>
              </div>
            }
          }
        }

        <!-- ── BEAT ───────────────────────────────────────────────── -->
        @if (view() === 'beat') {
          @if (activeVisit(); as v) {
            <div class="bg-white rounded-2xl border border-emerald-300 p-4 mb-3">
              <div class="flex items-center gap-2 mb-2">
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <p class="text-sm font-bold flex-1 truncate">Checked in · {{ activeCustomer()?.name || v.customer_name || 'Customer' }}</p>
              </div>
              <textarea [(ngModel)]="visitNote" rows="2" placeholder="Visit note…"
                class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm mb-2"></textarea>
              <div class="grid grid-cols-2 gap-2 mb-2">
                <button (click)="orderFromVisit()" class="text-[13px] font-semibold bg-indigo-600 text-white rounded-xl py-2">Take order</button>
                <button (click)="collectFromVisit()" class="text-[13px] font-semibold bg-emerald-600 text-white rounded-xl py-2">Collect</button>
              </div>
              <label class="text-[11px] font-semibold text-gray-500 uppercase">Outcome</label>
              <select [(ngModel)]="checkoutOutcome" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm my-1 bg-white">
                <option value="order_taken">Order taken</option>
                <option value="payment_collected">Payment collected</option>
                <option value="no_order">No order</option>
                <option value="closed">Closed</option>
              </select>
              <button (click)="doCheckout()" [disabled]="busy()"
                class="w-full mt-2 border border-gray-300 text-gray-700 font-semibold rounded-xl py-2.5 disabled:opacity-50">
                {{ busy() ? 'Saving…' : 'Check out' }}
              </button>
            </div>
          }

          <input [(ngModel)]="custQ" (ngModelChange)="searchCustomers()" placeholder="Search a non-beat customer…"
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-2 bg-white" />
          @if (custQ && customers().length) {
            <div class="bg-white rounded-xl border border-gray-100 p-1 mb-3">
              @for (c of customers(); track c.id) {
                <button (click)="checkIn(c)" class="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg active:bg-gray-50">
                  <span class="text-[13px] font-medium truncate">{{ c.name }}</span>
                  <span class="text-[11px] text-indigo-600 font-semibold shrink-0">Check in</span>
                </button>
              }
            </div>
          }

          <h2 class="text-[13px] font-bold text-gray-500 uppercase mb-2">Today's beat</h2>
          @if (loading()) { <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">Loading…</p> }
          @for (c of beat(); track c.customer_id) {
            <div class="bg-white rounded-xl border border-gray-100 p-3 mb-2">
              <div class="flex items-center justify-between">
                <div class="min-w-0">
                  <p class="text-sm font-semibold truncate">{{ c.name }}</p>
                  <p class="text-[11px] text-gray-400">{{ c.area || '—' }}{{ c.last_visit_at ? ' · last ' + (c.last_visit_at | date:'d MMM') : ' · never visited' }}</p>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-sm font-bold tabular-nums" [class.text-red-600]="+c.outstanding > 0">₹{{ fmt(c.outstanding) }}</p>
                  <p class="text-[11px] text-gray-400">{{ c.open_bills || 0 }} bill(s)</p>
                </div>
              </div>
              <button (click)="checkIn(c)" [disabled]="busy()"
                class="w-full mt-2 text-[12px] font-semibold bg-indigo-600 text-white rounded-lg py-1.5 disabled:opacity-50">Check in</button>
            </div>
          } @empty {
            @if (!loading()) { <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">No customers on your beat today.</p> }
          }
        }

        <!-- ── ORDER ──────────────────────────────────────────────── -->
        @if (view() === 'order') {
          @if (orderCustomer(); as oc) {
            <div class="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 mb-3">
              <p class="text-[13px] font-semibold text-indigo-800 flex-1 truncate">Ordering for {{ oc.name }}</p>
              <button (click)="orderCustomer.set(null)" class="text-[11px] font-semibold text-indigo-600">Change</button>
            </div>
          } @else {
            <p class="text-[12px] font-semibold text-gray-500 mb-1">Who is this order for?</p>
            <input [(ngModel)]="custQ" (ngModelChange)="searchCustomers()" placeholder="Search customer…"
              class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-2 bg-white" />
            @for (c of customers(); track c.id) {
              <button (click)="pickOrderCustomer(c)" class="w-full text-left flex items-center justify-between bg-white rounded-lg border border-gray-100 px-3 py-2 mb-1">
                <span class="text-[13px] font-medium truncate">{{ c.name }}</span>
                <span class="text-[11px] text-gray-400 shrink-0">{{ c.phone }}</span>
              </button>
            }
          }

          @if (orderCustomer()) {
            <input [(ngModel)]="prodQ" (ngModelChange)="searchProducts()" placeholder="Search items…"
              class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm my-3 bg-white" />
            <div class="grid grid-cols-2 gap-3">
              @for (p of products(); track p.id) {
                <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
                  <div class="relative aspect-[4/3] bg-gray-50 flex items-center justify-center">
                    @if (p.thumbnail) { <img [src]="p.thumbnail" class="w-full h-full object-cover" loading="lazy" /> }
                    @else { <span class="text-gray-200 text-2xl">📦</span> }
                    @if (p.badge) { <span class="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow">{{ p.badge }}</span> }
                  </div>
                  <div class="p-2.5 flex-1 flex flex-col">
                    <p class="text-[13px] font-semibold leading-snug line-clamp-2 flex-1">{{ p.name }}</p>
                    <div class="flex items-baseline gap-1.5 mt-1">
                      <p class="text-sm font-bold tabular-nums">₹{{ fmt(p.price) }}</p>
                      @if (p.mrp && +p.mrp > +p.price) { <p class="text-[11px] text-gray-400 line-through tabular-nums">₹{{ fmt(p.mrp) }}</p> }
                    </div>
                    @if (qtyOf(p.id); as q) {
                      <div class="flex items-center gap-1 mt-2">
                        <button (click)="stepProduct(p, -1)" class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 font-bold">−</button>
                        <span class="flex-1 text-center text-sm font-bold tabular-nums">{{ q }}</span>
                        <button (click)="stepProduct(p, 1)" class="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold">+</button>
                      </div>
                    } @else {
                      <button (click)="stepProduct(p, 1)" class="mt-2 w-full py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-bold">+ Add</button>
                    }
                  </div>
                </div>
              } @empty { <p class="col-span-2 text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">No items found.</p> }
            </div>

            @if (orderLines().length) {
              <h2 class="text-[13px] font-bold text-gray-500 uppercase mt-5 mb-2">Order lines</h2>
              <div class="bg-white rounded-2xl border border-gray-100 p-3">
                @for (l of orderLines(); track l.productId) {
                  <div class="flex items-center gap-2 mb-2">
                    <div class="flex-1 min-w-0">
                      <p class="text-[13px] font-medium truncate">{{ l.productName }}</p>
                      <div class="flex items-center gap-1 mt-0.5">
                        <span class="text-[11px] text-gray-400">₹</span>
                        <input type="number" [ngModel]="l.unitPrice" (ngModelChange)="setPrice(l, $event)"
                          class="w-20 rounded-lg border border-gray-200 px-2 py-1 text-[12px] tabular-nums" />
                        <span class="text-[11px] text-gray-400 tabular-nums">× {{ l.quantity }} = ₹{{ fmt(l.unitPrice * l.quantity) }}</span>
                      </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <button (click)="stepLine(l, -1)" class="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-sm">−</button>
                      <span class="w-7 text-center text-sm font-bold tabular-nums">{{ l.quantity }}</span>
                      <button (click)="stepLine(l, 1)" class="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold text-sm">+</button>
                    </div>
                  </div>
                }
                <div class="flex items-center justify-between border-t border-gray-100 pt-2 mt-1">
                  <p class="text-[13px] font-bold">Total</p>
                  <p class="text-base font-bold tabular-nums">₹{{ fmt(orderTotal()) }}</p>
                </div>
              </div>

              @if (orderResult(); as r) {
                <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mt-3">
                  <p class="text-[13px] font-bold text-emerald-800">✅ Order {{ r.orderNumber || 'placed' }}</p>
                  @if (r.schemeDiscount) { <p class="text-[12px] text-emerald-700">Scheme discount ₹{{ fmt(r.schemeDiscount) }}</p> }
                  @for (s of r.appliedSchemes || []; track $index) { <p class="text-[11px] text-emerald-700">{{ s.name || s.label || s }}</p> }
                  @for (f of r.freeItems || []; track $index) { <p class="text-[11px] text-emerald-700">+ {{ f.quantity }} × {{ f.name || f.productName }} FREE</p> }
                </div>
              }
              @if (sheetError()) { <p class="text-[12px] text-red-600 mt-2">{{ sheetError() }}</p> }
              <button (click)="submitOrder()" [disabled]="busy()"
                class="mt-3 w-full bg-indigo-600 text-white font-bold rounded-xl py-3 disabled:opacity-50">
                {{ busy() ? 'Placing…' : 'Place order · ₹' + fmt(orderTotal()) }}
              </button>
            }
          }
        }

        <!-- ── COLLECT ────────────────────────────────────────────── -->
        @if (view() === 'collect') {
          @if (collectCustomer(); as cc) {
            <div class="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 mb-3">
              <p class="text-[13px] font-semibold text-indigo-800 flex-1 truncate">{{ cc.name }}</p>
              <button (click)="collectCustomer.set(null); collectBills.set([])" class="text-[11px] font-semibold text-indigo-600">Change</button>
            </div>
          } @else {
            <p class="text-[12px] font-semibold text-gray-500 mb-1">Collect from which customer?</p>
            <input [(ngModel)]="custQ" (ngModelChange)="searchCustomers()" placeholder="Search customer…"
              class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-2 bg-white" />
            @for (c of customers(); track c.id) {
              <button (click)="pickCollectCustomer(c)" class="w-full text-left flex items-center justify-between bg-white rounded-lg border border-gray-100 px-3 py-2 mb-1">
                <span class="text-[13px] font-medium truncate">{{ c.name }}</span>
                <span class="text-sm font-bold tabular-nums shrink-0" [class.text-red-600]="+c.outstanding > 0">₹{{ fmt(c.outstanding) }}</span>
              </button>
            }
          }

          @if (collectCustomer()) {
            <h2 class="text-[13px] font-bold text-gray-500 uppercase mb-2">Open bills</h2>
            @for (b of collectBills(); track b.id) {
              <div class="bg-white rounded-xl border border-gray-100 p-3 mb-2">
                <div class="flex items-center justify-between">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ b.invoice_number || b.invoiceNumber }}</p>
                    <p class="text-[11px] text-gray-400">{{ (b.issued_at || b.issuedAt) | date:'d MMM yy' }}{{ (b.due_date || b.dueDate) ? ' · due ' + ((b.due_date || b.dueDate) | date:'d MMM') : '' }}</p>
                  </div>
                  <p class="text-sm font-bold tabular-nums text-red-600 shrink-0">₹{{ fmt(b.balance_due ?? b.balanceDue) }}</p>
                </div>
                <div class="flex gap-2 mt-2">
                  <button (click)="openCollect(b)" class="flex-1 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg py-1.5">₹ Collect</button>
                  <button (click)="openPromise(b)" class="text-[12px] font-semibold text-amber-700 border border-amber-300 rounded-lg px-3">Promise</button>
                </div>
              </div>
            } @empty { <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">No open bills. 🎉</p> }

            <button (click)="openPromise(null)" class="w-full mt-2 text-[13px] font-semibold border border-amber-300 text-amber-700 rounded-xl py-2.5">+ Promise to pay (on account)</button>
          }
        }

        <!-- ── PERFORMANCE ────────────────────────────────────────── -->
        @if (view() === 'performance') {
          <div class="flex items-end gap-2 mb-3">
            <div class="flex-1">
              <label class="text-[11px] font-semibold text-gray-500 uppercase">From</label>
              <input type="date" [(ngModel)]="perfFrom" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white" />
            </div>
            <div class="flex-1">
              <label class="text-[11px] font-semibold text-gray-500 uppercase">To</label>
              <input type="date" [(ngModel)]="perfTo" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white" />
            </div>
            <button (click)="loadPerformance()" class="bg-indigo-600 text-white text-[13px] font-semibold rounded-xl px-4 py-2">Go</button>
          </div>

          @if (perf(); as pf) {
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-white rounded-2xl border border-gray-100 p-4">
                <p class="text-[11px] font-semibold text-gray-400 uppercase">Order value</p>
                <p class="text-xl font-bold tabular-nums mt-1">₹{{ fmt(pf.summary?.order_value) }}</p>
                <p class="text-[11px] text-gray-400">{{ pf.summary?.orders || 0 }} order(s)</p>
              </div>
              <div class="bg-white rounded-2xl border border-gray-100 p-4">
                <p class="text-[11px] font-semibold text-gray-400 uppercase">Collected</p>
                <p class="text-xl font-bold tabular-nums mt-1 text-emerald-700">₹{{ fmt(pf.summary?.collected) }}</p>
                <p class="text-[11px] text-gray-400">{{ pf.summary?.visits || 0 }} visit(s)</p>
              </div>
            </div>

            @if (pf.dayWise?.length) {
              <h2 class="text-[13px] font-bold text-gray-500 uppercase mt-5 mb-2">Sales by day</h2>
              <div class="bg-white rounded-2xl border border-gray-100 p-4">
                <div class="flex items-end gap-1 h-32">
                  @for (d of pf.dayWise; track $index) {
                    <div class="flex-1 flex flex-col items-center justify-end h-full" [title]="(d.day | date:'d MMM') + ' · ₹' + fmt(d.sales)">
                      <div class="w-full bg-indigo-500 rounded-t" [style.height.%]="barPct(d.sales, maxDaySales(pf.dayWise))"></div>
                    </div>
                  }
                </div>
                <div class="flex justify-between mt-1 text-[10px] text-gray-400">
                  <span>{{ pf.dayWise[0]?.day | date:'d MMM' }}</span>
                  <span>{{ pf.dayWise[pf.dayWise.length - 1]?.day | date:'d MMM' }}</span>
                </div>
              </div>
            }

            @if (pf.topProducts?.length) {
              <h2 class="text-[13px] font-bold text-gray-500 uppercase mt-5 mb-2">Top products</h2>
              @for (tp of pf.topProducts; track $index) {
                <div class="bg-white rounded-xl border border-gray-100 p-3 mb-2 flex items-center justify-between">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ tp.product_name }}</p>
                    <p class="text-[11px] text-gray-400 tabular-nums">{{ fmtQty(tp.qty) }} sold</p>
                  </div>
                  <p class="text-sm font-bold tabular-nums shrink-0">₹{{ fmt(tp.value) }}</p>
                </div>
              }
            }
          } @else if (!loading()) {
            <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">Pick a range and tap Go.</p>
          }
        }

        <!-- ── VISITS ─────────────────────────────────────────────── -->
        @if (view() === 'visits') {
          <div class="flex items-end gap-2 mb-3">
            <div class="flex-1">
              <label class="text-[11px] font-semibold text-gray-500 uppercase">From</label>
              <input type="date" [(ngModel)]="visitFrom" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white" />
            </div>
            <div class="flex-1">
              <label class="text-[11px] font-semibold text-gray-500 uppercase">To</label>
              <input type="date" [(ngModel)]="visitTo" class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white" />
            </div>
            <button (click)="loadVisits()" class="bg-indigo-600 text-white text-[13px] font-semibold rounded-xl px-4 py-2">Go</button>
          </div>

          @for (v of visits(); track v.id) {
            <div class="bg-white rounded-xl border border-gray-100 p-3 mb-2">
              <div class="flex items-center justify-between">
                <div class="min-w-0">
                  <p class="text-sm font-semibold truncate">{{ v.customer_name || 'Customer' }}</p>
                  <p class="text-[11px] text-gray-400">{{ v.area || '—' }}{{ v.purpose ? ' · ' + v.purpose : '' }}</p>
                </div>
                <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-lg"
                  [class.bg-emerald-100]="v.status === 'completed'" [class.text-emerald-700]="v.status === 'completed'"
                  [class.bg-indigo-100]="v.status === 'in_progress'" [class.text-indigo-700]="v.status === 'in_progress'"
                  [class.bg-gray-100]="v.status !== 'completed' && v.status !== 'in_progress'"
                  [class.text-gray-500]="v.status !== 'completed' && v.status !== 'in_progress'">{{ v.status || 'planned' }}</span>
              </div>
              <p class="text-[11px] text-gray-400 mt-1">
                {{ v.checkin_at ? 'In ' + (v.checkin_at | date:'d MMM, h:mm a') : '' }}{{ v.checkout_at ? ' · Out ' + (v.checkout_at | date:'h:mm a') : '' }}
              </p>
              @if (v.outcome) { <p class="text-[11px] text-gray-500 mt-0.5">Outcome: {{ v.outcome }}</p> }
              @if (v.note) { <p class="text-[11px] text-gray-500">{{ v.note }}</p> }
            </div>
          } @empty {
            @if (!loading()) { <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">No visits in this range.</p> }
          }
        }
      </main>

      <!-- ── COLLECT SHEET ──────────────────────────────────────── -->
      @if (collectFor(); as bill) {
        <div class="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center sm:justify-center" (click)="collectFor.set(null)">
          <div class="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5" (click)="$event.stopPropagation()">
            <h3 class="text-base font-bold mb-1">Collect payment</h3>
            <p class="text-[12px] text-gray-400 mb-3">{{ bill.invoice_number || bill.invoiceNumber }} · balance ₹{{ fmt(bill.balance_due ?? bill.balanceDue) }}</p>
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Amount</label>
            <input type="number" [(ngModel)]="colAmount" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3" />
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Payment type</label>
            <div class="grid grid-cols-4 gap-1.5 mb-3 mt-1">
              @for (m of methods; track m) {
                <button (click)="colMethod.set(m)"
                  class="py-2 text-[12px] font-semibold rounded-xl border"
                  [class.bg-indigo-600]="colMethod() === m" [class.text-white]="colMethod() === m"
                  [class.border-indigo-600]="colMethod() === m" [class.border-gray-200]="colMethod() !== m">{{ m | titlecase }}</button>
              }
            </div>
            @if (colMethod() === 'cheque') {
              <label class="text-[11px] font-semibold text-gray-500 uppercase">Cheque number</label>
              <input [(ngModel)]="colInstrument" placeholder="6-digit cheque no" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3" />
              <label class="text-[11px] font-semibold text-gray-500 uppercase">Cheque date</label>
              <input type="date" [(ngModel)]="colInstrumentDate" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3" />
            }
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Note (optional)</label>
            <input [(ngModel)]="colNote" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-4" />
            @if (sheetError()) { <p class="text-[12px] text-red-600 mb-2">{{ sheetError() }}</p> }
            <button (click)="submitCollect()" [disabled]="busy()"
              class="w-full bg-emerald-600 text-white font-bold rounded-xl py-3 disabled:opacity-50">
              {{ busy() ? 'Saving…' : 'Save receipt' }}
            </button>
          </div>
        </div>
      }

      <!-- ── PROMISE SHEET ──────────────────────────────────────── -->
      @if (promiseSheet()) {
        <div class="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center sm:justify-center" (click)="promiseSheet.set(false)">
          <div class="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5" (click)="$event.stopPropagation()">
            <h3 class="text-base font-bold mb-1">Promise to pay</h3>
            <p class="text-[12px] text-gray-400 mb-3">{{ promiseBill()?.invoice_number || promiseBill()?.invoiceNumber || 'On account' }}</p>
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Amount</label>
            <input type="number" [(ngModel)]="prAmount" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3" />
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Will pay on</label>
            <input type="date" [(ngModel)]="prDate" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3" />
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Note (optional)</label>
            <input [(ngModel)]="prNote" placeholder="e.g. after market day" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-4" />
            @if (sheetError()) { <p class="text-[12px] text-red-600 mb-2">{{ sheetError() }}</p> }
            <button (click)="submitPromise()" [disabled]="busy()"
              class="w-full bg-amber-500 text-white font-bold rounded-xl py-3 disabled:opacity-50">
              {{ busy() ? 'Saving…' : 'Save promise' }}
            </button>
          </div>
        </div>
      }

      @if (toast()) {
        <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          {{ toast() }}
        </div>
      }
    </div>
  `,
})
export class MySalesComponent implements OnInit {
  private readonly sfa = inject(SfaService);

  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'today', label: '🏠 Today' },
    { id: 'beat', label: '🚶 Beat' },
    { id: 'order', label: '🛒 Order' },
    { id: 'collect', label: '₹ Collect' },
    { id: 'performance', label: '📈 Performance' },
    { id: 'visits', label: '📅 Visits' },
  ];
  readonly methods = ['cash', 'cheque', 'upi', 'online'];

  readonly view = signal<Tab>('today');
  readonly loading = signal(false);
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

  // ─── Beat: check-in / check-out ─────────────────────────────────────────────
  checkIn(c: any) {
    this.busy.set(true);
    this.sfa.appCheckin({ customerId: c.customer_id || c.id, customerName: c.name }).subscribe({
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
    if (c) this.pickOrderCustomer({ id: c.customer_id || c.id, name: c.name });
    this.go('order');
  }

  collectFromVisit() {
    const c = this.activeCustomer();
    if (c) this.pickCollectCustomer({ id: c.customer_id || c.id, name: c.name, outstanding: c.outstanding });
    this.go('collect');
  }

  // ─── Order ──────────────────────────────────────────────────────────────────
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
        this.showToast('✅ Order ' + (r?.orderNumber || 'placed'));
        this.loadMe();
      },
      error: (e) => { this.busy.set(false); this.sheetError.set(e?.error?.message || 'Could not place order.'); },
    });
  }

  // ─── Collect ────────────────────────────────────────────────────────────────
  pickCollectCustomer(c: any) {
    this.collectCustomer.set(c);
    this.customers.set([]);
    this.custQ = '';
    this.collectBills.set([]);
    this.sfa.appCustomer(c.id).subscribe({
      next: (d) => this.collectBills.set((d?.bills || []).filter((b: any) => Number(b.balance_due ?? b.balanceDue) > 0)),
      error: () => this.collectBills.set([]),
    });
  }

  openCollect(b: any) {
    this.collectFor.set(b);
    this.colAmount = Number(b.balance_due ?? b.balanceDue) || null;
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
        this.showToast('✅ Payment recorded');
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
    this.promiseCustomerId = b?.customer_id || b?.customerId || this.collectCustomer()?.id || null;
    this.prAmount = b ? Number(b.balance_due ?? b.balanceDue) || null : null;
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
        this.showToast('📅 Promise saved');
        this.loadMe();
      },
      error: (e) => { this.busy.set(false); this.sheetError.set(e?.error?.message || 'Could not save promise.'); },
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  fmt(n: any) { return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  fmtQty(n: any) { return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }

  pct(part: any, whole: any): number {
    const w = Number(whole) || 0;
    if (w <= 0) return 0;
    return Math.min(100, Math.round(((Number(part) || 0) / w) * 100));
  }

  barPct(v: any, max: number): number {
    if (!max) return 2;
    return Math.max(2, Math.round(((Number(v) || 0) / max) * 100));
  }

  maxDaySales(days: any[]): number {
    return (days || []).reduce((m, d) => Math.max(m, Number(d.sales) || 0), 0);
  }

  initials(): string {
    const name = this.salesman()?.name || '';
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s: string) => s[0]?.toUpperCase()).join('') || '👤';
  }

  greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  private showToast(msg: string) { this.toast.set(msg); setTimeout(() => this.toast.set(''), 3000); }

  private today(): string { return new Date().toISOString().slice(0, 10); }
  private daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
