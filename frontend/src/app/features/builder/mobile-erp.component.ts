import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';
import { returnToWhatsApp } from './webview-return';

type Tab = 'dashboard' | 'orders' | 'invoices' | 'catalog' | 'customers' | 'taxes' | 'eway';

const unwrap = <T>(r: any): T => (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;
/** Invoice list comes back as { data: [...] } inside the envelope → unwrap twice. */
const unwrapList = (r: any): any[] => {
  const inner = unwrap<any>(r);
  return Array.isArray(inner) ? inner : Array.isArray(inner?.data) ? inner.data : [];
};

const ORDER_STATUS_OPTIONS = [
  { id: 'confirmed', title: '✅ Confirm' },
  { id: 'processing', title: '👨‍🍳 Processing' },
  { id: 'ready_for_delivery', title: '📦 Ready / Shipped' },
  { id: 'delivered', title: '🚚 Delivered' },
  { id: 'cancelled', title: '❌ Cancel' },
];

/**
 * ERP Console — a token-authenticated WhatsApp webview (`/m/erp`) that lets an
 * admin run their whole business from inside WhatsApp: dashboard, orders,
 * invoices, catalog and customers. Auth is purely the ?token= 'erp' session; it
 * uses a bare HttpClient so no app session/interceptors are involved. The ?view=
 * query param deep-links to a tab (opened from a specific WhatsApp menu option).
 */
@Component({
  selector: 'wa-mobile-erp',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900 pb-24">
      <!-- Header -->
      <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div class="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-green-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <i class="pi pi-th-large" style="font-size:1.05rem"></i>
          </div>
          <div class="min-w-0 flex-1">
            <h1 class="text-[15px] font-bold text-gray-900 truncate leading-tight">ERP Console</h1>
            <p class="text-[11px] text-gray-400 leading-tight truncate">{{ store() || 'Store' }}</p>
          </div>
          <button (click)="back()" class="text-[12px] font-semibold text-green-700 px-2 py-1 rounded-lg hover:bg-green-50">
            Done
          </button>
        </div>
        <!-- Tabs -->
        @if (token() && !loadError()) {
          <div class="max-w-2xl mx-auto px-2 flex gap-1 overflow-x-auto no-scrollbar">
            @for (t of tabs; track t.id) {
              <button
                (click)="go(t.id)"
                class="px-3 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-colors"
                [class.border-green-600]="view() === t.id"
                [class.text-green-700]="view() === t.id"
                [class.border-transparent]="view() !== t.id"
                [class.text-gray-400]="view() !== t.id"
              >{{ t.label }}</button>
            }
          </div>
        }
      </header>

      @if (!token() || loadError()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.5rem"></i>
            <p class="text-sm font-semibold text-red-800">{{ loadError() || 'Missing or invalid link.' }}</p>
            <p class="text-xs text-red-500 mt-1">Open this from your WhatsApp menu again to get a fresh link.</p>
          </div>
        </div>
      } @else {
        <main class="max-w-2xl mx-auto px-4 py-4">
          <!-- ── DASHBOARD ─────────────────────────────────────────── -->
          @if (view() === 'dashboard') {
            @if (dash(); as d) {
              <div class="grid grid-cols-2 gap-3">
                <div class="bg-white rounded-2xl border border-gray-100 p-4">
                  <p class="text-[11px] font-semibold text-gray-400 uppercase">Sales today</p>
                  <p class="text-xl font-bold tabular-nums mt-1">{{ cur() }}{{ fmt(d.salesToday.amount) }}</p>
                  <p class="text-[11px] text-gray-400">{{ d.salesToday.count }} invoice(s)</p>
                </div>
                <div class="bg-white rounded-2xl border border-gray-100 p-4">
                  <p class="text-[11px] font-semibold text-gray-400 uppercase">This month</p>
                  <p class="text-xl font-bold tabular-nums mt-1">{{ cur() }}{{ fmt(d.salesThisMonth) }}</p>
                </div>
                <div class="bg-white rounded-2xl border border-gray-100 p-4">
                  <p class="text-[11px] font-semibold text-gray-400 uppercase">Receivables</p>
                  <p class="text-xl font-bold tabular-nums mt-1 text-red-600">{{ cur() }}{{ fmt(d.receivables.amount) }}</p>
                  <p class="text-[11px] text-gray-400">{{ d.receivables.count }} unpaid</p>
                </div>
                <div class="bg-white rounded-2xl border border-gray-100 p-4">
                  <p class="text-[11px] font-semibold text-gray-400 uppercase">Open orders</p>
                  <p class="text-xl font-bold tabular-nums mt-1">{{ d.openOrders }}</p>
                </div>
              </div>
              @if (d.topProducts?.length) {
                <h3 class="text-xs font-bold text-gray-500 uppercase mt-5 mb-2">Top products</h3>
                <div class="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
                  @for (p of d.topProducts; track p.name) {
                    <div class="flex justify-between items-center px-4 py-2.5 text-sm">
                      <span class="truncate">{{ p.name }}</span>
                      <span class="font-semibold tabular-nums shrink-0 ml-3">{{ cur() }}{{ fmt(p.revenue) }}</span>
                    </div>
                  }
                </div>
              }
              @if (d.lowStock?.length) {
                <h3 class="text-xs font-bold text-gray-500 uppercase mt-5 mb-2">Low stock</h3>
                <div class="bg-white rounded-2xl border border-amber-100 divide-y divide-amber-50">
                  @for (p of d.lowStock; track p.name) {
                    <div class="flex justify-between items-center px-4 py-2.5 text-sm">
                      <span class="truncate">{{ p.name }}</span>
                      <span class="font-semibold text-amber-600 tabular-nums shrink-0 ml-3">{{ p.stock }} left</span>
                    </div>
                  }
                </div>
              }
            } @else if (busy()) { <p class="text-center text-gray-400 py-10 text-sm">Loading…</p> }
          }

          <!-- ── ORDERS ────────────────────────────────────────────── -->
          @if (view() === 'orders') {
            <div class="flex items-center gap-2 mb-3">
              <select [(ngModel)]="orderFilter" (ngModelChange)="loadOrders()" class="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                <option value="open">Open orders</option>
                <option value="all">All orders</option>
                <option value="confirmed">Confirmed</option>
                <option value="processing">Processing</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button (click)="newOrder()" class="bg-green-600 text-white text-sm font-semibold px-3 py-2 rounded-xl shrink-0">+ New</button>
            </div>
            @for (o of orders(); track o.id) {
              <button (click)="openOrder(o)" class="w-full text-left bg-white rounded-2xl border border-gray-100 p-3.5 mb-2 flex items-center gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-gray-900 truncate">#{{ o.orderNumber }} · {{ o.customerName || o.customerPhone || 'Customer' }}</p>
                  <p class="text-[11px] text-gray-400">{{ o.createdAt | date:'medium' }}</p>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-sm font-bold tabular-nums">{{ cur() }}{{ fmt(o.total) }}</p>
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full" [class]="statusClass(o.status)">{{ label(o.status) }}</span>
                </div>
              </button>
            } @empty { <p class="text-center text-gray-400 py-10 text-sm">{{ busy() ? 'Loading…' : 'No orders.' }}</p> }
          }

          <!-- ── INVOICES ──────────────────────────────────────────── -->
          @if (view() === 'invoices') {
            <div class="flex items-center gap-2 mb-3">
              <select [(ngModel)]="invoiceFilter" (ngModelChange)="loadInvoices()" class="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                <option value="">All invoices</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
              <button (click)="newInvoice()" class="bg-green-600 text-white text-sm font-semibold px-3 py-2 rounded-xl shrink-0">+ New</button>
            </div>
            @for (inv of invoices(); track inv.id) {
              <button (click)="openInvoice(inv)" class="w-full text-left bg-white rounded-2xl border border-gray-100 p-3.5 mb-2 flex items-center gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-gray-900 truncate">{{ inv.invoiceNumber }} · {{ inv.customerName || 'Customer' }}</p>
                  <p class="text-[11px] text-gray-400">{{ (inv.issuedAt || inv.createdAt) | date:'mediumDate' }}</p>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-sm font-bold tabular-nums">{{ sym(inv.currency) }}{{ fmt(inv.total) }}</p>
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full" [class]="payClass(inv.paymentStatus)">{{ label(inv.paymentStatus) }}</span>
                </div>
              </button>
            } @empty { <p class="text-center text-gray-400 py-10 text-sm">{{ busy() ? 'Loading…' : 'No invoices.' }}</p> }
          }

          <!-- ── CATALOG ───────────────────────────────────────────── -->
          @if (view() === 'catalog') {
            <input [(ngModel)]="productQuery" (ngModelChange)="onProductSearch()" placeholder="Search products…"
              class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white mb-3" />
            @for (p of products(); track p.id) {
              <button (click)="openProduct(p)" class="w-full text-left bg-white rounded-2xl border border-gray-100 p-3.5 mb-2 flex items-center gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-gray-900 truncate">{{ p.name }}</p>
                  <p class="text-[11px] text-gray-400">{{ p.brand || '—' }}{{ p.track ? ' · stock ' + p.stock : '' }}{{ p.isActive ? '' : ' · inactive' }}</p>
                </div>
                <p class="text-sm font-bold tabular-nums shrink-0">{{ sym(p.currency) }}{{ fmt(p.price) }}</p>
              </button>
            } @empty { <p class="text-center text-gray-400 py-10 text-sm">{{ busy() ? 'Loading…' : 'No products.' }}</p> }
          }

          <!-- ── CUSTOMERS ─────────────────────────────────────────── -->
          @if (view() === 'customers') {
            <select [(ngModel)]="customerSegment" (ngModelChange)="loadCustomers()" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white mb-2">
              <option value="all">All customers</option>
              <option value="dues">With dues</option>
              <option value="top">Top spenders</option>
              <option value="repeat">Repeat buyers</option>
              <option value="new">New (last 30 days)</option>
              <option value="inactive">Inactive</option>
            </select>
            <input [(ngModel)]="customerQuery" (ngModelChange)="onCustomerSearch()" placeholder="Search customers…"
              class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white mb-3" />
            @for (c of customers(); track c.id) {
              <button (click)="openCustomer(c)" class="w-full text-left bg-white rounded-2xl border border-gray-100 p-3.5 mb-2 flex items-center gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-gray-900 truncate">{{ c.name || c.phone }}</p>
                  <p class="text-[11px] text-gray-400">{{ c.phone }}{{ c.orderCount ? ' · ' + c.orderCount + ' orders' : '' }}</p>
                </div>
                <p class="text-sm font-bold tabular-nums shrink-0">{{ cur() }}{{ fmt(c.totalSpent) }}</p>
              </button>
            } @empty { <p class="text-center text-gray-400 py-10 text-sm">{{ busy() ? 'Loading…' : 'No customers.' }}</p> }
          }

          <!-- ── TAX RATES ─────────────────────────────────────────── -->
          @if (view() === 'taxes') {
            <div class="bg-white rounded-2xl border border-gray-100 p-3.5 mb-3">
              <p class="text-xs font-bold text-gray-500 uppercase mb-2">Add tax rate</p>
              <div class="flex gap-2">
                <input [(ngModel)]="newTaxName" placeholder="Name e.g. GST 18%" class="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" />
                <input type="number" [(ngModel)]="newTaxRate" placeholder="%" class="w-16 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" />
                <button (click)="addTax()" [disabled]="saving()" class="bg-green-600 text-white text-sm font-semibold px-3 py-2 rounded-xl shrink-0 disabled:opacity-50">Add</button>
              </div>
              <p class="text-[11px] text-gray-400 mt-1">Enter the percentage — e.g. 18 for 18%.</p>
            </div>
            @for (t of taxRates(); track t.id) {
              <div class="w-full text-left bg-white rounded-2xl border border-gray-100 p-3.5 mb-2 flex items-center gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-gray-900 truncate">{{ t.name }}{{ t.isDefault ? ' · default' : '' }}</p>
                  <p class="text-[11px] text-gray-400">{{ t.enabled ? 'Enabled' : 'Disabled' }}</p>
                </div>
                <p class="text-sm font-bold tabular-nums shrink-0">{{ t.rate }}%</p>
              </div>
            } @empty { <p class="text-center text-gray-400 py-10 text-sm">{{ busy() ? 'Loading…' : 'No tax rates yet.' }}</p> }
          }

          <!-- ── E-WAY BILLS ───────────────────────────────────────── -->
          @if (view() === 'eway') {
            <button (click)="openInPortal('/erp/eway-bills')"
              class="w-full bg-green-600 text-white text-sm font-semibold px-3 py-2.5 rounded-xl mb-3 flex items-center justify-center gap-2">
              <i class="pi pi-plus"></i> Generate / manage in portal
            </button>
            @for (b of ewayBills(); track b.id) {
              <div class="bg-white rounded-2xl border border-gray-100 p-3.5 mb-2 flex items-center gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-gray-900 truncate">{{ b.ewayNumber }}{{ b.invoiceNumber ? ' · ' + b.invoiceNumber : '' }}</p>
                  <p class="text-[11px] text-gray-400">{{ label(b.status) }}{{ b.vehicleNumber ? ' · ' + b.vehicleNumber : '' }}{{ b.validUntil ? ' · till ' + (b.validUntil | date:'mediumDate') : '' }}</p>
                </div>
                <p class="text-sm font-bold tabular-nums shrink-0">{{ cur() }}{{ fmt(b.value) }}</p>
                <button (click)="downloadEway(b)" class="shrink-0 text-green-700 hover:text-green-800 p-1" aria-label="Download PDF"><i class="pi pi-download" style="font-size:0.95rem"></i></button>
              </div>
            } @empty { <p class="text-center text-gray-400 py-10 text-sm">{{ busy() ? 'Loading…' : 'No e-way bills yet.' }}</p> }
          }
        </main>
      }

      <!-- ── Order detail sheet ─────────────────────────────────────── -->
      @if (orderDetail(); as o) {
        <div class="fixed inset-0 z-40 bg-black/40 flex items-end" (click)="orderDetail.set(null)">
          <div class="bg-white w-full max-w-2xl mx-auto rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto" (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-base font-bold">Order #{{ o.orderNumber }}</h2>
              <button (click)="orderDetail.set(null)" class="text-gray-400"><i class="pi pi-times"></i></button>
            </div>
            <p class="text-sm text-gray-500 mb-3">{{ o.customerName || o.customerPhone }}</p>
            <div class="border border-gray-100 rounded-xl divide-y divide-gray-50 mb-4">
              @for (it of o.items || []; track $index) {
                <div class="flex justify-between px-3 py-2 text-sm">
                  <span class="truncate">{{ it.productName }} ×{{ it.quantity }}</span>
                  <span class="tabular-nums shrink-0 ml-2">{{ cur() }}{{ fmt(it.totalPrice) }}</span>
                </div>
              }
            </div>
            <p class="text-right font-bold mb-4">Total {{ cur() }}{{ fmt(o.total) }}</p>
            <p class="text-xs font-bold text-gray-500 uppercase mb-2">Set status</p>
            <div class="grid grid-cols-2 gap-2">
              @for (s of orderStatusOptions; track s.id) {
                <button (click)="setOrderStatus(o, s.id)" [disabled]="saving()"
                  class="border border-gray-200 rounded-xl py-2 text-sm font-semibold disabled:opacity-50">{{ s.title }}</button>
              }
            </div>
            <button (click)="openInPortal('/orders/' + o.id)"
              class="w-full border border-gray-200 text-gray-700 font-semibold rounded-xl py-2.5 text-sm mt-3 flex items-center justify-center gap-2">
              <i class="pi pi-external-link" style="font-size:0.8rem"></i> Open order in portal
            </button>
          </div>
        </div>
      }

      <!-- ── Invoice detail sheet ───────────────────────────────────── -->
      @if (invoiceDetail(); as inv) {
        <div class="fixed inset-0 z-40 bg-black/40 flex items-end" (click)="invoiceDetail.set(null)">
          <div class="bg-white w-full max-w-2xl mx-auto rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto" (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-base font-bold">{{ inv.invoiceNumber }}</h2>
              <button (click)="invoiceDetail.set(null)" class="text-gray-400"><i class="pi pi-times"></i></button>
            </div>
            <p class="text-sm text-gray-500 mb-3">{{ inv.customerName || 'Customer' }}</p>
            <div class="bg-gray-50 rounded-xl p-3 text-sm mb-4">
              <div class="flex justify-between"><span class="text-gray-500">Total</span><span class="tabular-nums">{{ sym(inv.currency) }}{{ fmt(inv.total) }}</span></div>
              <div class="flex justify-between text-green-600"><span>Paid</span><span class="tabular-nums">{{ sym(inv.currency) }}{{ fmt(inv.amountPaid) }}</span></div>
              <div class="flex justify-between font-bold border-t border-gray-200 mt-1 pt-1"><span>Balance</span><span class="tabular-nums text-red-600">{{ sym(inv.currency) }}{{ fmt(inv.balanceDue) }}</span></div>
            </div>
            @if (inv.paymentStatus !== 'paid') {
              <p class="text-xs font-bold text-gray-500 uppercase mb-2">Record payment</p>
              <div class="flex flex-col gap-2">
                <input type="number" [(ngModel)]="payAmount" placeholder="Amount" class="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                @if (paymentModes().length) {
                  <select [(ngModel)]="payModeId" class="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                    <option [ngValue]="null">Payment mode…</option>
                    @for (m of paymentModes(); track m.id) { <option [ngValue]="m.id">{{ m.name }}</option> }
                  </select>
                }
                <button (click)="recordPayment(inv)" [disabled]="saving()"
                  class="bg-green-600 text-white font-semibold rounded-xl py-2.5 text-sm disabled:opacity-50">Record payment</button>
              </div>
            } @else {
              <p class="text-center text-green-600 font-semibold text-sm py-2">✓ Fully paid</p>
            }
            <button (click)="openInPortal('/erp/invoices')"
              class="w-full border border-gray-200 text-gray-700 font-semibold rounded-xl py-2.5 text-sm mt-3 flex items-center justify-center gap-2">
              <i class="pi pi-external-link" style="font-size:0.8rem"></i> Open in portal
            </button>
          </div>
        </div>
      }

      <!-- ── Product edit sheet ─────────────────────────────────────── -->
      @if (productDetail(); as p) {
        <div class="fixed inset-0 z-40 bg-black/40 flex items-end" (click)="productDetail.set(null)">
          <div class="bg-white w-full max-w-2xl mx-auto rounded-t-2xl p-4" (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-base font-bold">Edit product</h2>
              <button (click)="productDetail.set(null)" class="text-gray-400"><i class="pi pi-times"></i></button>
            </div>
            <div class="flex flex-col gap-3">
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase">Name</label>
                <input [(ngModel)]="editName" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1" />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase">Price</label>
                  <input type="number" [(ngModel)]="editPrice" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase">Stock</label>
                  <input type="number" [(ngModel)]="editStock" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1" />
                </div>
              </div>
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" [(ngModel)]="editActive" /> Active (visible in catalog)
              </label>
              <button (click)="saveProduct(p)" [disabled]="saving()"
                class="bg-green-600 text-white font-semibold rounded-xl py-2.5 text-sm disabled:opacity-50">Save changes</button>
              <button (click)="openFullProductEdit(p)"
                class="w-full border border-gray-200 text-gray-700 font-semibold rounded-xl py-2.5 text-sm flex items-center justify-center gap-2">
                <i class="pi pi-external-link" style="font-size:0.8rem"></i> More details — full editor
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ── Customer detail + ledger sheet ─────────────────────────── -->
      @if (customerDetail(); as d) {
        <div class="fixed inset-0 z-40 bg-black/40 flex items-end" (click)="customerDetail.set(null)">
          <div class="bg-white w-full max-w-2xl mx-auto rounded-t-2xl p-4 max-h-[88vh] overflow-y-auto" (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between mb-1">
              <h2 class="text-base font-bold">{{ d.customer.name || d.customer.phone }}</h2>
              <button (click)="customerDetail.set(null)" class="text-gray-400"><i class="pi pi-times"></i></button>
            </div>
            <p class="text-sm text-gray-500 mb-3">{{ d.customer.phone }}{{ d.customer.orderCount ? ' · ' + d.customer.orderCount + ' orders' : '' }}</p>

            <div class="grid grid-cols-3 gap-2 mb-4">
              <div class="rounded-xl border border-gray-100 p-2.5 text-center">
                <p class="text-[10px] text-gray-400 uppercase">Billed</p>
                <p class="text-sm font-bold tabular-nums">{{ sym(d.currency) }}{{ fmt(d.ledger.summary.billed) }}</p>
              </div>
              <div class="rounded-xl border border-gray-100 p-2.5 text-center">
                <p class="text-[10px] text-gray-400 uppercase">Paid</p>
                <p class="text-sm font-bold text-green-600 tabular-nums">{{ sym(d.currency) }}{{ fmt(d.ledger.summary.paid) }}</p>
              </div>
              <div class="rounded-xl border border-gray-100 p-2.5 text-center">
                <p class="text-[10px] text-gray-400 uppercase">Due</p>
                <p class="text-sm font-bold tabular-nums" [class.text-red-600]="d.ledger.summary.outstanding > 0">{{ sym(d.currency) }}{{ fmt(d.ledger.summary.outstanding) }}</p>
              </div>
            </div>

            @if (d.ledger.entries.length) {
              <p class="text-xs font-bold text-gray-500 uppercase mb-2">Ledger</p>
              <div class="border border-gray-100 rounded-xl divide-y divide-gray-50 mb-4">
                @for (e of d.ledger.entries; track $index) {
                  <div class="flex justify-between items-center px-3 py-2 text-sm">
                    <span class="truncate">{{ e.description }} <span class="text-gray-400 text-xs">{{ e.ref }}</span></span>
                    <span class="text-right shrink-0 ml-2 tabular-nums" [class.text-green-600]="e.credit">
                      {{ e.debit ? sym(d.currency) + fmt(e.debit) : '−' + sym(d.currency) + fmt(e.credit) }}
                      <span class="block text-[10px] text-gray-400">bal {{ sym(d.currency) }}{{ fmt(e.balance) }}</span>
                    </span>
                  </div>
                }
              </div>
            }

            <p class="text-xs font-bold text-gray-500 uppercase mb-2">Recent orders</p>
            <div class="border border-gray-100 rounded-xl divide-y divide-gray-50 mb-4">
              @for (o of d.orders; track o.id) {
                <div class="flex justify-between px-3 py-2 text-sm"><span class="truncate">#{{ o.orderNumber }} · {{ label(o.status) }}</span><span class="tabular-nums shrink-0 ml-2">{{ sym(d.currency) }}{{ fmt(o.total) }}</span></div>
              } @empty { <p class="px-3 py-2 text-sm text-gray-400">No orders.</p> }
            </div>

            <p class="text-xs font-bold text-gray-500 uppercase mb-2">Invoices</p>
            <div class="border border-gray-100 rounded-xl divide-y divide-gray-50">
              @for (inv of d.invoices; track inv.invoiceNumber) {
                <div class="flex justify-between px-3 py-2 text-sm"><span class="truncate">{{ inv.invoiceNumber }} · {{ label(inv.paymentStatus) }}</span><span class="tabular-nums shrink-0 ml-2">{{ sym(d.currency) }}{{ fmt(inv.total) }}</span></div>
              } @empty { <p class="px-3 py-2 text-sm text-gray-400">No invoices.</p> }
            </div>
            <button (click)="openInPortal('/customers/' + d.customer.id)"
              class="w-full border border-gray-200 text-gray-700 font-semibold rounded-xl py-2.5 text-sm mt-4 flex items-center justify-center gap-2">
              <i class="pi pi-external-link" style="font-size:0.8rem"></i> Open full profile in portal
            </button>
          </div>
        </div>
      }

      @if (toast()) {
        <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg">{{ toast() }}</div>
      }
    </div>
  `,
  styles: [`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`],
})
export class MobileErpComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http: HttpClient;
  private readonly base = `${environment.apiUrl}/m/erp`;

  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Home' },
    { id: 'orders', label: 'Orders' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'catalog', label: 'Catalog' },
    { id: 'customers', label: 'Customers' },
    { id: 'taxes', label: 'Taxes' },
    { id: 'eway', label: 'E-Way' },
  ];
  readonly orderStatusOptions = ORDER_STATUS_OPTIONS;

  token = signal('');
  view = signal<Tab>('dashboard');
  loadError = signal<string | null>(null);
  busy = signal(false);
  saving = signal(false);
  toast = signal<string | null>(null);

  store = signal<string | null>(null);
  currency = signal('₹');
  private whatsappPhone: string | null = null;

  dash = signal<any>(null);
  orders = signal<any[]>([]);
  invoices = signal<any[]>([]);
  products = signal<any[]>([]);
  customers = signal<any[]>([]);
  taxRates = signal<any[]>([]);
  ewayBills = signal<any[]>([]);
  paymentModes = signal<any[]>([]);

  orderDetail = signal<any>(null);
  invoiceDetail = signal<any>(null);
  productDetail = signal<any>(null);
  customerDetail = signal<any>(null);

  orderFilter = 'open';
  invoiceFilter = '';
  productQuery = '';
  customerQuery = '';
  customerSegment = 'all';
  newTaxName = '';
  newTaxRate: number | null = null;
  payAmount: number | null = null;
  payModeId: string | null = null;
  editName = '';
  editPrice: number | null = null;
  editStock: number | null = null;
  editActive = true;

  cur = computed(() => this.currency());

  constructor() {
    this.http = new HttpClient(inject(HttpBackend));
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const token = qp.get('token') || '';
    this.token.set(token);
    const v = (qp.get('view') || 'dashboard') as Tab;
    if (this.tabs.some((t) => t.id === v)) this.view.set(v);
    if (!token) { this.loadError.set('Missing or invalid link.'); return; }
    this.get<any>('/session').subscribe({
      next: (s) => {
        const d = unwrap<any>(s);
        this.store.set(d?.store || null);
        this.currency.set(d?.currency || '₹');
        this.loadTab(this.view());
      },
      error: () => this.loadError.set('This link has expired. Open it again from your WhatsApp menu.'),
    });
  }

  // ── navigation ──
  go(tab: Tab): void { this.view.set(tab); this.loadTab(tab); }
  back(): void { returnToWhatsApp(this.whatsappPhone); }

  private loadTab(tab: Tab): void {
    if (tab === 'dashboard' && !this.dash()) this.loadDashboard();
    else if (tab === 'orders') this.loadOrders();
    else if (tab === 'invoices') { this.loadInvoices(); this.loadPaymentModes(); }
    else if (tab === 'catalog') this.loadProducts();
    else if (tab === 'customers') this.loadCustomers();
    else if (tab === 'taxes') this.loadTaxRates();
    else if (tab === 'eway') this.loadEwayBills();
  }

  // ── loaders ──
  private loadDashboard(): void {
    this.busy.set(true);
    this.get<any>('/dashboard').subscribe({ next: (r) => { this.dash.set(unwrap(r)); this.busy.set(false); }, error: () => this.busy.set(false) });
  }
  loadOrders(): void {
    this.busy.set(true);
    this.get<any>('/orders', { status: this.orderFilter }).subscribe({ next: (r) => { this.orders.set(unwrap<any[]>(r) || []); this.busy.set(false); }, error: () => this.busy.set(false) });
  }
  loadInvoices(): void {
    this.busy.set(true);
    this.get<any>('/invoices', this.invoiceFilter ? { paymentStatus: this.invoiceFilter } : {}).subscribe({ next: (r) => { this.invoices.set(unwrapList(r)); this.busy.set(false); }, error: () => this.busy.set(false) });
  }
  private loadPaymentModes(): void {
    if (this.paymentModes().length) return;
    this.get<any>('/payment-modes').subscribe({ next: (r) => this.paymentModes.set(unwrap<any[]>(r) || []) });
  }
  loadProducts(): void {
    this.busy.set(true);
    this.get<any>('/products', this.productQuery ? { q: this.productQuery } : {}).subscribe({ next: (r) => { this.products.set(unwrap<any[]>(r) || []); this.busy.set(false); }, error: () => this.busy.set(false) });
  }
  loadCustomers(): void {
    this.busy.set(true);
    const params: Record<string, string> = {};
    if (this.customerQuery) params['q'] = this.customerQuery;
    if (this.customerSegment && this.customerSegment !== 'all') params['segment'] = this.customerSegment;
    this.get<any>('/customers', params).subscribe({ next: (r) => { this.customers.set(unwrap<any[]>(r) || []); this.busy.set(false); }, error: () => this.busy.set(false) });
  }
  openCustomer(c: any): void {
    this.get<any>(`/customers/${c.id}`).subscribe({ next: (r) => this.customerDetail.set(unwrap(r)) });
  }
  loadTaxRates(): void {
    this.busy.set(true);
    this.get<any>('/tax-rates').subscribe({ next: (r) => { this.taxRates.set(unwrap<any[]>(r) || []); this.busy.set(false); }, error: () => this.busy.set(false) });
  }
  loadEwayBills(): void {
    this.busy.set(true);
    this.get<any>('/eway-bills').subscribe({ next: (r) => { this.ewayBills.set(unwrap<any[]>(r) || []); this.busy.set(false); }, error: () => this.busy.set(false) });
  }
  addTax(): void {
    const name = this.newTaxName.trim();
    if (!name || this.newTaxRate == null) { this.showToast('Enter a name and a rate %'); return; }
    this.saving.set(true);
    this.post<any>('/tax-rates', { name, rate: this.newTaxRate }).subscribe({
      next: () => { this.saving.set(false); this.newTaxName = ''; this.newTaxRate = null; this.showToast('Tax rate added'); this.loadTaxRates(); },
      error: (e) => { this.saving.set(false); this.showToast(this.errMsg(e)); },
    });
  }
  /** Open the FULL web portal (logged in) at a portal path, via the auto-login bridge. */
  openInPortal(to: string): void {
    this.post<any>('/portal-link', { to }).subscribe({
      next: (r) => { const u = unwrap<any>(r)?.url; if (u) window.location.href = u; },
      error: (e) => this.showToast(this.errMsg(e)),
    });
  }
  openFullProductEdit(p: any): void { this.openInPortal(`/products/${p.id}/edit`); }
  /**
   * The console always runs inside the WhatsApp WebView, which can't download
   * files (a `_blank`/blob link bounces to the external browser and ejects the
   * user out of WhatsApp). So instead of downloading we ask the server to send
   * the e-way bill PDF to the admin's chat as a document — reliable and native.
   */
  downloadEway(b: any): void {
    this.showToast('Sending to your WhatsApp…');
    this.http
      .post(`${environment.apiUrl}/m/doc-delivery/console/eway/${b.id}`, {}, this.opts())
      .subscribe({
        next: () => this.showToast('📄 Sent — check your WhatsApp chat'),
        error: (e) => this.showToast(this.errMsg(e)),
      });
  }

  private searchTimer: any;
  onProductSearch(): void { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.loadProducts(), 300); }
  onCustomerSearch(): void { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.loadCustomers(), 300); }

  // ── orders ──
  openOrder(o: any): void {
    this.get<any>(`/orders/${o.id}`).subscribe({ next: (r) => this.orderDetail.set(unwrap(r)) });
  }
  setOrderStatus(o: any, status: string): void {
    this.saving.set(true);
    this.post<any>(`/orders/${o.id}/status`, { status }).subscribe({
      next: () => { this.saving.set(false); this.orderDetail.set(null); this.showToast(`Order #${o.orderNumber} → ${this.label(status)}`); this.loadOrders(); },
      error: (e) => { this.saving.set(false); this.showToast(this.errMsg(e)); },
    });
  }
  newOrder(): void {
    this.post<any>('/new/builder', { type: 'order' }).subscribe({ next: (r) => { const u = unwrap<any>(r)?.url; if (u) window.location.href = u; } });
  }

  // ── invoices ──
  openInvoice(inv: any): void {
    this.payAmount = Number(inv.balanceDue) || null;
    this.get<any>(`/invoices/${inv.id}`).subscribe({ next: (r) => this.invoiceDetail.set(unwrap(r)) });
  }
  recordPayment(inv: any): void {
    if (!this.payAmount || this.payAmount <= 0) { this.showToast('Enter an amount'); return; }
    this.saving.set(true);
    this.post<any>(`/invoices/${inv.id}/payment`, { amount: this.payAmount, paymentModeId: this.payModeId }).subscribe({
      next: () => { this.saving.set(false); this.invoiceDetail.set(null); this.payAmount = null; this.payModeId = null; this.showToast('Payment recorded'); this.loadInvoices(); },
      error: (e) => { this.saving.set(false); this.showToast(this.errMsg(e)); },
    });
  }
  newInvoice(): void {
    this.post<any>('/new/invoice', {}).subscribe({ next: (r) => { const u = unwrap<any>(r)?.url; if (u) window.location.href = u; } });
  }

  // ── products ──
  openProduct(p: any): void {
    this.editName = p.name; this.editPrice = Number(p.price) || 0;
    this.editStock = p.track ? Number(p.stock) || 0 : null;
    this.editActive = !!p.isActive;
    this.productDetail.set(p);
  }
  saveProduct(p: any): void {
    this.saving.set(true);
    const patch: any = { name: this.editName, price: this.editPrice, active: this.editActive };
    if (this.editStock != null) patch.stock = this.editStock;
    this.post<any>(`/products/${p.id}`, patch).subscribe({
      next: () => { this.saving.set(false); this.productDetail.set(null); this.showToast('Product updated'); this.loadProducts(); },
      error: (e) => { this.saving.set(false); this.showToast(this.errMsg(e)); },
    });
  }

  // ── helpers ──
  private opts(params?: Record<string, string>) {
    return { headers: { 'X-Builder-Token': this.token() }, ...(params ? { params } : {}) };
  }
  private get<T>(path: string, params?: Record<string, string>) {
    return this.http.get<T>(`${this.base}${path}`, this.opts(params));
  }
  private post<T>(path: string, body: any) {
    return this.http.post<T>(`${this.base}${path}`, body, this.opts());
  }
  private showToast(m: string): void { this.toast.set(m); setTimeout(() => this.toast.set(null), 2500); }
  private errMsg(e: any): string { return e?.error?.error?.message || e?.error?.message || 'Something went wrong'; }

  fmt(v: any): string { return (parseFloat(v ?? 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  label(s: string): string { return (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
  sym(code?: string): string { return !code || code === 'INR' ? this.currency() : code + ' '; }
  statusClass(s: string): string {
    if (s === 'delivered') return 'bg-green-100 text-green-700';
    if (s === 'cancelled') return 'bg-red-100 text-red-600';
    if (s === 'confirmed' || s === 'processing' || s === 'ready_for_delivery') return 'bg-blue-100 text-blue-700';
    return 'bg-amber-100 text-amber-700';
  }
  payClass(s: string): string {
    return s === 'paid' ? 'bg-green-100 text-green-700' : s === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600';
  }
}
