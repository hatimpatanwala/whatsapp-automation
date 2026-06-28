import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  BuilderApiService,
  BuilderCustomer,
  BuilderProduct,
  BuilderOffer,
  BuilderFreeItem,
  BuilderSessionInfo,
} from './builder-api.service';
import { returnToWhatsApp } from './webview-return';

interface CartLine {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  stock: number | null; // null = custom item (no stock)
  image?: string | null;
  gstRate?: number;
  uom?: string;
  brand?: string | null;
  sku?: string | null;
}

/**
 * Token-secured order/quote builder. A single, centered, themed flow that works
 * as a phone webview (inside WhatsApp) and as a desktop web page. Items stack in
 * a list; the "Add item" controls (product search + custom item) sit below it.
 */
@Component({
  selector: 'wa-mobile-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900">
      <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div class="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <button (click)="goBack()" class="w-9 h-9 -ml-1 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 active:bg-gray-200 transition-colors shrink-0" aria-label="Go back">
            <i class="pi pi-arrow-left"></i>
          </button>
          <div class="w-9 h-9 rounded-xl bg-green-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <i [class]="'pi ' + (session()?.type === 'quote' ? 'pi-file-edit' : 'pi-shopping-bag')" style="font-size:1.05rem"></i>
          </div>
          <div class="min-w-0">
            <h1 class="text-[15px] font-bold text-gray-900 truncate leading-tight">
              {{ session() ? (session()!.type === 'quote' ? 'Create quote' : 'Create order') : 'Builder' }}
            </h1>
            <p class="text-[11px] text-gray-400 leading-tight truncate">{{ session()?.type === 'quote' ? 'Draft a quote on WhatsApp' : 'Build an order on WhatsApp' }}</p>
          </div>
        </div>
      </header>

      @if (loading()) {
        <div class="p-10 text-center text-gray-500 text-sm"><i class="pi pi-spin pi-spinner mr-2"></i>Loading…</div>
      }

      @if (error()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.5rem"></i>
            <p class="text-sm font-semibold text-red-800">{{ error() }}</p>
            <p class="text-xs text-red-600 mt-1">This page can only be opened from a valid link.</p>
          </div>
        </div>
      }

      @if (done(); as d) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
            <p class="text-5xl mb-2">{{ d.type === 'quote' ? '📝' : '🎉' }}</p>
            <p class="text-lg font-bold text-gray-900">{{ d.type === 'quote' ? 'Quote created' : 'Order created' }}</p>
            <p class="text-sm text-gray-500 mt-1">{{ d.number }}</p>
            <button class="mt-5 w-full bg-green-600 text-white font-semibold rounded-xl py-3 text-sm" (click)="returnNow()">
              <i class="pi pi-whatsapp mr-1"></i>Back to chat@if (returnIn() !== null) { <span> ({{ returnIn() }})</span> }
            </button>
            @if (returnIn() !== null) { <p class="text-[11px] text-gray-400 mt-3">Returning to WhatsApp automatically…</p> }
          </div>
        </div>
      }

      @if (session() && !done() && !error()) {
        <main class="max-w-2xl mx-auto p-4 pb-32 space-y-4">
          <!-- Customer -->
          <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer</p>
            @if (session()!.customerLocked) {
              <p class="text-sm font-medium">{{ session()!.customer.name || 'Customer' }}</p>
              <p class="text-xs text-gray-500">{{ session()!.customer.phone }}</p>
            } @else if (selectedCustomer(); as c) {
              <div class="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <div>
                  <p class="text-sm font-semibold">{{ c.name || 'Customer' }}</p>
                  <p class="text-xs text-gray-500">{{ c.phone }}</p>
                </div>
                <button class="text-gray-400 hover:text-red-500" (click)="clearCustomer()"><i class="pi pi-times"></i></button>
              </div>
            } @else {
              <div class="relative">
                <input [ngModel]="custQuery()" (ngModelChange)="custQuery.set($event); onCustInput()" (focus)="custFocused.set(true)"
                  placeholder="🔍 Search customer by name or number…"
                  class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none" />
                @if (custFocused() && (custResults().length || custSearching() || newCustomerPhone())) {
                  <div class="fixed inset-0 z-[5]" (click)="custFocused.set(false)"></div>
                  <div class="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                    @if (custSearching()) { <div class="px-3 py-2 text-xs text-gray-400"><i class="pi pi-spin pi-spinner mr-1"></i>Searching…</div> }
                    @for (c of custResults(); track c.id) {
                      <button class="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0" (click)="selectCustomer(c)">
                        <p class="text-sm font-medium">{{ c.name || 'Unnamed' }}</p>
                        <p class="text-xs text-gray-500">{{ c.phone }}</p>
                      </button>
                    }
                    @if (newCustomerPhone(); as np) {
                      <button class="w-full text-left px-3 py-2 hover:bg-green-50 text-green-700" (click)="useNewCustomer()">
                        <i class="pi pi-plus mr-1"></i>Use new customer <span class="font-semibold">{{ np }}</span>
                      </button>
                    }
                  </div>
                }
              </div>
              <p class="text-[11px] text-gray-400 mt-1">Search existing customers, or type a phone number to add a new one.</p>
            }
          </section>

          <!-- Items -->
          <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div class="flex items-center justify-between mb-3">
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Items</p>
              @if (cart().length) { <span class="text-xs text-gray-400">{{ cart().length }} item{{ cart().length === 1 ? '' : 's' }}</span> }
            </div>

            @if (cart().length) {
              <div class="space-y-2 mb-3">
                @for (line of cart(); track $index; let i = $index) {
                  <div class="rounded-xl border border-gray-100 p-3 hover:border-gray-200 transition-colors">
                    <div class="flex items-start gap-3">
                      @if (line.image) {
                        <img [src]="line.image" [alt]="line.name" class="w-12 h-12 rounded-lg object-cover border border-gray-100 flex-shrink-0" loading="lazy" />
                      } @else {
                        <div class="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0"><i class="pi pi-box text-gray-300"></i></div>
                      }
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold text-gray-900 leading-tight">
                          {{ line.name }}
                          @if (line.stock === null) { <span class="text-[10px] bg-amber-100 text-amber-700 rounded px-1 ml-1 align-middle">custom</span> }
                        </p>
                        @if (line.brand || line.sku) {
                          <p class="text-[11px] text-gray-400 truncate mt-0.5">
                            @if (line.brand) { <span class="font-medium text-gray-500">{{ line.brand }}</span> }
                            @if (line.brand && line.sku) { <span> · </span> }
                            @if (line.sku) { <span>SKU: {{ line.sku }}</span> }
                          </p>
                        }
                        <div class="flex items-center gap-2 mt-1">
                          <span class="text-[11px] font-medium text-gray-600">{{ sym() }}{{ line.unitPrice | number:'1.0-2' }} / {{ line.uom || 'pcs' }}</span>
                          @if (line.gstRate) { <span class="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">GST {{ line.gstRate }}%</span> }
                          @if (line.stock !== null && line.quantity > line.stock!) { <span class="text-[10px] text-red-500">⚠ exceeds stock ({{ line.stock }})</span> }
                          @else if (line.stock !== null) { <span class="text-[10px] text-gray-400">{{ line.stock }} in stock</span> }
                        </div>
                      </div>
                      <button class="text-gray-300 hover:text-red-500 transition-colors p-1 -mt-1 -mr-1" (click)="remove(i)"><i class="pi pi-trash text-sm"></i></button>
                    </div>
                    <div class="flex items-center gap-3 mt-3">
                      <!-- qty stepper -->
                      <div class="flex items-center border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                        <button class="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 active:bg-gray-100" (click)="setQty(i, line.quantity - 1)"><i class="pi pi-minus text-[10px]"></i></button>
                        <input type="number" min="1" [ngModel]="line.quantity" (ngModelChange)="setQty(i, $event)" inputmode="numeric"
                          class="w-10 h-8 text-center text-sm border-x border-gray-200 focus:outline-none" />
                        <button class="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 active:bg-gray-100" (click)="setQty(i, line.quantity + 1)"><i class="pi pi-plus text-[10px]"></i></button>
                      </div>
                      <span class="text-[11px] text-gray-400 flex-shrink-0">{{ line.uom || 'pcs' }} ×</span>
                      <div class="flex items-center gap-1 flex-1 min-w-0">
                        <span class="text-xs text-gray-400">{{ sym() }}</span>
                        <input type="number" min="0" step="0.01" [ngModel]="line.unitPrice" (ngModelChange)="setPrice(i, $event)" inputmode="decimal"
                          class="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                      </div>
                      <p class="text-sm font-bold text-gray-900 w-20 text-right flex-shrink-0">{{ sym() }}{{ (line.quantity * line.unitPrice) | number:'1.0-2' }}</p>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="text-center py-6">
                <i class="pi pi-shopping-cart text-gray-200" style="font-size:1.8rem"></i>
                <p class="text-xs text-gray-400 mt-2">No items yet — search a product or add a custom item 👇</p>
              </div>
            }

            <!-- Add item -->
            <div class="border-t border-gray-100 pt-3 space-y-2">
              <div class="relative">
                <input [(ngModel)]="addQuery" (focus)="addFocused.set(true)" placeholder="🔍 Search a product to add…"
                  class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none" />
                @if (addFocused() && addResults().length) {
                  <div class="fixed inset-0 z-[5]" (click)="addFocused.set(false)"></div>
                  <div class="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-auto">
                    @for (p of addResults(); track p.id) {
                      <button class="w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-50 last:border-0 flex items-center gap-3" (click)="addProduct(p)">
                        @if (p.thumbnail) {
                          <img [src]="p.thumbnail" [alt]="p.name" class="w-10 h-10 rounded-lg object-cover border border-gray-100 flex-shrink-0" loading="lazy" />
                        } @else {
                          <div class="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0"><i class="pi pi-box text-gray-300"></i></div>
                        }
                        <span class="flex-1 min-w-0">
                          <span class="text-sm font-medium block truncate">
                            {{ p.name }}
                            @if (p.isNew) { <span class="text-[9px] bg-blue-100 text-blue-700 font-bold rounded px-1 ml-1 align-middle">NEW</span> }
                            @if (p.offer) { <span class="text-[9px] bg-green-100 text-green-700 font-bold rounded px-1 ml-1 align-middle">{{ p.offer }}</span> }
                          </span>
                          <span class="block text-xs text-gray-500 truncate">{{ p.brand ? p.brand + ' · ' : '' }}{{ sym() }}{{ p.price | number:'1.0-2' }} / {{ p.uom || 'pcs' }} · <span [class.text-red-500]="p.stock <= 0">stock {{ p.stock }}</span></span>
                        </span>
                        <i class="pi pi-plus-circle text-green-600 flex-shrink-0" style="font-size:1.2rem"></i>
                      </button>
                    }
                  </div>
                }
              </div>

              @if (!showCustom()) {
                <button class="text-xs text-green-700 font-medium hover:text-green-800" (click)="showCustom.set(true)">
                  <i class="pi pi-plus mr-1"></i>Add a custom item (not in catalog)
                </button>
              } @else {
                <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <input [(ngModel)]="customName" placeholder="Custom item name" class="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm" />
                  <div class="flex gap-2">
                    <input type="number" min="1" [(ngModel)]="customQty" placeholder="Qty" inputmode="numeric" class="w-20 border border-gray-300 rounded-lg px-2 py-2 text-sm" />
                    <input type="number" min="0" step="0.01" [(ngModel)]="customPrice" placeholder="Price" inputmode="decimal" class="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm" />
                    <button class="bg-green-600 text-white text-xs font-medium rounded-lg px-4" (click)="addCustom()">Add</button>
                  </div>
                  <button class="text-[11px] text-gray-400" (click)="showCustom.set(false)">Cancel</button>
                </div>
              }
            </div>
          </section>

          <!-- Order summary -->
          <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{{ session()!.type === 'quote' ? 'Quote Summary' : 'Order Summary' }}</p>
            <div class="space-y-2.5">
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-500">Subtotal</span>
                <span class="font-medium text-gray-800">{{ sym() }}{{ subtotal() | number:'1.0-2' }}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-500">Tax (GST)</span>
                <span class="font-medium text-gray-800">{{ sym() }}{{ tax() | number:'1.0-2' }}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-500">Discount</span>
                <div class="flex items-center gap-1">
                  <span class="text-xs text-gray-400">− {{ sym() }}</span>
                  <input type="number" min="0" step="0.01" [ngModel]="discountAmt()" (ngModelChange)="discountAmt.set(+$event || 0)" inputmode="decimal"
                    class="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right" placeholder="0.00" />
                </div>
              </div>
              @if (session()!.type !== 'quote') {
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-500">Delivery fee</span>
                  <div class="flex items-center gap-1">
                    <span class="text-xs text-gray-400">+ {{ sym() }}</span>
                    <input type="number" min="0" step="0.01" [ngModel]="deliveryAmt()" (ngModelChange)="deliveryAmt.set(+$event || 0)" inputmode="decimal"
                      class="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right" placeholder="0.00" />
                  </div>
                </div>
              }

              <!-- Applicable offers (auto-applied; toggle which to use) -->
              @if (offers().length) {
                <div class="border-t border-gray-100 pt-2 mt-1">
                  <p class="text-[11px] font-semibold text-green-700 mb-1.5"><i class="pi pi-tag text-[10px] mr-1"></i>Offers</p>
                  @for (o of offers(); track o.schemeId) {
                    <label class="flex items-center justify-between gap-2 py-1 cursor-pointer">
                      <span class="flex items-center gap-2 min-w-0">
                        <input type="checkbox" [checked]="isOfferOn(o.schemeId)" (change)="toggleOffer(o.schemeId)" class="accent-green-600" />
                        <span class="text-xs text-gray-600 truncate">{{ o.name }} <span class="text-[10px] bg-green-100 text-green-700 rounded px-1">{{ o.label }}</span>@if (!o.combinable) { <span class="text-[9px] text-gray-400 ml-1">(not combinable)</span> }</span>
                      </span>
                      @if (o.discount > 0) {
                        <span class="text-xs font-medium text-green-700 whitespace-nowrap">− {{ sym() }}{{ o.discount | number:'1.0-2' }}</span>
                      } @else if (o.freeItems?.length) {
                        <span class="text-xs font-medium text-green-700 whitespace-nowrap">🎁 free</span>
                      }
                    </label>
                  }
                  @if (orderFreeItems().length) {
                    <div class="bg-green-50 rounded-lg px-3 py-2 mt-1 space-y-1">
                      <p class="text-[11px] font-semibold text-green-700">🎁 Free items added</p>
                      @for (f of orderFreeItems(); track f.productId) {
                        <div class="flex items-center justify-between text-xs text-gray-600">
                          <span class="truncate">{{ f.quantity }} × {{ f.name }} <span class="text-[9px] bg-green-600 text-white rounded px-1 ml-1">FREE</span></span>
                          <span class="text-gray-400 line-through">{{ sym() }}{{ (f.quantity * f.unitPrice) | number:'1.0-2' }}</span>
                        </div>
                      }
                    </div>
                  }
                  @if (schemeDiscount() > 0) {
                    <div class="flex items-center justify-between text-sm mt-1">
                      <span class="text-gray-500">Offer discount</span>
                      <span class="font-medium text-green-700">− {{ sym() }}{{ schemeDiscount() | number:'1.0-2' }}</span>
                    </div>
                  }
                </div>
              }

              <!-- Coupon -->
              <div class="border-t border-gray-100 pt-2 mt-1">
                @if (appliedCoupon(); as cp) {
                  <div class="flex items-center justify-between text-sm">
                    <span class="flex items-center gap-2">
                      <span class="text-[10px] bg-green-600 text-white rounded px-1.5 py-0.5 font-mono font-bold">{{ cp.code }}</span>
                      <button class="text-[11px] text-red-500 hover:underline" (click)="removeCoupon()">remove</button>
                    </span>
                    <span class="font-medium text-green-700">− {{ sym() }}{{ cp.discount | number:'1.0-2' }}</span>
                  </div>
                } @else {
                  <div class="flex items-center gap-2">
                    <input [(ngModel)]="couponInput" placeholder="Coupon code" class="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm uppercase" (keyup.enter)="applyCouponCode()" />
                    <button class="bg-gray-800 text-white text-xs font-medium rounded-lg px-3 py-1.5 disabled:opacity-50" [disabled]="couponBusy() || !couponInput.trim()" (click)="applyCouponCode()">{{ couponBusy() ? '…' : 'Apply' }}</button>
                  </div>
                  @if (couponError()) { <p class="text-[11px] text-red-500 mt-1">{{ couponError() }}</p> }
                }
              </div>

              <div class="border-t border-dashed border-gray-200 my-1"></div>
              <div class="flex items-center justify-between">
                <span class="text-base font-bold text-gray-900">Total</span>
                <span class="text-xl font-extrabold text-green-700">{{ sym() }}{{ total() | number:'1.0-2' }}</span>
              </div>
            </div>
          </section>

          <!-- Title / notes -->
          <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
            @if (session()!.type === 'quote') {
              <input [(ngModel)]="title" placeholder="Quote title (optional)" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" />
            }
            <textarea [(ngModel)]="notes" rows="2" placeholder="Notes (optional)" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"></textarea>
          </section>
        </main>

        <footer class="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-gray-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div class="max-w-2xl mx-auto">
            @if (submitError()) { <p class="text-xs text-red-600 mb-2"><i class="pi pi-exclamation-circle mr-1"></i>{{ submitError() }}</p> }
            <div class="flex items-center gap-3">
              <div class="shrink-0">
                <p class="text-gray-400 text-[11px] leading-none">Total</p>
                <p class="text-lg font-extrabold text-gray-900 leading-tight">{{ sym() }}{{ total() | number:'1.0-2' }}</p>
              </div>
              <button class="flex-1 bg-green-600 text-white font-bold rounded-xl py-3.5 text-sm shadow-sm hover:bg-green-700 active:bg-green-800 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
                [disabled]="!cart().length || submitting()" (click)="submit()">
                @if (submitting()) { <i class="pi pi-spin pi-spinner"></i> Submitting… }
                @else { <i class="pi pi-check-circle"></i> {{ session()!.type === 'quote' ? 'Create quote' : 'Create order' }} }
              </button>
            </div>
          </div>
        </footer>
      }
    </div>
  `,
})
export class MobileBuilderComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(BuilderApiService);

  /** Back to the orders/quotes list (or browser back if opened standalone). */
  goBack(): void {
    if (typeof history !== 'undefined' && history.length > 1) {
      history.back();
    } else {
      this.router.navigate([this.session()?.type === 'quote' ? '/quotes' : '/orders']);
    }
  }

  loading = signal(true);
  error = signal<string | null>(null);
  session = signal<BuilderSessionInfo | null>(null);
  products = signal<BuilderProduct[]>([]);
  cart = signal<CartLine[]>([]);
  submitting = signal(false);
  submitError = signal<string | null>(null);
  done = signal<{ type: string; number: string } | null>(null);
  returnIn = signal<number | null>(null);
  private returnTimer: any = null;

  private startAutoReturn() {
    this.cancelAutoReturn();
    let n = 4;
    this.returnIn.set(n);
    this.returnTimer = setInterval(() => {
      n -= 1;
      this.returnIn.set(n);
      if (n <= 0) { this.cancelAutoReturn(); this.returnNow(); }
    }, 1000);
  }
  cancelAutoReturn() {
    if (this.returnTimer) { clearInterval(this.returnTimer); this.returnTimer = null; }
    this.returnIn.set(null);
  }
  returnNow() {
    this.cancelAutoReturn();
    returnToWhatsApp(this.session()?.whatsappPhone);
  }

  // Customer picker
  custQuery = signal('');
  custResults = signal<BuilderCustomer[]>([]);
  custSearching = signal(false);
  custFocused = signal(false);
  selectedCustomer = signal<BuilderCustomer | null>(null);
  private custTimer: any = null;

  // Add-item controls
  addQuery = '';
  addFocused = signal(false);
  showCustom = signal(false);
  customName = '';
  customQty: number | null = 1;
  customPrice: number | null = null;

  title = '';
  notes = '';

  addResults = computed(() => {
    const q = this.addQuery.trim().toLowerCase();
    const list = this.products();
    const arr = Array.isArray(list) ? list : [];
    return (q ? arr.filter((p) => p.name.toLowerCase().includes(q)) : arr).slice(0, 8);
  });

  // Order summary breakdown — a cart/checkout-style total the admin can see.
  subtotal = computed(() => this.cart().reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  tax = computed(() => this.cart().reduce((s, l) => s + l.quantity * l.unitPrice * (Number(l.gstRate) || 0) / 100, 0));
  discountAmt = signal(0);
  deliveryAmt = signal(0);

  // Offers / schemes (auto-applied; admin can toggle which to apply).
  offers = signal<BuilderOffer[]>([]);
  selectedOfferIds = signal<string[]>([]);
  private offersTimer: any = null;

  // The offers that actually apply, honouring the combinable rule: a non-combinable
  // selection wins alone (highest weight, then saving); otherwise combinables stack.
  effectiveOffers = computed(() => {
    const sel = this.offers().filter((o) => this.selectedOfferIds().includes(o.schemeId));
    if (!sel.length) return [] as BuilderOffer[];
    const nonComb = sel.filter((o) => !o.combinable);
    if (nonComb.length) {
      const best = [...nonComb].sort((a, b) => b.weight - a.weight || (b.saving || b.discount) - (a.saving || a.discount))[0];
      return [best];
    }
    return sel;
  });

  schemeDiscount = computed(() => Math.round(this.effectiveOffers().reduce((s, o) => s + (Number(o.discount) || 0), 0) * 100) / 100);
  orderFreeItems = computed<BuilderFreeItem[]>(() => this.effectiveOffers().flatMap((o) => o.freeItems || []));

  // Coupon
  couponInput = '';
  appliedCoupon = signal<{ code: string; discount: number; label: string } | null>(null);
  couponError = signal<string | null>(null);
  couponBusy = signal(false);
  couponDiscount = computed(() => this.appliedCoupon()?.discount || 0);

  total = computed(() => Math.max(0, this.subtotal() + this.tax() - (Number(this.discountAmt()) || 0) - this.schemeDiscount() - this.couponDiscount() + (Number(this.deliveryAmt()) || 0)));

  applyCouponCode(): void {
    const code = this.couponInput.trim();
    if (!code) return;
    const items = this.cart().filter((l) => l.productId).map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice }));
    this.couponBusy.set(true); this.couponError.set(null);
    this.api.applyCoupon(code, items).subscribe({
      next: (r) => {
        this.couponBusy.set(false);
        if (r.valid && r.coupon) { this.appliedCoupon.set({ code: r.coupon.code, discount: r.discount, label: r.coupon.label }); this.couponInput = ''; }
        else this.couponError.set(r.reason || 'Invalid coupon.');
      },
      error: (e) => { this.couponBusy.set(false); this.couponError.set(e?.error?.message || 'Could not apply coupon.'); },
    });
  }
  removeCoupon(): void { this.appliedCoupon.set(null); this.couponError.set(null); }

  toggleOffer(id: string): void {
    const set = new Set(this.selectedOfferIds());
    set.has(id) ? set.delete(id) : set.add(id);
    this.selectedOfferIds.set([...set]);
  }
  isOfferOn(id: string): boolean { return this.selectedOfferIds().includes(id); }

  /** Re-evaluate offers against the current cart (debounced). */
  private refreshOffers(): void {
    if (this.offersTimer) clearTimeout(this.offersTimer);
    this.offersTimer = setTimeout(() => {
      const items = this.cart().filter((l) => l.productId).map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice }));
      if (!items.length) { this.offers.set([]); this.selectedOfferIds.set([]); this.appliedCoupon.set(null); return; }
      this.api.evaluateOffers(items).subscribe({
        next: (r) => { this.offers.set(r.applicable || []); this.selectedOfferIds.set(r.recommendedIds || []); },
        error: () => { this.offers.set([]); this.selectedOfferIds.set([]); },
      });
      // Re-validate an applied coupon against the new cart.
      const applied = this.appliedCoupon();
      if (applied) {
        this.api.applyCoupon(applied.code, items).subscribe({
          next: (r) => {
            if (r.valid && r.coupon) this.appliedCoupon.set({ code: r.coupon.code, discount: r.discount, label: r.coupon.label });
            else { this.appliedCoupon.set(null); this.couponError.set(r.reason || 'Coupon no longer applies.'); }
          },
        });
      }
    }, 300);
  }

  newCustomerPhone = computed(() => {
    const q = this.custQuery().trim();
    const digits = q.replace(/\D/g, '');
    return digits.length >= 7 && !this.custResults().some((c) => c.phone.replace(/\D/g, '') === digits) ? q : null;
  });

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!token) {
      this.loading.set(false);
      this.error.set('Missing or invalid link.');
      return;
    }
    this.api.setToken(token);
    this.api.getSession().subscribe({
      next: (s) => { this.session.set(s); this.loadProducts(); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.message || 'This link is invalid or has expired.'); },
    });
  }

  private loadProducts(): void {
    this.api.getProducts().subscribe({
      next: (p) => { this.products.set(p || []); this.loading.set(false); },
      error: () => { this.products.set([]); this.loading.set(false); },
    });
  }

  onCustInput(): void {
    this.custFocused.set(true);
    if (this.custTimer) clearTimeout(this.custTimer);
    const q = this.custQuery().trim();
    this.custSearching.set(true);
    this.custTimer = setTimeout(() => {
      this.api.searchCustomers(q).subscribe({
        next: (r) => { this.custResults.set(r || []); this.custSearching.set(false); },
        error: () => { this.custResults.set([]); this.custSearching.set(false); },
      });
    }, 280);
  }

  selectCustomer(c: BuilderCustomer): void { this.selectedCustomer.set(c); this.custFocused.set(false); this.custResults.set([]); }
  useNewCustomer(): void { this.selectedCustomer.set({ id: '', name: '', phone: this.custQuery().trim() }); this.custFocused.set(false); this.custResults.set([]); }
  clearCustomer(): void { this.selectedCustomer.set(null); this.custQuery.set(''); this.custResults.set([]); }

  sym(): string {
    const c = this.products()[0]?.currency || 'INR';
    return c === 'INR' ? '₹' : c === 'USD' ? '$' : c === 'EUR' ? '€' : c + ' ';
  }

  addProduct(p: BuilderProduct): void {
    const cart = [...this.cart()];
    const existing = cart.find((l) => l.productId === p.id);
    if (existing) existing.quantity += 1;
    else cart.push({ productId: p.id, name: p.name, quantity: 1, unitPrice: p.price, stock: p.stock, image: p.thumbnail, gstRate: p.gstRate, uom: p.uom, brand: p.brand, sku: p.sku });
    this.cart.set(cart);
    this.refreshOffers();
    this.addQuery = '';
    this.addFocused.set(false);
  }

  addCustom(): void {
    const name = this.customName.trim();
    const price = Number(this.customPrice);
    if (!name) { this.submitError.set('Enter a custom item name.'); return; }
    if (isNaN(price) || price < 0) { this.submitError.set('Enter a valid custom item price.'); return; }
    this.submitError.set(null);
    this.cart.set([...this.cart(), { name, quantity: Math.max(1, Math.floor(Number(this.customQty) || 1)), unitPrice: price, stock: null, uom: 'pcs' }]);
    this.refreshOffers();
    this.customName = '';
    this.customQty = 1;
    this.customPrice = null;
    this.showCustom.set(false);
  }

  setQty(i: number, v: any): void {
    const cart = [...this.cart()];
    cart[i] = { ...cart[i], quantity: Math.max(1, Math.floor(Number(v) || 1)) };
    this.cart.set(cart);
    this.refreshOffers();
  }

  setPrice(i: number, v: any): void {
    const cart = [...this.cart()];
    cart[i] = { ...cart[i], unitPrice: Math.max(0, Number(v) || 0) };
    this.cart.set(cart);
    this.refreshOffers();
  }

  remove(i: number): void {
    const cart = [...this.cart()];
    cart.splice(i, 1);
    this.cart.set(cart);
    this.refreshOffers();
  }

  submit(): void {
    const s = this.session();
    if (!s || !this.cart().length) return;

    let customerId: string | undefined;
    let customer: { phone?: string; name?: string } | undefined;
    if (!s.customerLocked) {
      const sel = this.selectedCustomer();
      if (sel && sel.id) customerId = sel.id;
      else if (sel && sel.phone) customer = { phone: sel.phone, name: sel.name };
      else {
        const digits = this.custQuery().replace(/\D/g, '');
        if (digits.length < 7) { this.submitError.set('Select a customer or enter a valid phone number.'); return; }
        customer = { phone: this.custQuery().trim() };
      }
    }

    this.submitting.set(true);
    this.submitError.set(null);
    const cartLines = this.cart().map((l) => ({ productId: l.productId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, gstRate: l.gstRate }));
    const freeLines = this.orderFreeItems().map((f) => ({ productId: f.productId, name: '🎁 FREE: ' + f.name, quantity: f.quantity, unitPrice: 0, gstRate: 0 }));
    this.api
      .submit({
        items: [...cartLines, ...freeLines],
        customerId,
        customer,
        title: this.title.trim() || undefined,
        notes: this.notes.trim() || undefined,
        discount: (Number(this.discountAmt()) || 0) + this.schemeDiscount(),
        deliveryFee: Number(this.deliveryAmt()) || 0,
        couponCode: this.appliedCoupon()?.code,
      })
      .subscribe({
        next: (r) => { this.submitting.set(false); this.done.set({ type: r.type, number: r.number }); this.startAutoReturn(); },
        error: (e) => { this.submitting.set(false); this.submitError.set(e?.error?.message || 'Could not submit. Please try again.'); },
      });
  }
}
