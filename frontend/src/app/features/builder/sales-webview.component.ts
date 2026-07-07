import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';

type Tab = 'home' | 'catalog' | 'offers' | 'customers' | 'pending' | 'followups';

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
    <div class="min-h-screen bg-gray-50 text-gray-900 pb-28">
      <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div class="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <i class="pi pi-briefcase" style="font-size:1.05rem"></i>
          </div>
          <div class="min-w-0 flex-1">
            <h1 class="text-[15px] font-bold truncate leading-tight">Sales App</h1>
            <p class="text-[11px] text-gray-400 leading-tight truncate">{{ me()?.name || '…' }} {{ me()?.route ? '· ' + me()?.route : '' }}</p>
          </div>
        </div>
        @if (authed()) {
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
        }
      </header>

      @if (loadError()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.5rem"></i>
            <p class="text-sm font-semibold text-red-800">{{ loadError() }}</p>
            <p class="text-xs text-red-500 mt-1">Ask your admin to share a fresh link.</p>
          </div>
        </div>
      } @else if (authed()) {
        <main class="max-w-2xl mx-auto px-4 py-4">

          <!-- ── HOME ─────────────────────────────────────────────── -->
          @if (view() === 'home') {
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-white rounded-2xl border border-gray-100 p-4">
                <p class="text-[11px] font-semibold text-gray-400 uppercase">Market outstanding</p>
                <p class="text-xl font-bold tabular-nums mt-1">₹{{ fmt(home()?.pendingTotal) }}</p>
                <p class="text-[11px] text-gray-400">{{ home()?.pendingBills || 0 }} open bill(s)</p>
              </div>
              <div class="bg-white rounded-2xl border border-gray-100 p-4">
                <p class="text-[11px] font-semibold text-gray-400 uppercase">Collected today</p>
                <p class="text-xl font-bold tabular-nums mt-1 text-emerald-700">₹{{ fmt(home()?.collectedToday?.amount) }}</p>
                <p class="text-[11px] text-gray-400">{{ home()?.collectedToday?.count || 0 }} receipt(s)</p>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3 mt-3">
              <button (click)="go('catalog')" class="bg-indigo-600 text-white rounded-2xl p-4 text-left">
                <i class="pi pi-shopping-bag"></i>
                <p class="text-sm font-bold mt-1">Take an order</p>
                <p class="text-[11px] opacity-80">Browse items, build the cart</p>
              </button>
              <button (click)="go('offers')" class="bg-amber-500 text-white rounded-2xl p-4 text-left">
                <i class="pi pi-percentage"></i>
                <p class="text-sm font-bold mt-1">Running offers</p>
                <p class="text-[11px] opacity-90">{{ schemes().length || '…' }} scheme(s) to pitch</p>
              </button>
            </div>
            <h2 class="text-[13px] font-bold text-gray-500 uppercase mt-5 mb-2">Promises due today</h2>
            @if (!home()?.promisesDue?.length) {
              <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">No follow-ups due. 🎉</p>
            }
            @for (p of home()?.promisesDue || []; track p.id) {
              <div class="bg-white rounded-xl border border-amber-200 p-3 mb-2">
                <div class="flex items-center justify-between">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ p.customerName }}</p>
                    <p class="text-[11px] text-gray-400">{{ p.invoiceNumber || 'On account' }} · promised {{ p.promiseDate | date:'d MMM' }}</p>
                  </div>
                  <p class="text-sm font-bold tabular-nums text-amber-700">₹{{ fmt(p.amount) }}</p>
                </div>
                <div class="flex gap-2 mt-2">
                  <button (click)="openCollectForPromise(p)" class="flex-1 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg py-1.5">Collect now</button>
                  <button (click)="markPromise(p, 'broken')" class="text-[12px] font-semibold text-red-600 border border-red-200 rounded-lg px-3">Not paid</button>
                </div>
              </div>
            }
          }

          <!-- ── CATALOG ──────────────────────────────────────────── -->
          @if (view() === 'catalog') {
            @if (cartCustomer()) {
              <div class="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 mb-3">
                <i class="pi pi-user text-indigo-500 text-sm"></i>
                <p class="text-[13px] font-semibold text-indigo-800 flex-1 truncate">Ordering for {{ cartCustomer()?.name }}</p>
                <button (click)="cartCustomer.set(null)" class="text-[11px] font-semibold text-indigo-600">Change</button>
              </div>
            }
            <input [(ngModel)]="prodQ" (ngModelChange)="searchProducts()" placeholder="Search items / barcode…"
              class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3 bg-white" />
            <div class="grid grid-cols-2 gap-3">
              @for (p of products(); track p.id) {
                <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
                  <div class="relative aspect-[4/3] bg-gray-50 flex items-center justify-center">
                    @if (p.thumbnail) {
                      <img [src]="p.thumbnail" class="w-full h-full object-cover" loading="lazy" />
                    } @else {
                      <i class="pi pi-box text-gray-200" style="font-size:2rem"></i>
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
                    <div class="flex items-baseline gap-1.5 mt-1">
                      <p class="text-sm font-bold tabular-nums">₹{{ fmt(p.price) }}</p>
                      @if (p.mrp && +p.mrp > +p.price) {
                        <p class="text-[11px] text-gray-400 line-through tabular-nums">₹{{ fmt(p.mrp) }}</p>
                      }
                    </div>
                    @if (p.wholesalePrice && p.wholesaleMinQty) {
                      <p class="text-[10px] text-indigo-600">₹{{ fmt(p.wholesalePrice) }} for {{ p.wholesaleMinQty }}+</p>
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
              } @empty { <p class="col-span-2 text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">No items found.</p> }
            </div>
          }

          <!-- ── OFFERS ───────────────────────────────────────────── -->
          @if (view() === 'offers') {
            @for (s of schemes(); track s.id) {
              <div class="bg-white rounded-2xl border border-amber-200 p-4 mb-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-bold">{{ s.name }}</p>
                    @if (s.description) { <p class="text-[12px] text-gray-500 mt-0.5">{{ s.description }}</p> }
                  </div>
                  <span class="shrink-0 bg-amber-500 text-white text-[11px] font-bold px-2 py-1 rounded-lg">{{ s.benefit }}</span>
                </div>
                <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-500">
                  <span><i class="pi pi-tag text-[10px]"></i> On {{ s.appliesTo }}</span>
                  @if (s.minQty) { <span>Min qty {{ s.minQty }}</span> }
                  @if (s.minCartValue) { <span>Orders above ₹{{ fmt(s.minCartValue) }}</span> }
                  @if (s.validUntil) { <span>Till {{ s.validUntil | date:'d MMM' }}</span> }
                  @if (s.combinable) { <span class="text-emerald-600">Stacks with other offers</span> }
                </div>
              </div>
            } @empty { <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">No running schemes right now.</p> }
          }

          <!-- ── CUSTOMERS ────────────────────────────────────────── -->
          @if (view() === 'customers') {
            @if (!customer()) {
              <input [(ngModel)]="custQ" (ngModelChange)="searchCustomers()" placeholder="Search name / phone / area…"
                class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3 bg-white" />
              @for (c of customers(); track c.id) {
                <button (click)="openCustomer(c.id)" class="w-full text-left bg-white rounded-xl border border-gray-100 p-3 mb-2 active:bg-gray-50">
                  <div class="flex items-center justify-between">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold truncate">{{ c.name }}</p>
                      <p class="text-[11px] text-gray-400">{{ c.phone }} {{ c.area ? '· ' + c.area : '' }}</p>
                    </div>
                    <div class="text-right shrink-0">
                      <p class="text-sm font-bold tabular-nums" [class.text-red-600]="+c.outstanding > 0">₹{{ fmt(c.outstanding) }}</p>
                      <p class="text-[11px] text-gray-400">{{ c.openBills }} bill(s)</p>
                    </div>
                  </div>
                </button>
              }
            } @else {
              <button (click)="customer.set(null)" class="text-[12px] font-semibold text-indigo-700 mb-2"><i class="pi pi-arrow-left mr-1"></i>All customers</button>
              <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
                <p class="text-base font-bold">{{ customer()?.name }}</p>
                <p class="text-[12px] text-gray-400">{{ customer()?.phone }} {{ customer()?.area ? '· ' + customer()?.area : '' }}</p>
                <div class="flex gap-2 mt-3">
                  <button (click)="startOrder()" class="flex-1 text-[13px] font-semibold bg-indigo-600 text-white rounded-xl py-2">+ New order</button>
                  <button (click)="openPromise(null)" class="flex-1 text-[13px] font-semibold border border-amber-300 text-amber-700 rounded-xl py-2">Promise to pay</button>
                </div>
              </div>
              <h2 class="text-[13px] font-bold text-gray-500 uppercase mb-2">Open bills</h2>
              @if (!customer()?.bills?.length) { <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">Nothing outstanding. 🎉</p> }
              @for (b of customer()?.bills || []; track b.id) {
                <div class="bg-white rounded-xl border border-gray-100 p-3 mb-2">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm font-semibold">{{ b.invoiceNumber }}</p>
                      <p class="text-[11px] text-gray-400">{{ b.issuedAt | date:'d MMM yy' }} {{ b.dueDate ? '· due ' + (b.dueDate | date:'d MMM') : '' }}</p>
                    </div>
                    <div class="text-right">
                      <p class="text-sm font-bold tabular-nums text-red-600">₹{{ fmt(b.balanceDue) }}</p>
                      <p class="text-[10px] text-gray-400">of ₹{{ fmt(b.total) }}</p>
                    </div>
                  </div>
                  <div class="flex gap-2 mt-2">
                    <button (click)="openCollect(b)" class="flex-1 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg py-1.5">₹ Collect</button>
                    <button (click)="openPromise(b)" class="text-[12px] font-semibold text-amber-700 border border-amber-300 rounded-lg px-3">Promise</button>
                  </div>
                </div>
              }
              @if (customer()?.promises?.length) {
                <h2 class="text-[13px] font-bold text-gray-500 uppercase mt-4 mb-2">Open promises</h2>
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
            @for (b of pending(); track b.id) {
              <div class="bg-white rounded-xl border border-gray-100 p-3 mb-2">
                <div class="flex items-center justify-between">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ b.customerName }}</p>
                    <p class="text-[11px] text-gray-400">{{ b.invoiceNumber }} · {{ b.issuedAt | date:'d MMM' }} {{ b.dueDate ? '· due ' + (b.dueDate | date:'d MMM') : '' }}</p>
                  </div>
                  <p class="text-sm font-bold tabular-nums text-red-600 shrink-0">₹{{ fmt(b.balanceDue) }}</p>
                </div>
                <div class="flex gap-2 mt-2">
                  <button (click)="openCollect(b)" class="flex-1 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg py-1.5">₹ Collect</button>
                  <button (click)="openPromiseFor(b)" class="text-[12px] font-semibold text-amber-700 border border-amber-300 rounded-lg px-3">Promise</button>
                </div>
              </div>
            } @empty { <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">No pending bills. 🎉</p> }
          }

          <!-- ── FOLLOW-UPS ───────────────────────────────────────── -->
          @if (view() === 'followups') {
            <div class="flex gap-1 mb-3">
              @for (s of ['due','open','all']; track s) {
                <button (click)="promiseScope.set(s); loadPromises()"
                  class="px-3 py-1.5 text-[12px] font-semibold rounded-full border"
                  [class.bg-indigo-600]="promiseScope() === s" [class.text-white]="promiseScope() === s"
                  [class.border-indigo-600]="promiseScope() === s" [class.border-gray-200]="promiseScope() !== s"
                  [class.text-gray-500]="promiseScope() !== s">{{ s | titlecase }}</button>
              }
            </div>
            @for (p of promiseList(); track p.id) {
              <div class="bg-white rounded-xl border p-3 mb-2"
                [class.border-amber-300]="p.status === 'open'" [class.border-gray-100]="p.status !== 'open'">
                <div class="flex items-center justify-between">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ p.customerName }}</p>
                    <p class="text-[11px] text-gray-400">{{ p.invoiceNumber || 'On account' }} · {{ p.promiseDate | date:'d MMM yy' }} · {{ p.status }}</p>
                    @if (p.note) { <p class="text-[11px] text-gray-500 mt-0.5">{{ p.note }}</p> }
                  </div>
                  <p class="text-sm font-bold tabular-nums shrink-0">₹{{ fmt(p.amount) }}</p>
                </div>
                @if (p.status === 'open') {
                  <div class="flex gap-2 mt-2">
                    <button (click)="openCollectForPromise(p)" class="flex-1 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg py-1.5">Collect now</button>
                    <button (click)="markPromise(p, 'broken')" class="text-[12px] font-semibold text-red-600 border border-red-200 rounded-lg px-3">Not paid</button>
                  </div>
                }
              </div>
            } @empty { <p class="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4">No follow-ups here.</p> }
          }
        </main>
      }

      <!-- ── STICKY CART BAR ────────────────────────────────────── -->
      @if (authed() && cart().length && !cartOpen()) {
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
            } @else {
              <p class="text-[12px] font-semibold text-gray-500 mb-1">Who is this order for?</p>
              <input [(ngModel)]="cartCustQ" (ngModelChange)="searchCartCustomers()" placeholder="Search customer…"
                class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-2" />
              @for (c of cartCustResults(); track c.id) {
                <button (click)="pickCartCustomer(c)" class="w-full text-left flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 mb-1">
                  <span class="text-[13px] font-medium truncate">{{ c.name }}</span>
                  <span class="text-[11px] text-gray-400 shrink-0">{{ c.phone }}</span>
                </button>
              }
            }

            <!-- Lines -->
            @for (l of cart(); track l.productId) {
              <div class="flex items-center gap-2 mb-2">
                <div class="w-9 h-9 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                  @if (l.thumbnail) { <img [src]="l.thumbnail" class="w-full h-full object-cover" /> }
                  @else { <i class="pi pi-box text-gray-300 text-sm"></i> }
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[13px] font-medium truncate">{{ l.productName }}</p>
                  <p class="text-[11px] text-gray-400 tabular-nums">₹{{ fmt(l.unitPrice) }} × {{ l.quantity }} = ₹{{ fmt(l.unitPrice * l.quantity) }}</p>
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
            <div class="border-t border-gray-100 pt-2 mt-2 text-[13px] space-y-1">
              <div class="flex justify-between text-gray-500"><span>Subtotal</span><span class="tabular-nums">₹{{ fmt(cartSubtotal()) }}</span></div>
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
            <p class="text-[12px] text-gray-400 mb-3">{{ bill.invoiceNumber }} · balance ₹{{ fmt(bill.balanceDue) }}</p>
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Amount</label>
            <input type="number" [(ngModel)]="colAmount" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3" />
            <label class="text-[11px] font-semibold text-gray-500 uppercase">Payment type</label>
            <div class="grid grid-cols-4 gap-1.5 mb-3 mt-1">
              @for (m of ['cash','cheque','upi','online']; track m) {
                <button (click)="colMethod.set(m)"
                  class="py-2 text-[12px] font-semibold rounded-xl border"
                  [class.bg-indigo-600]="colMethod() === m" [class.text-white]="colMethod() === m"
                  [class.border-indigo-600]="colMethod() === m" [class.border-gray-200]="colMethod() !== m">{{ m | titlecase }}</button>
              }
            </div>
            @if (colMethod() === 'cheque' || colMethod() === 'online' || colMethod() === 'upi') {
              <label class="text-[11px] font-semibold text-gray-500 uppercase">{{ colMethod() === 'cheque' ? 'Cheque number' : 'Transaction ref' }}</label>
              <input [(ngModel)]="colInstrument" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm mb-3"
                [placeholder]="colMethod() === 'cheque' ? '6-digit cheque no' : 'UTR / UPI ref'" />
            }
            @if (colMethod() === 'cheque') {
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
            <p class="text-[12px] text-gray-400 mb-3">{{ promiseBill()?.invoiceNumber || 'On account' }} — customer will pay on the chosen date; it shows in Follow-ups.</p>
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
  readonly pending = signal<any[]>([]);
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
  }

  refreshHome() {
    this.get('me').subscribe((r) => { const d = unwrap<any>(r); this.me.set(d.salesman); this.home.set(d); });
  }

  searchCustomers() {
    this.get('customers', { q: this.custQ }).subscribe((r) => this.customers.set(unwrap(r)));
  }
  openCustomer(id: string) {
    this.get(`customers/${id}`).subscribe((r) => this.customer.set(unwrap(r)));
  }
  loadPromises() {
    this.get('promises', { scope: this.promiseScope() }).subscribe((r) => this.promiseList.set(unwrap(r)));
  }

  // ─── Catalog + cart ─────────────────────────────────────────────────────────
  searchProducts() {
    this.get('products', { q: this.prodQ }).subscribe((r) => this.products.set(unwrap(r)));
  }
  qtyOf(productId: string): number {
    return this.cart().find((l) => l.productId === productId)?.quantity || 0;
  }
  step(p: any, delta: number) {
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
    this.scheduleEval(); // customer-specific schemes may now apply
  }
  startOrder() {
    this.cartCustomer.set(this.customer());
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

  fmt(n: any) { return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  fmtQty(n: any) { return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
  showToast(msg: string) { this.toast.set(msg); setTimeout(() => this.toast.set(''), 3000); }
}
