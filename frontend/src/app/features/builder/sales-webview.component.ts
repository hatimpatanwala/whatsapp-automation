import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';

type Tab = 'home' | 'catalog' | 'offers' | 'customers' | 'pending' | 'followups' | 'beat' | 'visits' | 'perf';

const unwrap = <T>(r: any): T => (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;

/**
 * Salesman field app (`/m/sales`) — token-secured WhatsApp webview. The admin
 * shares a wa.me link; the salesman opens it inside WhatsApp and can: browse the
 * product catalog (images, MRP, wholesale, stock, live scheme badges), pitch the
 * running offers, build an order for a customer with automatic scheme savings,
 * see pending bills, collect payments (cash / cheque no+date / UPI / online) and
 * record promise-to-pay follow-ups when the customer can't pay today.
 */
@Component({
  selector: 'wa-sales-webview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-slate-50 text-slate-900 pb-28">
      <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-100 shadow-sm">
        <div class="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-indigo-200">
            <i class="pi pi-briefcase" style="font-size:1.05rem"></i>
          </div>
          <div class="min-w-0 flex-1">
            <h1 class="text-[15px] font-bold truncate leading-tight">Sales App</h1>
            <p class="text-[11px] text-slate-400 leading-tight truncate">{{ me()?.name || '…' }} {{ me()?.route ? '· ' + me()?.route : '' }}</p>
          </div>
          @if (authed()) {
            <div class="text-right shrink-0">
              <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Today</p>
              <p class="text-[12px] font-bold tabular-nums text-emerald-600">₹{{ fmtShort(home()?.collectedToday?.amount) }} in</p>
            </div>
          }
        </div>
        @if (authed()) {
          <div class="max-w-2xl mx-auto px-2 pb-1.5 flex gap-1 overflow-x-auto no-scrollbar">
            @for (t of tabs; track t.id) {
              <button (click)="go(t.id)"
                class="px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap rounded-full transition-colors"
                [class.bg-indigo-600]="view() === t.id"
                [class.text-white]="view() === t.id"
                [class.shadow-sm]="view() === t.id"
                [class.text-slate-400]="view() !== t.id"
                [class.hover:bg-slate-100]="view() !== t.id">{{ t.label }}</button>
            }
          </div>
        }
      </header>

      @if (loadError()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.6rem"></i>
            <p class="text-sm font-bold text-red-800">{{ loadError() }}</p>
            <p class="text-xs text-red-500 mt-1.5">This link may have expired. Ask your manager to share a fresh WhatsApp link and try again.</p>
          </div>
        </div>
      } @else if (!authed()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <i class="pi pi-spin pi-spinner text-indigo-400 mb-3" style="font-size:1.6rem"></i>
            <p class="text-sm font-semibold text-slate-500">Opening your sales app…</p>
          </div>
        </div>
      } @else if (authed()) {
        <main class="max-w-2xl mx-auto px-4 py-4">

          <!-- ── HOME · day at a glance ───────────────────────────── -->
          @if (view() === 'home') {
            <!-- Greeting -->
            <div class="flex items-baseline justify-between mb-3">
              <h2 class="text-lg font-bold">{{ greeting() }}, {{ (me()?.name || '').split(' ')[0] || 'there' }} 👋</h2>
            </div>

            <!-- Target progress card -->
            @if (stats(); as st) {
              <div class="bg-white rounded-2xl border border-slate-100 p-4 mb-3 space-y-4">
                <div class="flex items-center justify-between">
                  <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Your month vs target</p>
                  <span class="text-[11px] font-semibold text-slate-400">Day at a glance</span>
                </div>

                <!-- Sales -->
                <div>
                  <div class="flex items-baseline justify-between mb-1">
                    <span class="text-[13px] font-semibold text-slate-700">Sales</span>
                    <span class="text-[12px] tabular-nums text-slate-400">₹{{ fmtShort(st.month?.sales) }} / ₹{{ fmtShort(st.target?.amount) }}</span>
                  </div>
                  <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all" [style.width.%]="pct(st.month?.sales, st.target?.amount)"></div>
                  </div>
                  <p class="text-[11px] mt-1" [class.text-emerald-600]="hit(st.month?.sales, st.target?.amount)" [class.text-slate-400]="!hit(st.month?.sales, st.target?.amount)">
                    @if (hit(st.month?.sales, st.target?.amount)) { 🎉 Target smashed! }
                    @else if (st.target?.amount) { {{ pct(st.month?.sales, st.target?.amount) }}% done · ₹{{ fmtShort(remaining(st.month?.sales, st.target?.amount)) }} to go }
                    @else { No target set }
                  </p>
                </div>

                <!-- Collection -->
                <div>
                  <div class="flex items-baseline justify-between mb-1">
                    <span class="text-[13px] font-semibold text-slate-700">Collection</span>
                    <span class="text-[12px] tabular-nums text-slate-400">₹{{ fmtShort(st.month?.collected) }} / ₹{{ fmtShort(st.target?.collection) }}</span>
                  </div>
                  <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all" [style.width.%]="pct(st.month?.collected, st.target?.collection)"></div>
                  </div>
                  <p class="text-[11px] mt-1" [class.text-emerald-600]="hit(st.month?.collected, st.target?.collection)" [class.text-slate-400]="!hit(st.month?.collected, st.target?.collection)">
                    @if (hit(st.month?.collected, st.target?.collection)) { 🎉 Fully collected! }
                    @else if (st.target?.collection) { {{ pct(st.month?.collected, st.target?.collection) }}% done · ₹{{ fmtShort(remaining(st.month?.collected, st.target?.collection)) }} to go }
                    @else { No target set }
                  </p>
                </div>

                <!-- Visits -->
                <div>
                  <div class="flex items-baseline justify-between mb-1">
                    <span class="text-[13px] font-semibold text-slate-700">Visits</span>
                    <span class="text-[12px] tabular-nums text-slate-400">{{ st.month?.visits || 0 }} / {{ st.target?.visits || 0 }}</span>
                  </div>
                  <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all" [style.width.%]="pct(st.month?.visits, st.target?.visits)"></div>
                  </div>
                  <p class="text-[11px] mt-1" [class.text-emerald-600]="hit(st.month?.visits, st.target?.visits)" [class.text-slate-400]="!hit(st.month?.visits, st.target?.visits)">
                    @if (hit(st.month?.visits, st.target?.visits)) { 🎉 All visits done! }
                    @else if (st.target?.visits) { {{ remaining(st.month?.visits, st.target?.visits) }} more visit(s) this month }
                    @else { No target set }
                  </p>
                </div>
              </div>
            }

            <!-- Today's three numbers -->
            <div class="grid grid-cols-3 gap-2 mb-3">
              <div class="bg-white rounded-2xl border border-slate-100 p-3 text-center">
                <p class="text-[10px] font-semibold text-slate-400 uppercase">Sold today</p>
                <p class="text-base font-bold tabular-nums mt-0.5">₹{{ fmtShort(stats()?.today?.sales) }}</p>
                <p class="text-[10px] text-slate-400">{{ stats()?.today?.orders || 0 }} order(s)</p>
              </div>
              <div class="bg-white rounded-2xl border border-slate-100 p-3 text-center">
                <p class="text-[10px] font-semibold text-slate-400 uppercase">Collected</p>
                <p class="text-base font-bold tabular-nums mt-0.5 text-emerald-700">₹{{ fmtShort(home()?.collectedToday?.amount) }}</p>
                <p class="text-[10px] text-slate-400">{{ home()?.collectedToday?.count || 0 }} receipt(s)</p>
              </div>
              <div class="bg-white rounded-2xl border border-slate-100 p-3 text-center">
                <p class="text-[10px] font-semibold text-slate-400 uppercase">Visits</p>
                <p class="text-base font-bold tabular-nums mt-0.5">{{ stats()?.today?.visits || 0 }}</p>
                <p class="text-[10px] text-slate-400">today</p>
              </div>
            </div>

            <!-- Market outstanding -->
            <button (click)="go('pending')" class="w-full text-left bg-white rounded-2xl border border-slate-100 p-4 mb-3 flex items-center justify-between active:bg-slate-50">
              <div>
                <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Money in the market</p>
                <p class="text-xl font-bold tabular-nums mt-1" [class.text-red-600]="+(home()?.pendingTotal || 0) > 0">₹{{ fmt(home()?.pendingTotal) }}</p>
                <p class="text-[11px] text-slate-400">{{ home()?.pendingBills || 0 }} open bill(s) to collect</p>
              </div>
              <i class="pi pi-angle-right text-slate-300" style="font-size:1.2rem"></i>
            </button>

            <!-- Primary actions -->
            <div class="grid grid-cols-2 gap-3 mb-1">
              <button (click)="go('catalog')" class="bg-gradient-to-br from-indigo-600 to-indigo-500 text-white rounded-2xl p-4 text-left shadow-sm shadow-indigo-200 active:scale-[0.98] transition-transform">
                <i class="pi pi-shopping-bag" style="font-size:1.1rem"></i>
                <p class="text-sm font-bold mt-1.5">Take an order</p>
                <p class="text-[11px] opacity-80">Browse items, build the cart</p>
              </button>
              <button (click)="go('beat')" class="bg-gradient-to-br from-emerald-600 to-emerald-500 text-white rounded-2xl p-4 text-left shadow-sm shadow-emerald-200 active:scale-[0.98] transition-transform">
                <i class="pi pi-map-marker" style="font-size:1.1rem"></i>
                <p class="text-sm font-bold mt-1.5">Visit my beat</p>
                <p class="text-[11px] opacity-90">Check in at your shops</p>
              </button>
            </div>
            <button (click)="go('offers')" class="w-full mt-3 bg-amber-500 text-white rounded-2xl p-3.5 text-left flex items-center gap-3 active:scale-[0.99] transition-transform">
              <i class="pi pi-percentage" style="font-size:1.2rem"></i>
              <div class="flex-1">
                <p class="text-sm font-bold">Running offers to pitch</p>
                <p class="text-[11px] opacity-90">{{ schemes().length || 0 }} scheme(s) live right now</p>
              </div>
              <i class="pi pi-angle-right opacity-80"></i>
            </button>

            <!-- Promises due today -->
            <div class="flex items-center justify-between mt-5 mb-2">
              <h2 class="text-[13px] font-bold text-slate-500 uppercase tracking-wide">Promises due today</h2>
              @if (home()?.promisesDue?.length) {
                <button (click)="go('followups')" class="text-[12px] font-semibold text-indigo-600">See all ›</button>
              }
            </div>
            @if (!home()?.promisesDue?.length) {
              <div class="bg-white rounded-2xl border border-slate-100 p-5 text-center">
                <p class="text-2xl mb-1">🎉</p>
                <p class="text-sm font-semibold text-slate-600">No promises due today</p>
                <p class="text-[12px] text-slate-400 mt-0.5">Head to your beat and take fresh orders.</p>
              </div>
            }
            @for (p of home()?.promisesDue || []; track p.id) {
              <div class="bg-white rounded-2xl border border-amber-200 p-3.5 mb-2">
                <div class="flex items-center justify-between">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ p.customerName }}</p>
                    <p class="text-[11px] text-slate-400">{{ p.invoiceNumber || 'On account' }} · promised {{ p.promiseDate | date:'d MMM' }}</p>
                  </div>
                  <p class="text-base font-bold tabular-nums text-amber-700">₹{{ fmt(p.amount) }}</p>
                </div>
                <div class="flex gap-2 mt-2.5">
                  <button (click)="openCollectForPromise(p)" class="flex-1 text-[13px] font-bold bg-emerald-600 text-white rounded-xl py-2 active:bg-emerald-700">₹ Collect now</button>
                  <button (click)="markPromise(p, 'broken')" class="text-[13px] font-semibold text-red-600 border border-red-200 rounded-xl px-4">Not paid</button>
                </div>
              </div>
            }
          }

          <!-- ── CATALOG ──────────────────────────────────────────── -->
          @if (view() === 'catalog') {
            @if (editTarget()) {
              <div class="flex items-center gap-2 bg-emerald-50 border border-emerald-300 rounded-xl px-3 py-2 mb-3">
                <i class="pi pi-whatsapp text-emerald-600 text-sm"></i>
                <p class="text-[13px] font-semibold text-emerald-800 flex-1 truncate">Editing {{ editTarget()?.name }}'s WhatsApp cart</p>
                <button (click)="stopEditingCart()" class="text-[11px] font-semibold text-emerald-700 border border-emerald-300 rounded-lg px-2 py-0.5">Done</button>
              </div>
            } @else if (cartCustomer()) {
              <div class="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 mb-3">
                <i class="pi pi-user text-indigo-500 text-sm"></i>
                <p class="text-[13px] font-semibold text-indigo-800 flex-1 truncate">Ordering for {{ cartCustomer()?.name }}</p>
                <button (click)="cartCustomer.set(null)" class="text-[11px] font-semibold text-indigo-600">Change</button>
              </div>
            }
            <div class="relative mb-3">
              <i class="pi pi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></i>
              <input [(ngModel)]="prodQ" (ngModelChange)="searchProducts()" placeholder="Search items / barcode…"
                class="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2.5 text-sm bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              @for (p of products(); track p.id) {
                <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden flex flex-col">
                  <div class="relative aspect-[4/3] bg-slate-50 flex items-center justify-center">
                    @if (p.thumbnail) {
                      <img [src]="p.thumbnail" class="w-full h-full object-cover" loading="lazy" />
                    } @else {
                      <i class="pi pi-box text-slate-200" style="font-size:2rem"></i>
                    }
                    @if (p.badge) {
                      <span class="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow">{{ p.badge }}</span>
                    }
                    <span class="absolute bottom-1.5 right-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                      [class.bg-emerald-100]="+p.stock > 0" [class.text-emerald-700]="+p.stock > 0"
                      [class.bg-red-100]="+p.stock <= 0" [class.text-red-600]="+p.stock <= 0">
                      {{ +p.stock > 0 ? fmtQty(p.stock) + ' ' + (p.uom || '') : 'No stock' }}
                    </span>
                  </div>
                  <div class="p-2.5 flex-1 flex flex-col">
                    <p class="text-[13px] font-semibold leading-snug line-clamp-2 flex-1">{{ p.name }}</p>
                    <div class="flex items-baseline gap-1.5 mt-1 flex-wrap">
                      <p class="text-sm font-bold tabular-nums">₹{{ fmt(p.price) }}</p>
                      @if (p.mrp && +p.mrp > +p.price) {
                        <p class="text-[11px] text-slate-400 line-through tabular-nums">₹{{ fmt(p.mrp) }}</p>
                        <span class="text-[9px] font-bold text-emerald-700 bg-emerald-50 rounded px-1 py-0.5">{{ discountPct(p.price, p.mrp) }}% off</span>
                      }
                    </div>
                    @if (p.wholesalePrice && p.wholesaleMinQty) {
                      <p class="text-[10px] text-indigo-600">₹{{ fmt(p.wholesalePrice) }} for {{ fmtQty(p.wholesaleMinQty) }}+</p>
                    }
                    @for (o of p.offers || []; track o.id) {
                      <p class="text-[10px] text-amber-700 font-semibold leading-tight">🎁 {{ o.benefit }}</p>
                    }
                    @if (qtyOf(p.id); as q) {
                      <div class="flex items-center gap-1 mt-2">
                        <button (click)="step(p, -1)" class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 font-bold">−</button>
                        <span class="flex-1 text-center text-sm font-bold tabular-nums">{{ q }}</span>
                        <button (click)="step(p, 1)" class="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold">+</button>
                      </div>
                    } @else {
                      <button (click)="step(p, 1)" class="mt-2 w-full py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-bold">+ Add</button>
                    }
                  </div>
                </div>
              } @empty {
                <div class="col-span-2 bg-white rounded-2xl border border-slate-100 p-6 text-center">
                  <i class="pi pi-box text-slate-200 mb-2" style="font-size:1.8rem"></i>
                  <p class="text-sm font-semibold text-slate-500">{{ prodQ ? 'No items match "' + prodQ + '"' : 'No items to show yet' }}</p>
                  <p class="text-[12px] text-slate-400 mt-0.5">{{ prodQ ? 'Try a shorter word or the barcode.' : 'Pull down to refresh, or ask your manager to add products.' }}</p>
                </div>
              }
            </div>
          }

          <!-- ── OFFERS ───────────────────────────────────────────── -->
          @if (view() === 'offers') {
            @for (s of schemes(); track s.id) {
              <div class="bg-white rounded-2xl border border-amber-200 p-4 mb-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-bold">{{ s.name }}</p>
                    @if (s.description) { <p class="text-[12px] text-slate-500 mt-0.5">{{ s.description }}</p> }
                  </div>
                  <span class="shrink-0 bg-amber-500 text-white text-[11px] font-bold px-2 py-1 rounded-lg">{{ s.benefit }}</span>
                </div>
                <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
                  <span><i class="pi pi-tag text-[10px]"></i> On {{ s.appliesTo }}</span>
                  @if (s.minQty) { <span>Min qty {{ s.minQty }}</span> }
                  @if (s.minCartValue) { <span>Orders above ₹{{ fmt(s.minCartValue) }}</span> }
                  @if (s.validUntil) { <span>Till {{ s.validUntil | date:'d MMM' }}</span> }
                  @if (s.combinable) { <span class="text-emerald-600">Stacks with other offers</span> }
                </div>
              </div>
            } @empty {
              <div class="bg-white rounded-2xl border border-slate-100 p-6 text-center">
                <p class="text-2xl mb-1">🎁</p>
                <p class="text-sm font-semibold text-slate-600">No offers running right now</p>
                <p class="text-[12px] text-slate-400 mt-0.5">Check back later — new schemes appear here automatically.</p>
              </div>
            }
          }

          <!-- ── CUSTOMERS ────────────────────────────────────────── -->
          @if (view() === 'customers') {
            @if (!customer()) {
              <div class="relative mb-3">
                <i class="pi pi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></i>
                <input [(ngModel)]="custQ" (ngModelChange)="searchCustomers()" placeholder="Search name / phone / area…"
                  class="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2.5 text-sm bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none" />
              </div>
              @for (c of customers(); track c.id) {
                <button (click)="openCustomer(c.id)" class="w-full text-left bg-white rounded-xl border border-slate-100 p-3 mb-2 active:bg-slate-50">
                  <div class="flex items-center justify-between">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold truncate">{{ c.name }}</p>
                      <p class="text-[11px] text-slate-400">{{ c.phone }} {{ c.area ? '· ' + c.area : '' }}</p>
                    </div>
                    <div class="text-right shrink-0">
                      <p class="text-sm font-bold tabular-nums" [class.text-red-600]="+c.outstanding > 0" [class.text-slate-400]="+c.outstanding <= 0">₹{{ fmt(c.outstanding) }}</p>
                      <p class="text-[11px] text-slate-400">{{ c.openBills }} bill(s)</p>
                    </div>
                  </div>
                </button>
              } @empty {
                <div class="bg-white rounded-2xl border border-slate-100 p-6 text-center">
                  <i class="pi pi-users text-slate-200 mb-2" style="font-size:1.8rem"></i>
                  <p class="text-sm font-semibold text-slate-600">{{ custQ ? 'No customer found' : 'Search for a customer' }}</p>
                  <p class="text-[12px] text-slate-400 mt-0.5">{{ custQ ? 'Try their phone number or area.' : 'Type a name, phone or area to begin.' }}</p>
                </div>
              }
            } @else {
              <button (click)="customer.set(null)" class="text-[12px] font-semibold text-indigo-700 mb-2"><i class="pi pi-arrow-left mr-1"></i>All customers</button>
              <div class="bg-white rounded-2xl border border-slate-100 p-4 mb-3">
                <p class="text-base font-bold">{{ customer()?.name }}</p>
                <p class="text-[12px] text-slate-400">{{ customer()?.phone }} {{ customer()?.area ? '· ' + customer()?.area : '' }}</p>
                <div class="flex gap-2 mt-3">
                  <button (click)="startOrder()" class="flex-1 text-[13px] font-semibold bg-indigo-600 text-white rounded-xl py-2">+ New order</button>
                  <button (click)="openPromise(null)" class="flex-1 text-[13px] font-semibold border border-amber-300 text-amber-700 rounded-xl py-2">Promise to pay</button>
                </div>
              </div>

              <!-- Offers this customer can get -->
              @if (custSchemes().length) {
                <h2 class="text-[13px] font-bold text-slate-500 uppercase mb-2">Offers for this customer</h2>
                @for (s of custSchemes(); track s.id) {
                  <div class="bg-white rounded-xl border p-3 mb-2" [class.border-purple-300]="s.exclusive" [class.border-amber-200]="!s.exclusive">
                    <div class="flex items-center justify-between gap-2">
                      <div class="min-w-0">
                        <p class="text-[13px] font-semibold truncate">{{ s.name }}
                          @if (s.exclusive) { <span class="ml-1 text-[9px] font-bold bg-purple-100 text-purple-700 rounded px-1 py-0.5 align-middle">ONLY FOR THEM</span> }
                        </p>
                        <p class="text-[11px] text-slate-400">On {{ s.appliesTo }}{{ s.validUntil ? (' · till ' + (s.validUntil | date:'d MMM')) : '' }}</p>
                      </div>
                      <span class="shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg"
                        [class.bg-purple-600]="s.exclusive" [class.bg-amber-500]="!s.exclusive" [class.text-white]="true">{{ s.benefit }}</span>
                    </div>
                  </div>
                }
              }

              <!-- Customer's WhatsApp cart (editable by the salesman) -->
              <div class="flex items-center justify-between mb-2 mt-4">
                <h2 class="text-[13px] font-bold text-slate-500 uppercase">Their WhatsApp cart</h2>
                <button (click)="startEditingCart()" class="text-[11px] font-semibold text-emerald-700 border border-emerald-300 rounded-lg px-2 py-1">+ Add items</button>
              </div>
              @if (!custCart()?.items?.length) {
                <p class="text-sm text-slate-400 bg-white rounded-xl border border-slate-100 p-4 mb-2">Cart is empty — add items or take a fresh order.</p>
              } @else {
                <div class="bg-white rounded-xl border border-emerald-200 p-3 mb-2">
                  @for (it of custCart()?.items || []; track it.id) {
                    <div class="flex items-center gap-2 mb-2">
                      <div class="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                        @if (it.thumbnail) { <img [src]="it.thumbnail" class="w-full h-full object-cover" /> }
                        @else { <i class="pi pi-box text-slate-300 text-sm"></i> }
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-[13px] font-medium truncate">{{ it.productName }}</p>
                        <p class="text-[11px] text-slate-400 tabular-nums">₹{{ fmt(it.unitPrice) }} × {{ it.quantity }} = ₹{{ fmt(it.unitPrice * it.quantity) }}</p>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button (click)="custCartStep(it, -1)" class="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-sm">−</button>
                        <span class="w-7 text-center text-sm font-bold tabular-nums">{{ it.quantity }}</span>
                        <button (click)="custCartStep(it, 1)" class="w-7 h-7 rounded-lg bg-emerald-600 text-white font-bold text-sm">+</button>
                      </div>
                    </div>
                  }
                  <div class="flex items-center justify-between border-t border-slate-100 pt-2">
                    <p class="text-[13px] font-bold tabular-nums">Total ₹{{ fmt(custCart()?.total) }}</p>
                    <div class="flex gap-2">
                      <button (click)="copyCartToOrder()" class="text-[11px] font-semibold bg-indigo-600 text-white rounded-lg px-2.5 py-1.5">Order this cart</button>
                      <button (click)="clearCustomerCart()" class="text-[11px] font-semibold text-red-600 border border-red-200 rounded-lg px-2.5 py-1.5">Clear</button>
                    </div>
                  </div>
                </div>
              }

              <h2 class="text-[13px] font-bold text-slate-500 uppercase mb-2 mt-4">Open bills</h2>
              @if (!customer()?.bills?.length) { <p class="text-sm text-slate-400 bg-white rounded-xl border border-slate-100 p-4">Nothing outstanding. 🎉</p> }
              @for (b of customer()?.bills || []; track b.id) {
                <div class="bg-white rounded-xl border border-slate-100 p-3 mb-2">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm font-semibold">{{ b.invoiceNumber }}</p>
                      <p class="text-[11px] text-slate-400">{{ b.issuedAt | date:'d MMM yy' }} {{ b.dueDate ? '· due ' + (b.dueDate | date:'d MMM') : '' }}</p>
                    </div>
                    <div class="text-right">
                      <p class="text-sm font-bold tabular-nums text-red-600">₹{{ fmt(b.balanceDue) }}</p>
                      <p class="text-[10px] text-slate-400">of ₹{{ fmt(b.total) }}</p>
                    </div>
                  </div>
                  <div class="flex gap-2 mt-2">
                    <button (click)="openCollect(b)" class="flex-1 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg py-1.5">₹ Collect</button>
                    <button (click)="openPromise(b)" class="text-[12px] font-semibold text-amber-700 border border-amber-300 rounded-lg px-3">Promise</button>
                  </div>
                </div>
              }
              @if (customer()?.promises?.length) {
                <h2 class="text-[13px] font-bold text-slate-500 uppercase mt-4 mb-2">Open promises</h2>
                @for (p of customer()?.promises || []; track p.id) {
                  <div class="bg-amber-50 rounded-xl border border-amber-200 p-3 mb-2 flex items-center justify-between">
                    <p class="text-[12px] text-amber-800">₹{{ fmt(p.amount) }} on {{ p.promiseDate | date:'d MMM' }}{{ p.note ? ' — ' + p.note : '' }}</p>
                  </div>
                }
              }
            }
          }

          <!-- ── PENDING (collection run) ─────────────────────────── -->
          @if (view() === 'pending') {
            @if (pending().length) {
              <div class="flex items-center justify-between bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mb-3">
                <div>
                  <p class="text-[11px] font-semibold text-red-400 uppercase tracking-wide">To collect</p>
                  <p class="text-lg font-bold tabular-nums text-red-600">₹{{ fmt(pendingSum()) }}</p>
                </div>
                <p class="text-[12px] font-semibold text-red-500">{{ pending().length }} bill(s)</p>
              </div>
            }
            @for (b of pending(); track b.id) {
              <div class="bg-white rounded-2xl border p-3.5 mb-2"
                [class.border-red-200]="daysOverdue(b.dueDate) > 0" [class.border-slate-100]="daysOverdue(b.dueDate) <= 0">
                <div class="flex items-center justify-between">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ b.customerName }}</p>
                    <p class="text-[11px] text-slate-400">{{ b.invoiceNumber }} · {{ b.issuedAt | date:'d MMM' }} {{ b.dueDate ? '· due ' + (b.dueDate | date:'d MMM') : '' }}</p>
                  </div>
                  <div class="text-right shrink-0">
                    <p class="text-sm font-bold tabular-nums text-red-600">₹{{ fmt(b.balanceDue) }}</p>
                    @if (daysOverdue(b.dueDate) > 0) {
                      <span class="inline-block mt-0.5 text-[10px] font-bold text-red-700 bg-red-100 rounded px-1.5 py-0.5">{{ daysOverdue(b.dueDate) }}d overdue</span>
                    }
                  </div>
                </div>
                <div class="flex gap-2 mt-2.5">
                  <button (click)="openCollect(b)" class="flex-1 text-[13px] font-bold bg-emerald-600 text-white rounded-xl py-2 active:bg-emerald-700">₹ Collect</button>
                  <button (click)="openPromiseFor(b)" class="text-[13px] font-semibold text-amber-700 border border-amber-300 rounded-xl px-4">Promise</button>
                </div>
              </div>
            } @empty {
              <div class="bg-white rounded-2xl border border-slate-100 p-6 text-center">
                <p class="text-2xl mb-1">🎉</p>
                <p class="text-sm font-semibold text-slate-600">All bills collected!</p>
                <p class="text-[12px] text-slate-400 mt-0.5">Nothing pending. Go take some new orders.</p>
              </div>
            }
          }

          <!-- ── FOLLOW-UPS ───────────────────────────────────────── -->
          @if (view() === 'followups') {
            <div class="flex gap-1 mb-3">
              @for (s of ['due','open','all']; track s) {
                <button (click)="promiseScope.set(s); loadPromises()"
                  class="px-3 py-1.5 text-[12px] font-semibold rounded-full border"
                  [class.bg-indigo-600]="promiseScope() === s" [class.text-white]="promiseScope() === s"
                  [class.border-indigo-600]="promiseScope() === s" [class.border-slate-200]="promiseScope() !== s"
                  [class.text-slate-500]="promiseScope() !== s">{{ s | titlecase }}</button>
              }
            </div>
            @for (p of promiseList(); track p.id) {
              <div class="bg-white rounded-2xl border p-3.5 mb-2"
                [class.border-red-200]="p.status === 'open' && daysOverdue(p.promiseDate) > 0"
                [class.border-amber-300]="p.status === 'open' && daysOverdue(p.promiseDate) <= 0"
                [class.border-slate-100]="p.status !== 'open'">
                <div class="flex items-center justify-between">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ p.customerName }}</p>
                    <p class="text-[11px] text-slate-400">{{ p.invoiceNumber || 'On account' }} · {{ p.promiseDate | date:'d MMM yy' }}</p>
                    @if (p.status === 'open') {
                      <p class="text-[11px] font-semibold mt-0.5" [class.text-red-600]="daysOverdue(p.promiseDate) > 0" [class.text-amber-700]="daysOverdue(p.promiseDate) <= 0">
                        {{ daysOverdue(p.promiseDate) > 0 ? daysOverdue(p.promiseDate) + ' day(s) late' : 'Due ' + rel(p.promiseDate) }}
                      </p>
                    } @else {
                      <p class="text-[11px] text-slate-400 mt-0.5">{{ p.status | titlecase }}</p>
                    }
                    @if (p.note) { <p class="text-[11px] text-slate-500 mt-0.5 bg-slate-50 rounded-lg px-2 py-1 inline-block">{{ p.note }}</p> }
                  </div>
                  <p class="text-base font-bold tabular-nums shrink-0" [class.text-amber-700]="p.status === 'open'">₹{{ fmt(p.amount) }}</p>
                </div>
                @if (p.status === 'open') {
                  <div class="flex gap-2 mt-2.5">
                    <button (click)="openCollectForPromise(p)" class="flex-1 text-[13px] font-bold bg-emerald-600 text-white rounded-xl py-2 active:bg-emerald-700">₹ Collect now</button>
                    <button (click)="markPromise(p, 'broken')" class="text-[13px] font-semibold text-red-600 border border-red-200 rounded-xl px-4">Not paid</button>
                  </div>
                }
              </div>
            } @empty {
              <div class="bg-white rounded-2xl border border-slate-100 p-6 text-center">
                <p class="text-2xl mb-1">📅</p>
                <p class="text-sm font-semibold text-slate-600">No follow-ups here</p>
                <p class="text-[12px] text-slate-400 mt-0.5">When a customer promises to pay later, it shows up here so you don't forget.</p>
              </div>
            }
          }

          <!-- ── BEAT (assigned customers · check in/out) ──────────── -->
          @if (view() === 'beat') {
            @if (beatLoading()) {
              <div class="space-y-3">
                @for (i of [1,2,3]; track i) {
                  <div class="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse">
                    <div class="h-3.5 w-1/3 bg-slate-100 rounded mb-2"></div>
                    <div class="h-2.5 w-2/3 bg-slate-100 rounded"></div>
                  </div>
                }
              </div>
            }
            @if (!beatLoading() && beat().length) {
              <div class="flex items-center justify-between px-1 mb-2">
                <p class="text-[12px] font-semibold text-slate-500">{{ beat().length }} shop(s) on your beat</p>
                <p class="text-[11px] font-semibold text-red-500">₹{{ fmtShort(beatOutstanding()) }} to collect</p>
              </div>
            }
            @for (c of beat(); track c.customer_id) {
              <div class="bg-white rounded-2xl border border-slate-100 p-4 mb-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-bold truncate">{{ c.name }}</p>
                    <p class="text-[11px] text-slate-400 truncate">{{ c.phone }} {{ c.area ? '· ' + c.area : '' }} {{ c.route ? '· ' + c.route : '' }}</p>
                  </div>
                  <div class="text-right shrink-0">
                    <p class="text-sm font-bold tabular-nums" [class.text-red-600]="+c.outstanding > 0" [class.text-slate-400]="+c.outstanding <= 0">₹{{ fmt(c.outstanding) }}</p>
                    @if (+c.open_bills > 0) {
                      <span class="inline-block mt-0.5 text-[10px] font-bold text-red-700 bg-red-50 rounded px-1.5 py-0.5">{{ c.open_bills }} open bill(s)</span>
                    }
                  </div>
                </div>
                <p class="text-[11px] mt-1.5 flex items-center gap-1"
                  [class.text-red-500]="!c.last_visit_at" [class.text-slate-400]="c.last_visit_at">
                  <i class="pi pi-clock text-[10px]"></i>
                  Last visit: <span class="font-semibold">{{ rel(c.last_visit_at) }}</span>
                </p>

                @if (activeVisit()?.customer_id === c.customer_id || activeVisitCustomerId() === c.customer_id) {
                  <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mt-3">
                    <p class="text-[12px] font-bold text-emerald-800 mb-2"><i class="pi pi-map-marker text-[11px]"></i> Checked in</p>
                    <textarea [(ngModel)]="visitNote" rows="2" placeholder="Visit note…"
                      class="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm mb-2 bg-white"></textarea>
                    <label class="text-[11px] font-semibold text-slate-500 uppercase">Outcome</label>
                    <select [(ngModel)]="visitOutcome" class="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm mb-2 mt-1 bg-white">
                      <option value="order_taken">Order taken</option>
                      <option value="payment_collected">Payment collected</option>
                      <option value="no_order">No order</option>
                      <option value="closed">Closed</option>
                    </select>
                    <div class="flex gap-2">
                      <button (click)="checkOut()" [disabled]="busy()"
                        class="flex-1 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg py-2 disabled:opacity-50">
                        {{ busy() ? 'Saving…' : 'Check out' }}
                      </button>
                      <button (click)="takeOrderFor(c)" class="text-[12px] font-semibold text-indigo-700 border border-indigo-200 rounded-lg px-3">Take order</button>
                    </div>
                  </div>
                } @else {
                  <div class="flex gap-2 mt-3">
                    <button (click)="checkIn(c)" [disabled]="busy()"
                      class="flex-1 text-[13px] font-bold bg-indigo-600 text-white rounded-xl py-2 disabled:opacity-50 active:bg-indigo-700">
                      <i class="pi pi-map-marker text-[11px] mr-1"></i>{{ busy() ? '…' : 'Check in' }}
                    </button>
                    <button (click)="takeOrderFor(c)" class="text-[13px] font-semibold text-indigo-700 border border-indigo-200 rounded-xl px-4">Take order</button>
                  </div>
                }
              </div>
            } @empty {
              @if (!beatLoading()) {
                <div class="bg-white rounded-2xl border border-slate-100 p-6 text-center">
                  <i class="pi pi-map text-slate-200 mb-2" style="font-size:1.8rem"></i>
                  <p class="text-sm font-semibold text-slate-600">No shops on your beat yet</p>
                  <p class="text-[12px] text-slate-400 mt-0.5">Ask your manager to assign customers to your route.</p>
                </div>
              }
            }
          }

          <!-- ── VISITS (history for a date range) ─────────────────── -->
          @if (view() === 'visits') {
            <div class="flex items-end gap-2 mb-3">
              <div class="flex-1">
                <label class="text-[10px] font-semibold text-slate-400 uppercase">From</label>
                <input type="date" [(ngModel)]="visitFrom" class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white" />
              </div>
              <div class="flex-1">
                <label class="text-[10px] font-semibold text-slate-400 uppercase">To</label>
                <input type="date" [(ngModel)]="visitTo" class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white" />
              </div>
              <button (click)="loadVisits()" class="text-[12px] font-semibold bg-indigo-600 text-white rounded-xl px-4 py-2">Refresh</button>
            </div>
            @if (visitsLoading()) {
              <p class="text-sm text-slate-400 bg-white rounded-2xl border border-slate-100 p-4">Loading your visits…</p>
            }
            @if (!visitsLoading() && visits().length) {
              <p class="text-[12px] font-semibold text-slate-500 px-1 mb-2">{{ visits().length }} visit(s) in this range</p>
            }
            @for (v of visits(); track v.id) {
              <div class="bg-white rounded-2xl border border-slate-100 p-3.5 mb-2">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ v.customer_name }}</p>
                    <p class="text-[11px] text-slate-400 truncate">{{ v.customer_phone }} {{ v.area ? '· ' + v.area : '' }} {{ v.purpose ? '· ' + v.purpose : '' }}</p>
                  </div>
                  <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    [class.bg-emerald-100]="v.status === 'completed'" [class.text-emerald-700]="v.status === 'completed'"
                    [class.bg-amber-100]="v.status !== 'completed'" [class.text-amber-700]="v.status !== 'completed'">{{ v.status === 'completed' ? '✓ Done' : 'Open' }}</span>
                </div>
                <div class="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11px] text-slate-500">
                  <span><i class="pi pi-sign-in text-[9px] text-emerald-500"></i> {{ v.checkin_at ? (v.checkin_at | date:'d MMM, h:mm a') : '—' }}</span>
                  <span><i class="pi pi-sign-out text-[9px] text-slate-400"></i> {{ v.checkout_at ? (v.checkout_at | date:'d MMM, h:mm a') : 'still in' }}</span>
                  @if (v.outcome) { <span class="text-indigo-600 font-semibold">{{ v.outcome | titlecase }}</span> }
                </div>
                @if (v.note) { <p class="text-[11px] text-slate-500 mt-1 bg-slate-50 rounded-lg px-2 py-1">{{ v.note }}</p> }
              </div>
            } @empty {
              @if (!visitsLoading()) {
                <div class="bg-white rounded-2xl border border-slate-100 p-6 text-center">
                  <i class="pi pi-calendar text-slate-200 mb-2" style="font-size:1.8rem"></i>
                  <p class="text-sm font-semibold text-slate-600">No visits in this range</p>
                  <p class="text-[12px] text-slate-400 mt-0.5">Change the dates above, or check in from your Beat.</p>
                </div>
              }
            }
          }

          <!-- ── PERF (my stats) ───────────────────────────────────── -->
          @if (view() === 'perf') {
            @if (statsLoading()) {
              <p class="text-sm text-slate-400 bg-white rounded-xl border border-slate-100 p-4">Loading your stats…</p>
            }
            @if (stats(); as st) {
              <h2 class="text-[13px] font-bold text-slate-500 uppercase mb-2">Today</h2>
              <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="bg-white rounded-2xl border border-slate-100 p-4">
                  <p class="text-[11px] font-semibold text-slate-400 uppercase">Sales</p>
                  <p class="text-xl font-bold tabular-nums mt-1">₹{{ fmt(st.today?.sales) }}</p>
                  <p class="text-[11px] text-slate-400">{{ st.today?.orders || 0 }} order(s)</p>
                </div>
                <div class="bg-white rounded-2xl border border-slate-100 p-4">
                  <p class="text-[11px] font-semibold text-slate-400 uppercase">Collected</p>
                  <p class="text-xl font-bold tabular-nums mt-1 text-emerald-700">₹{{ fmt(st.today?.collected) }}</p>
                  <p class="text-[11px] text-slate-400">{{ st.today?.visits || 0 }} visit(s)</p>
                </div>
              </div>

              <h2 class="text-[13px] font-bold text-slate-500 uppercase mb-2">This month vs target</h2>
              <div class="bg-white rounded-2xl border border-slate-100 p-4 mb-4 space-y-3">
                <div>
                  <div class="flex justify-between text-[12px] mb-1">
                    <span class="font-semibold text-slate-600">Sales</span>
                    <span class="tabular-nums text-slate-400">₹{{ fmt(st.month?.sales) }} / ₹{{ fmt(st.target?.amount) }}</span>
                  </div>
                  <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full bg-indigo-600 rounded-full" [style.width.%]="pct(st.month?.sales, st.target?.amount)"></div>
                  </div>
                </div>
                <div>
                  <div class="flex justify-between text-[12px] mb-1">
                    <span class="font-semibold text-slate-600">Collection</span>
                    <span class="tabular-nums text-slate-400">₹{{ fmt(st.month?.collected) }} / ₹{{ fmt(st.target?.collection) }}</span>
                  </div>
                  <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full bg-emerald-600 rounded-full" [style.width.%]="pct(st.month?.collected, st.target?.collection)"></div>
                  </div>
                </div>
                <div>
                  <div class="flex justify-between text-[12px] mb-1">
                    <span class="font-semibold text-slate-600">Visits</span>
                    <span class="tabular-nums text-slate-400">{{ st.month?.visits || 0 }} / {{ st.target?.visits || 0 }}</span>
                  </div>
                  <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full bg-amber-500 rounded-full" [style.width.%]="pct(st.month?.visits, st.target?.visits)"></div>
                  </div>
                </div>
                @if (st.beatSize) { <p class="text-[11px] text-slate-400">Beat size: {{ st.beatSize }} customer(s)</p> }
              </div>
            }

            @if (perf(); as pf) {
              @if (pf.dayWise?.length) {
                <h2 class="text-[13px] font-bold text-slate-500 uppercase mb-2">Last {{ perfBars().length }} days · sales</h2>
                <div class="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
                  <div class="flex items-end gap-1 h-28">
                    @for (d of perfBars(); track d.day) {
                      <div class="flex-1 flex flex-col items-center justify-end h-full" [title]="d.day + ': ₹' + fmt(d.sales)">
                        <div class="w-full rounded-t bg-indigo-500" [style.height.%]="d.h"></div>
                      </div>
                    }
                  </div>
                </div>
              }
              @if (pf.topProducts?.length) {
                <h2 class="text-[13px] font-bold text-slate-500 uppercase mb-2">Top products</h2>
                @for (p of pf.topProducts; track p.product_name) {
                  <div class="bg-white rounded-xl border border-slate-100 p-3 mb-2 flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <p class="text-[13px] font-semibold truncate">{{ p.product_name }}</p>
                      <p class="text-[11px] text-slate-400">{{ fmtQty(p.qty) }} unit(s) · {{ p.orders || 0 }} order(s)</p>
                    </div>
                    <p class="text-sm font-bold tabular-nums shrink-0">₹{{ fmt(p.value) }}</p>
                  </div>
                }
              }
            }
          }
        </main>
      }

      <!-- ── STICKY CART BAR ────────────────────────────────────── -->
      @if (authed() && cart().length && !cartOpen() && !editTarget()) {
        <button (click)="openCart()"
          class="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-2xl bg-indigo-600 text-white rounded-2xl px-4 py-3 shadow-xl flex items-center justify-between">
          <span class="text-[13px] font-bold">{{ cartCount() }} item(s) · ₹{{ fmt(cartSubtotal()) }}</span>
          @if (cartEval()?.discountTotal || cartEval()?.freeItems?.length) {
            <span class="text-[11px] bg-white/20 rounded-lg px-2 py-0.5">offers applied 🎁</span>
          }
          <span class="text-[13px] font-bold">View cart ▸</span>
        </button>
      }

      <!-- ── CART SHEET ─────────────────────────────────────────── -->
      @if (cartOpen()) {
        <div class="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center sm:justify-center" (click)="cartOpen.set(false)">
          <div class="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto" (click)="$event.stopPropagation()">
            <h3 class="text-base font-bold mb-3">Order cart</h3>

            <!-- Customer -->
            @if (cartCustomer()) {
              <div class="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 mb-3">
                <i class="pi pi-user text-indigo-500 text-sm"></i>
                <div class="flex-1 min-w-0">
                  <p class="text-[13px] font-semibold text-indigo-900 truncate">{{ cartCustomer()?.name }}</p>
                  <p class="text-[11px] text-indigo-400">{{ cartCustomer()?.phone }}</p>
                </div>
                <button (click)="cartCustomer.set(null)" class="text-[11px] font-semibold text-indigo-600">Change</button>
              </div>
              @if (cartCustSchemes().length) {
                <div class="flex flex-wrap gap-1 mb-3 -mt-1">
                  @for (s of cartCustSchemes(); track s.id) {
                    <span class="text-[10px] font-semibold rounded-lg px-1.5 py-0.5"
                      [class.bg-purple-100]="s.exclusive" [class.text-purple-700]="s.exclusive"
                      [class.bg-amber-100]="!s.exclusive" [class.text-amber-700]="!s.exclusive">{{ s.exclusive ? '⭐ ' : '' }}{{ s.benefit }}</span>
                  }
                </div>
              }
            } @else {
              <p class="text-[12px] font-semibold text-slate-500 mb-1">Who is this order for?</p>
              <input [(ngModel)]="cartCustQ" (ngModelChange)="searchCartCustomers()" placeholder="Search customer…"
                class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-2" />
              @for (c of cartCustResults(); track c.id) {
                <button (click)="pickCartCustomer(c)" class="w-full text-left flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 mb-1">
                  <span class="text-[13px] font-medium truncate">{{ c.name }}</span>
                  <span class="text-[11px] text-slate-400 shrink-0">{{ c.phone }}</span>
                </button>
              }
            }

            <!-- Lines -->
            @for (l of cart(); track l.productId) {
              <div class="flex items-center gap-2 mb-2">
                <div class="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                  @if (l.thumbnail) { <img [src]="l.thumbnail" class="w-full h-full object-cover" /> }
                  @else { <i class="pi pi-box text-slate-300 text-sm"></i> }
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[13px] font-medium truncate">{{ l.productName }}</p>
                  <p class="text-[11px] text-slate-400 tabular-nums">₹{{ fmt(l.unitPrice) }} × {{ l.quantity }} = ₹{{ fmt(l.unitPrice * l.quantity) }}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button (click)="stepLine(l, -1)" class="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-sm">−</button>
                  <span class="w-7 text-center text-sm font-bold tabular-nums">{{ l.quantity }}</span>
                  <button (click)="stepLine(l, 1)" class="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold text-sm">+</button>
                </div>
              </div>
            }

            <!-- Savings -->
            @if (cartEval(); as ev) {
              @if (ev.discountTotal || ev.freeItems?.length) {
                <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 my-3">
                  <p class="text-[12px] font-bold text-emerald-800 mb-1">🎁 Offers applied</p>
                  @for (a of appliedSchemes(); track a.schemeId) {
                    <p class="text-[11px] text-emerald-700">{{ a.name }} — {{ a.label }}</p>
                  }
                  @for (f of ev.freeItems || []; track f.productId) {
                    <p class="text-[11px] text-emerald-700">+ {{ f.quantity }} × {{ f.name }} FREE</p>
                  }
                  @if (ev.discountTotal) {
                    <p class="text-[12px] font-bold text-emerald-800 mt-1">Discount −₹{{ fmt(ev.discountTotal) }}</p>
                  }
                </div>
              }
            }

            <!-- Totals -->
            <div class="border-t border-slate-100 pt-2 mt-2 text-[13px] space-y-1">
              <div class="flex justify-between text-slate-500"><span>Subtotal</span><span class="tabular-nums">₹{{ fmt(cartSubtotal()) }}</span></div>
              @if (cartEval()?.discountTotal) {
                <div class="flex justify-between text-emerald-600"><span>Scheme discount</span><span class="tabular-nums">−₹{{ fmt(cartEval()?.discountTotal) }}</span></div>
              }
              <div class="flex justify-between font-bold text-base"><span>Total</span><span class="tabular-nums">₹{{ fmt(cartSubtotal() - (cartEval()?.discountTotal || 0)) }}</span></div>
            </div>

            @if (sheetError()) { <p class="text-[12px] text-red-600 my-2">{{ sheetError() }}</p> }
            <button (click)="submitOrder()" [disabled]="busy() || !cart().length || !cartCustomer()"
              class="mt-3 w-full bg-indigo-600 text-white font-bold rounded-xl py-3 disabled:opacity-50">
              {{ busy() ? 'Placing…' : (cartCustomer() ? 'Place order' : 'Pick a customer first') }}
            </button>
          </div>
        </div>
      }

      <!-- ── COLLECT SHEET ──────────────────────────────────────── -->
      @if (collectFor(); as bill) {
        <div class="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center sm:justify-center" (click)="collectFor.set(null)">
          <div class="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5" (click)="$event.stopPropagation()">
            <h3 class="text-base font-bold mb-1">Collect payment</h3>
            <p class="text-[12px] text-slate-400 mb-3">{{ bill.invoiceNumber }} · balance ₹{{ fmt(bill.balanceDue) }}</p>
            <label class="text-[11px] font-semibold text-slate-500 uppercase">Amount</label>
            <input type="number" [(ngModel)]="colAmount" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-3" />
            <label class="text-[11px] font-semibold text-slate-500 uppercase">Payment type</label>
            <div class="grid grid-cols-4 gap-1.5 mb-3 mt-1">
              @for (m of ['cash','cheque','upi','online']; track m) {
                <button (click)="colMethod.set(m)"
                  class="py-2 text-[12px] font-semibold rounded-xl border"
                  [class.bg-indigo-600]="colMethod() === m" [class.text-white]="colMethod() === m"
                  [class.border-indigo-600]="colMethod() === m" [class.border-slate-200]="colMethod() !== m">{{ m | titlecase }}</button>
              }
            </div>
            @if (colMethod() === 'cheque' || colMethod() === 'online' || colMethod() === 'upi') {
              <label class="text-[11px] font-semibold text-slate-500 uppercase">{{ colMethod() === 'cheque' ? 'Cheque number' : 'Transaction ref' }}</label>
              <input [(ngModel)]="colInstrument" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-3"
                [placeholder]="colMethod() === 'cheque' ? '6-digit cheque no' : 'UTR / UPI ref'" />
            }
            @if (colMethod() === 'cheque') {
              <label class="text-[11px] font-semibold text-slate-500 uppercase">Cheque date</label>
              <input type="date" [(ngModel)]="colInstrumentDate" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-3" />
            }
            <label class="text-[11px] font-semibold text-slate-500 uppercase">Note (optional)</label>
            <input [(ngModel)]="colNote" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-4" />
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
            <p class="text-[12px] text-slate-400 mb-3">{{ promiseBill()?.invoiceNumber || 'On account' }} — customer will pay on the chosen date; it shows in Follow-ups.</p>
            <label class="text-[11px] font-semibold text-slate-500 uppercase">Amount</label>
            <input type="number" [(ngModel)]="prAmount" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-3" />
            <label class="text-[11px] font-semibold text-slate-500 uppercase">Will pay on</label>
            <input type="date" [(ngModel)]="prDate" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-3" />
            <label class="text-[11px] font-semibold text-slate-500 uppercase">Note (optional)</label>
            <input [(ngModel)]="prNote" placeholder="e.g. after market day" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-4" />
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
export class SalesWebviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http: HttpClient;
  private readonly base = `${environment.apiUrl}/sfa/m`;

  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'home', label: '🏠 Today' },
    { id: 'catalog', label: '🛒 Items' },
    { id: 'offers', label: '🎁 Offers' },
    { id: 'customers', label: '👥 Customers' },
    { id: 'pending', label: '₹ Pending' },
    { id: 'followups', label: '📅 Follow-ups' },
    { id: 'beat', label: '🧭 Beat' },
    { id: 'visits', label: '📍 Visits' },
    { id: 'perf', label: '📊 My Stats' },
  ];

  private t = '';
  private token = '';
  readonly authed = signal(false);
  readonly loadError = signal('');
  readonly view = signal<Tab>('home');
  readonly me = signal<any>(null);
  readonly home = signal<any>(null);
  readonly customers = signal<any[]>([]);
  readonly customer = signal<any>(null);
  readonly custSchemes = signal<any[]>([]);
  readonly custCart = signal<any>(null);
  readonly cartCustSchemes = signal<any[]>([]);
  /** When set, the catalog's +/− buttons edit THIS customer's WhatsApp cart instead of the order cart. */
  readonly editTarget = signal<{ id: string; name: string } | null>(null);
  readonly pending = signal<any[]>([]);
  readonly pendingSum = computed(() => this.pending().reduce((s, b) => s + (Number(b?.balanceDue) || 0), 0));
  readonly promiseList = signal<any[]>([]);
  readonly promiseScope = signal('due');
  readonly products = signal<any[]>([]);
  readonly schemes = signal<any[]>([]);
  readonly collectFor = signal<any>(null);
  readonly promiseSheet = signal(false);
  readonly promiseBill = signal<any>(null);
  readonly colMethod = signal('cash');
  readonly busy = signal(false);
  readonly sheetError = signal('');
  readonly toast = signal('');

  // ── Beat / Visits / Perf ────────────────────────────────────────────────────
  readonly beat = signal<any[]>([]);
  readonly beatOutstanding = computed(() => this.beat().reduce((s, c) => s + (Number(c?.outstanding) || 0), 0));
  readonly beatLoading = signal(false);
  readonly activeVisit = signal<any>(null);
  /** customer_id whose inline check-in panel is open (visit row may lack customer_id) */
  readonly activeVisitCustomerId = signal<string | null>(null);
  readonly visits = signal<any[]>([]);
  readonly visitsLoading = signal(false);
  readonly stats = signal<any>(null);
  readonly statsLoading = signal(false);
  readonly perf = signal<any>(null);
  /** last ~14 day sales bars, height normalised to the max for CSS chart */
  readonly perfBars = computed(() => {
    const rows: any[] = (this.perf()?.dayWise || []).slice(-14);
    const max = rows.reduce((m, r) => Math.max(m, Number(r?.sales) || 0), 0);
    return rows.map((r) => ({ day: r?.day, sales: Number(r?.sales) || 0, h: max > 0 ? Math.round(((Number(r?.sales) || 0) / max) * 100) : 0 }));
  });
  visitNote = ''; visitOutcome = 'order_taken';
  visitFrom = ''; visitTo = '';

  // Cart (global — built from the catalog, checked out per customer)
  readonly cart = signal<Array<{ productId: string; productName: string; quantity: number; unitPrice: number; thumbnail?: string }>>([]);
  readonly cartCustomer = signal<any>(null);
  readonly cartOpen = signal(false);
  readonly cartEval = signal<any>(null);
  readonly cartCustResults = signal<any[]>([]);
  readonly cartCount = computed(() => this.cart().reduce((s, l) => s + l.quantity, 0));
  readonly cartSubtotal = computed(() => this.cart().reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  readonly appliedSchemes = computed(() => {
    const ev = this.cartEval();
    if (!ev) return [];
    return (ev.applicable || []).filter((a: any) => (ev.recommendedIds || []).includes(a.schemeId));
  });
  private evalTimer: any = null;

  custQ = ''; prodQ = ''; cartCustQ = '';
  colAmount: number | null = null; colInstrument = ''; colInstrumentDate = ''; colNote = '';
  private colPromiseId: string | null = null;
  private colCustomerId: string | null = null;
  prAmount: number | null = null; prDate = ''; prNote = '';

  constructor() { this.http = new HttpClient(inject(HttpBackend)); }

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap;
    this.t = qp.get('t') || '';
    this.token = qp.get('token') || '';
    if (!this.t || !this.token) { this.loadError.set('Missing or invalid link.'); return; }
    this.get('me').subscribe({
      next: (r) => {
        const d = unwrap<any>(r);
        this.me.set(d.salesman); this.home.set(d); this.authed.set(true);
        this.get('schemes').subscribe((s) => this.schemes.set(unwrap(s)));
        this.get('stats').subscribe({ next: (s) => this.stats.set(unwrap<any>(s)), error: () => {} });
      },
      error: (e) => this.loadError.set(e?.error?.message || 'Link expired or deactivated.'),
    });
  }

  private qs(extra: Record<string, string> = {}) {
    return { params: { t: this.t, token: this.token, ...extra } };
  }
  private get(path: string, extra: Record<string, string> = {}) { return this.http.get(`${this.base}/${path}`, this.qs(extra)); }
  private post(path: string, body: any) { return this.http.post(`${this.base}/${path}`, body, this.qs()); }

  go(t: Tab) {
    this.view.set(t);
    if (t === 'home') this.refreshHome();
    if (t === 'catalog' && !this.products().length) this.searchProducts();
    if (t === 'offers') this.get('schemes').subscribe((r) => this.schemes.set(unwrap(r)));
    if (t === 'customers' && !this.customers().length) this.searchCustomers();
    if (t === 'pending') this.get('pending').subscribe((r) => this.pending.set(unwrap(r)));
    if (t === 'followups') this.loadPromises();
    if (t === 'beat' && !this.beat().length) this.loadBeat();
    if (t === 'visits') { if (!this.visitFrom || !this.visitTo) this.initVisitRange(); this.loadVisits(); }
    if (t === 'perf') this.loadPerf();
  }

  refreshHome() {
    this.get('me').subscribe((r) => { const d = unwrap<any>(r); this.me.set(d.salesman); this.home.set(d); });
    // Targets/today figures power the "day at a glance" progress bars on Home.
    if (!this.stats()) this.get('stats').subscribe({ next: (r) => this.stats.set(unwrap<any>(r)), error: () => {} });
  }

  searchCustomers() {
    this.get('customers', { q: this.custQ }).subscribe((r) => this.customers.set(unwrap(r)));
  }
  openCustomer(id: string) {
    this.get(`customers/${id}`).subscribe((r) => this.customer.set(unwrap(r)));
    this.custSchemes.set([]); this.custCart.set(null);
    this.get(`customers/${id}/schemes`).subscribe((r) => this.custSchemes.set(unwrap(r)));
    this.get(`customers/${id}/cart`).subscribe((r) => this.custCart.set(unwrap(r)));
  }
  loadPromises() {
    this.get('promises', { scope: this.promiseScope() }).subscribe((r) => this.promiseList.set(unwrap(r)));
  }

  // ─── Catalog + cart ─────────────────────────────────────────────────────────
  searchProducts() {
    this.get('products', { q: this.prodQ }).subscribe((r) => this.products.set(unwrap(r)));
  }
  qtyOf(productId: string): number {
    if (this.editTarget()) {
      return (this.custCart()?.items || []).find((it: any) => it.productId === productId)?.quantity || 0;
    }
    return this.cart().find((l) => l.productId === productId)?.quantity || 0;
  }
  step(p: any, delta: number) {
    // Customer-cart edit mode: +/− writes straight into their WhatsApp cart.
    const target = this.editTarget();
    if (target) {
      const existing = (this.custCart()?.items || []).find((it: any) => it.productId === p.id);
      const done = (r: any) => this.custCart.set(unwrap(r));
      if (existing) {
        this.http.patch(`${this.base}/customers/${target.id}/cart/items/${existing.id}`, { quantity: existing.quantity + delta }, this.qs())
          .subscribe({ next: done, error: () => this.showToast('Could not update cart') });
      } else if (delta > 0) {
        this.post(`customers/${target.id}/cart/items`, { productId: p.id, quantity: delta })
          .subscribe({ next: done, error: () => this.showToast('Could not add to cart') });
      }
      return;
    }
    this.cart.update((ls) => {
      const i = ls.findIndex((l) => l.productId === p.id);
      if (i < 0) {
        if (delta <= 0) return ls;
        return [...ls, { productId: p.id, productName: p.name, quantity: delta, unitPrice: Number(p.price) || 0, thumbnail: p.thumbnail }];
      }
      const q = ls[i].quantity + delta;
      if (q <= 0) return ls.filter((_, x) => x !== i);
      const next = [...ls]; next[i] = { ...next[i], quantity: q };
      return next;
    });
    this.scheduleEval();
  }

  // ─── Customer WhatsApp cart editing ─────────────────────────────────────────
  custCartStep(it: any, delta: number) {
    const id = this.customer()?.id;
    if (!id) return;
    this.http.patch(`${this.base}/customers/${id}/cart/items/${it.id}`, { quantity: it.quantity + delta }, this.qs())
      .subscribe({ next: (r) => this.custCart.set(unwrap(r)), error: () => this.showToast('Could not update cart') });
  }
  startEditingCart() {
    const c = this.customer();
    if (!c) return;
    this.editTarget.set({ id: c.id, name: c.name });
    this.view.set('catalog');
    if (!this.products().length) this.searchProducts();
  }
  stopEditingCart() {
    const target = this.editTarget();
    this.editTarget.set(null);
    if (target) { this.view.set('customers'); this.openCustomer(target.id); }
  }
  copyCartToOrder() {
    const items = (this.custCart()?.items || []).map((it: any) => ({
      productId: it.productId, productName: it.productName, quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice) || 0, thumbnail: it.thumbnail,
    }));
    if (!items.length) return;
    this.cart.set(items);
    this.cartCustomer.set(this.customer());
    this.loadCartCustSchemes(this.customer()?.id);
    this.openCart();
  }
  clearCustomerCart() {
    const id = this.customer()?.id;
    if (!id) return;
    this.post(`customers/${id}/cart/clear`, {}).subscribe({
      next: () => { this.custCart.set({ items: [], total: 0 }); this.showToast('Cart cleared'); },
      error: () => this.showToast('Could not clear cart'),
    });
  }
  private loadCartCustSchemes(customerId?: string) {
    this.cartCustSchemes.set([]);
    if (!customerId) return;
    this.get(`customers/${customerId}/schemes`).subscribe((r) => this.cartCustSchemes.set(unwrap(r)));
  }
  stepLine(l: any, delta: number) {
    const p = { id: l.productId, name: l.productName, price: l.unitPrice, thumbnail: l.thumbnail };
    this.step(p, delta);
  }
  /** Debounced scheme evaluation — savings preview stays live as the cart changes. */
  private scheduleEval() {
    clearTimeout(this.evalTimer);
    if (!this.cart().length) { this.cartEval.set(null); return; }
    this.evalTimer = setTimeout(() => {
      this.post('cart', { customerId: this.cartCustomer()?.id, items: this.cart() }).subscribe({
        next: (r) => this.cartEval.set(unwrap(r)),
        error: () => this.cartEval.set(null),
      });
    }, 350);
  }
  openCart() {
    this.sheetError.set('');
    this.cartOpen.set(true);
    this.scheduleEval();
    if (!this.cartCustomer()) this.searchCartCustomers();
  }
  searchCartCustomers() {
    this.get('customers', { q: this.cartCustQ }).subscribe((r) => this.cartCustResults.set((unwrap<any[]>(r) || []).slice(0, 6)));
  }
  pickCartCustomer(c: any) {
    this.cartCustomer.set(c);
    this.loadCartCustSchemes(c?.id);
    this.scheduleEval(); // customer-specific schemes may now apply
  }
  startOrder() {
    this.cartCustomer.set(this.customer());
    this.loadCartCustSchemes(this.customer()?.id);
    this.editTarget.set(null);
    this.go('catalog');
  }
  submitOrder() {
    if (!this.cartCustomer()?.id || !this.cart().length) return;
    this.busy.set(true);
    this.post('orders', { customerId: this.cartCustomer().id, items: this.cart() }).subscribe({
      next: (r: any) => {
        const d = unwrap<any>(r);
        this.busy.set(false); this.cartOpen.set(false);
        this.cart.set([]); this.cartEval.set(null);
        const saved = Number(d?.schemeDiscount) || 0;
        const free = (d?.freeItems || []).reduce((s: number, f: any) => s + Number(f.quantity), 0);
        let msg = `✅ Order ${d?.orderNumber || 'placed'}`;
        if (saved) msg += ` · saved ₹${saved}`;
        if (free) msg += ` · ${free} free item(s)`;
        this.showToast(msg);
      },
      error: (e) => { this.busy.set(false); this.sheetError.set(e?.error?.message || 'Could not place order.'); },
    });
  }

  // ─── Collect ────────────────────────────────────────────────────────────────
  openCollect(bill: any) {
    this.collectFor.set(bill);
    this.colAmount = Number(bill.balanceDue) || null;
    this.colMethod.set('cash'); this.colInstrument = ''; this.colInstrumentDate = ''; this.colNote = '';
    this.colPromiseId = null; this.sheetError.set('');
  }
  openCollectForPromise(p: any) {
    this.collectFor.set({ id: p.invoiceId, invoiceNumber: p.invoiceNumber || 'On account', balanceDue: p.balanceDue ?? p.amount });
    this.colAmount = Number(p.amount) || null;
    this.colMethod.set('cash'); this.colInstrument = ''; this.colInstrumentDate = ''; this.colNote = '';
    this.colPromiseId = p.id; this.sheetError.set('');
  }
  submitCollect() {
    const bill = this.collectFor();
    if (!bill?.id) { this.sheetError.set('This promise has no linked invoice — collect from the customer\'s bill list.'); return; }
    if (!(Number(this.colAmount) > 0)) { this.sheetError.set('Enter the amount received.'); return; }
    if (this.colMethod() === 'cheque' && !this.colInstrument.trim()) { this.sheetError.set('Cheque number is required.'); return; }
    this.busy.set(true);
    this.post('collect', {
      invoiceId: bill.id, amount: Number(this.colAmount), method: this.colMethod(),
      instrumentNo: this.colInstrument || undefined, instrumentDate: this.colInstrumentDate || undefined,
      note: this.colNote || undefined, promiseId: this.colPromiseId || undefined,
    }).subscribe({
      next: () => {
        this.busy.set(false); this.collectFor.set(null); this.showToast('✅ Payment recorded');
        this.refreshHome();
        if (this.customer()) this.openCustomer(this.customer().id);
        if (this.view() === 'pending') this.go('pending');
        if (this.view() === 'followups') this.loadPromises();
      },
      error: (e) => { this.busy.set(false); this.sheetError.set(e?.error?.message || 'Could not record payment.'); },
    });
  }

  // ─── Promise ────────────────────────────────────────────────────────────────
  openPromise(bill: any) {
    this.promiseBill.set(bill);
    this.colCustomerId = this.customer()?.id || bill?.customerId || null;
    this.prAmount = bill ? Number(bill.balanceDue) || null : null;
    this.prDate = ''; this.prNote = ''; this.sheetError.set('');
    this.promiseSheet.set(true);
  }
  openPromiseFor(bill: any) {
    this.promiseBill.set(bill);
    this.colCustomerId = bill.customerId;
    this.prAmount = Number(bill.balanceDue) || null;
    this.prDate = ''; this.prNote = ''; this.sheetError.set('');
    this.promiseSheet.set(true);
  }
  submitPromise() {
    if (!this.colCustomerId) { this.sheetError.set('No customer selected.'); return; }
    if (!(Number(this.prAmount) > 0) || !this.prDate) { this.sheetError.set('Amount and date are required.'); return; }
    this.busy.set(true);
    this.post('promises', {
      customerId: this.colCustomerId, invoiceId: this.promiseBill()?.id || undefined,
      amount: Number(this.prAmount), promiseDate: this.prDate, note: this.prNote || undefined,
    }).subscribe({
      next: () => {
        this.busy.set(false); this.promiseSheet.set(false); this.showToast('📅 Promise saved');
        if (this.customer()) this.openCustomer(this.customer().id);
        if (this.view() === 'followups') this.loadPromises();
      },
      error: (e) => { this.busy.set(false); this.sheetError.set(e?.error?.message || 'Could not save promise.'); },
    });
  }
  markPromise(p: any, status: string) {
    this.http.patch(`${this.base}/promises/${p.id}`, { status }, this.qs()).subscribe({
      next: () => { this.showToast(status === 'broken' ? 'Marked not paid' : 'Updated'); this.loadPromises(); this.refreshHome(); },
      error: () => this.showToast('Could not update'),
    });
  }

  // ─── Beat / Visits / Perf ─────────────────────────────────────────────────────
  private ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  private initVisitRange() {
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - 6);
    this.visitFrom = this.ymd(from); this.visitTo = this.ymd(to);
  }
  pct(v: any, target: any) {
    const t = Number(target) || 0;
    if (t <= 0) return 0;
    return Math.min(100, Math.round(((Number(v) || 0) / t) * 100));
  }

  loadBeat() {
    this.beatLoading.set(true);
    this.get('beat').subscribe({
      next: (r) => { this.beat.set(unwrap<any[]>(r) || []); this.beatLoading.set(false); },
      error: () => { this.beat.set([]); this.beatLoading.set(false); },
    });
  }

  /** Best-effort geolocation — never blocks or fails the check-in. */
  private tryGeo(): Promise<{ latitude?: number; longitude?: number }> {
    return new Promise((resolve) => {
      try {
        if (!navigator?.geolocation) { resolve({}); return; }
        let done = false;
        const finish = (v: { latitude?: number; longitude?: number }) => { if (!done) { done = true; resolve(v); } };
        navigator.geolocation.getCurrentPosition(
          (pos) => finish({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          () => finish({}),
          { timeout: 4000, maximumAge: 60000 },
        );
        setTimeout(() => finish({}), 4500);
      } catch { resolve({}); }
    });
  }

  async checkIn(c: any) {
    if (this.busy()) return;
    this.busy.set(true);
    const geo = await this.tryGeo();
    this.visitNote = ''; this.visitOutcome = 'order_taken';
    this.post('checkin', {
      customerId: c.customer_id, customerName: c.name, purpose: 'sales',
      latitude: geo.latitude, longitude: geo.longitude,
    }).subscribe({
      next: (r) => {
        const v = unwrap<any>(r);
        this.activeVisit.set(v);
        this.activeVisitCustomerId.set(c.customer_id);
        this.busy.set(false);
        this.showToast('📍 Checked in');
      },
      error: (e) => { this.busy.set(false); this.showToast(e?.error?.message || 'Could not check in'); },
    });
  }

  checkOut() {
    const v = this.activeVisit();
    if (!v?.id) { this.showToast('No active visit'); return; }
    this.busy.set(true);
    this.post(`visits/${v.id}/checkout`, { outcome: this.visitOutcome, note: this.visitNote || undefined }).subscribe({
      next: () => {
        this.busy.set(false);
        this.activeVisit.set(null);
        this.activeVisitCustomerId.set(null);
        this.visitNote = '';
        this.showToast('✅ Checked out');
        this.loadBeat();
      },
      error: (e) => { this.busy.set(false); this.showToast(e?.error?.message || 'Could not check out'); },
    });
  }

  /** Jump to the existing catalog order flow for a beat customer. */
  takeOrderFor(c: any) {
    this.cartCustomer.set({ id: c.customer_id, name: c.name, phone: c.phone });
    this.loadCartCustSchemes(c.customer_id);
    this.editTarget.set(null);
    this.go('catalog');
  }

  loadVisits() {
    if (!this.visitFrom || !this.visitTo) this.initVisitRange();
    this.visitsLoading.set(true);
    this.get('visits', { from: this.visitFrom, to: this.visitTo }).subscribe({
      next: (r) => { this.visits.set(unwrap<any[]>(r) || []); this.visitsLoading.set(false); },
      error: () => { this.visits.set([]); this.visitsLoading.set(false); },
    });
  }

  loadPerf() {
    this.statsLoading.set(true);
    this.get('stats').subscribe({
      next: (r) => { this.stats.set(unwrap<any>(r)); this.statsLoading.set(false); },
      error: () => { this.stats.set(null); this.statsLoading.set(false); },
    });
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - 13);
    this.get('performance', { from: this.ymd(from), to: this.ymd(to) }).subscribe({
      next: (r) => this.perf.set(unwrap<any>(r)),
      error: () => this.perf.set(null),
    });
  }

  fmt(n: any) { return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  fmtQty(n: any) { return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
  showToast(msg: string) { this.toast.set(msg); setTimeout(() => this.toast.set(''), 3000); }

  /** Short currency (₹1.2L / ₹45.3k) for big at-a-glance figures; falls back to full fmt() below 1k. */
  fmtShort(n: any): string {
    const v = Number(n) || 0;
    const s = v < 0 ? '-' : '';
    const a = Math.abs(v);
    if (a >= 1e7) return `${s}${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
    if (a >= 1e5) return `${s}${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
    if (a >= 1e3) return `${s}${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
    return this.fmt(v);
  }

  /** Amount still needed to hit a target (never negative). */
  remaining(done: any, target: any): number {
    const r = (Number(target) || 0) - (Number(done) || 0);
    return r > 0 ? r : 0;
  }

  /** True once a target is met, so we can switch to an encouraging done-state. */
  hit(done: any, target: any): boolean {
    const t = Number(target) || 0;
    return t > 0 && (Number(done) || 0) >= t;
  }

  /** Savings % of MRP vs selling price, rounded (0 if not a discount). */
  discountPct(price: any, mrp: any): number {
    const m = Number(mrp) || 0, s = Number(price) || 0;
    if (m <= 0 || s >= m) return 0;
    return Math.round(((m - s) / m) * 100);
  }

  /** Days a bill is overdue (0 if not past due / no date). */
  daysOverdue(dateStr: any): number {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 0;
    const ms = Date.now() - d.getTime();
    const days = Math.floor(ms / 86400000);
    return days > 0 ? days : 0;
  }

  /** Time-of-day greeting for the Home header. */
  greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /** Plain-language relative time: "just now", "3 hrs ago", "2 days ago", "never". */
  rel(dateStr: any): string {
    if (!dateStr) return 'never';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const secs = Math.round((Date.now() - d.getTime()) / 1000);
    const future = secs < 0;
    const s = Math.abs(secs);
    const mins = Math.round(s / 60), hrs = Math.round(s / 3600), days = Math.round(s / 86400);
    let out: string;
    if (s < 45) out = 'just now';
    else if (mins < 60) out = `${mins} min`;
    else if (hrs < 24) out = `${hrs} hr${hrs === 1 ? '' : 's'}`;
    else if (days < 30) out = `${days} day${days === 1 ? '' : 's'}`;
    else { const mo = Math.round(days / 30); out = `${mo} mo${mo === 1 ? '' : 's'}`; }
    if (out === 'just now') return out;
    return future ? `in ${out}` : `${out} ago`;
  }
}
