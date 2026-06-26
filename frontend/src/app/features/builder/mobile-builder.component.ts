import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  BuilderApiService,
  BuilderCustomer,
  BuilderProduct,
  BuilderSessionInfo,
} from './builder-api.service';

interface CartLine {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  stock: number | null; // null = custom item (no stock)
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
      <header class="sticky top-0 z-20 bg-green-600 text-white shadow">
        <div class="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <i class="pi pi-whatsapp" style="font-size:1.1rem"></i>
          <h1 class="text-base font-semibold">
            {{ session() ? (session()!.type === 'quote' ? 'Create Quote' : 'Create Order') : 'Builder' }}
          </h1>
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
          <div class="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <i class="pi pi-check-circle text-green-600 mb-2" style="font-size:2rem"></i>
            <p class="text-sm font-semibold text-green-900">{{ d.type === 'quote' ? 'Quote created' : 'Order created' }}</p>
            <p class="text-xl font-bold text-green-700 mt-1">{{ d.number }}</p>
            <p class="text-xs text-gray-500 mt-3">You can close this window and return to WhatsApp.</p>
          </div>
        </div>
      }

      @if (session() && !done() && !error()) {
        <main class="max-w-2xl mx-auto p-4 pb-32 space-y-4">
          <!-- Customer -->
          <section class="bg-white rounded-xl border border-gray-200 p-4">
            <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Customer</p>
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
                <input [(ngModel)]="custQuery" (ngModelChange)="onCustInput($event)" (focus)="custFocused.set(true)"
                  placeholder="Search customer by name or number…"
                  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                @if (custFocused() && (custResults().length || custSearching() || newCustomerPhone())) {
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
          <section class="bg-white rounded-xl border border-gray-200 p-4">
            <p class="text-xs font-semibold text-gray-500 uppercase mb-3">Items</p>

            @if (cart().length) {
              <div class="space-y-3 mb-3">
                @for (line of cart(); track $index; let i = $index) {
                  <div class="border border-gray-100 rounded-lg p-3">
                    <div class="flex items-start justify-between gap-2">
                      <p class="text-sm font-medium flex-1">
                        {{ line.name }}
                        @if (line.stock === null) { <span class="text-[10px] bg-amber-100 text-amber-700 rounded px-1 ml-1">custom</span> }
                      </p>
                      <button class="text-red-500 text-xs" (click)="remove(i)"><i class="pi pi-trash"></i></button>
                    </div>
                    <div class="flex items-center gap-2 mt-2">
                      <div class="flex-1">
                        <label class="block text-[10px] text-gray-400">Qty</label>
                        <input type="number" min="1" [ngModel]="line.quantity" (ngModelChange)="setQty(i, $event)" inputmode="numeric"
                          class="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                      </div>
                      <div class="flex-1">
                        <label class="block text-[10px] text-gray-400">Unit price</label>
                        <input type="number" min="0" step="0.01" [ngModel]="line.unitPrice" (ngModelChange)="setPrice(i, $event)" inputmode="decimal"
                          class="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                      </div>
                      <div class="text-right">
                        <label class="block text-[10px] text-gray-400">Total</label>
                        <p class="text-sm font-semibold">{{ sym() }}{{ (line.quantity * line.unitPrice) | number:'1.0-2' }}</p>
                      </div>
                    </div>
                    @if (line.stock !== null) {
                      <p class="text-[10px] mt-1" [class.text-red-500]="line.quantity > line.stock!" [class.text-gray-400]="line.quantity <= line.stock!">
                        In stock: {{ line.stock }}{{ line.quantity > line.stock! ? ' — exceeds stock!' : '' }}
                      </p>
                    }
                  </div>
                }
              </div>
            }

            @if (!cart().length) {
              <p class="text-xs text-gray-400 mb-2 text-center">No items yet — search a product or add a custom item below 👇</p>
            }

            <!-- Add item (stays below the list) -->
            <div class="border-t border-gray-100 pt-3 space-y-2">
              <div class="relative">
                <input [(ngModel)]="addQuery" (focus)="addFocused.set(true)" placeholder="🔍 Add a product…"
                  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                @if (addFocused() && addResults().length) {
                  <div class="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                    @for (p of addResults(); track p.id) {
                      <button class="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center justify-between" (click)="addProduct(p)">
                        <span>
                          <span class="text-sm font-medium">{{ p.name }}</span>
                          <span class="block text-xs text-gray-500">{{ sym() }}{{ p.price | number:'1.0-2' }} · <span [class.text-red-500]="p.stock <= 0">stock {{ p.stock }}</span></span>
                        </span>
                        <i class="pi pi-plus text-green-600"></i>
                      </button>
                    }
                  </div>
                }
              </div>

              @if (!showCustom()) {
                <button class="text-xs text-green-700 font-medium" (click)="showCustom.set(true)">
                  <i class="pi pi-plus mr-1"></i>Add a custom item (not in catalog)
                </button>
              } @else {
                <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <input [(ngModel)]="customName" placeholder="Custom item name" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                  <div class="flex gap-2">
                    <input type="number" min="1" [(ngModel)]="customQty" placeholder="Qty" inputmode="numeric" class="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm" />
                    <input type="number" min="0" step="0.01" [(ngModel)]="customPrice" placeholder="Price" inputmode="decimal" class="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm" />
                    <button class="bg-green-600 text-white text-xs rounded-lg px-3" (click)="addCustom()">Add</button>
                  </div>
                  <button class="text-[11px] text-gray-400" (click)="showCustom.set(false)">Cancel</button>
                </div>
              }
            </div>
          </section>

          <!-- Title / notes -->
          <section class="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            @if (session()!.type === 'quote') {
              <input [(ngModel)]="title" placeholder="Quote title (optional)" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            }
            <textarea [(ngModel)]="notes" rows="2" placeholder="Notes (optional)" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></textarea>
          </section>
        </main>

        <footer class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
          <div class="max-w-2xl mx-auto px-4 py-3">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm text-gray-500">Total ({{ cart().length }} item{{ cart().length === 1 ? '' : 's' }})</span>
              <span class="text-lg font-bold">{{ sym() }}{{ total() | number:'1.0-2' }}</span>
            </div>
            @if (submitError()) { <p class="text-xs text-red-600 mb-2"><i class="pi pi-exclamation-circle mr-1"></i>{{ submitError() }}</p> }
            <button class="w-full bg-green-600 text-white font-semibold rounded-lg py-3 hover:bg-green-700 disabled:opacity-50"
              [disabled]="!cart().length || submitting()" (click)="submit()">
              {{ submitting() ? 'Submitting…' : (session()!.type === 'quote' ? 'Create Quote' : 'Create Order') }}
            </button>
          </div>
        </footer>
      }
    </div>
  `,
})
export class MobileBuilderComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(BuilderApiService);

  loading = signal(true);
  error = signal<string | null>(null);
  session = signal<BuilderSessionInfo | null>(null);
  products = signal<BuilderProduct[]>([]);
  cart = signal<CartLine[]>([]);
  submitting = signal(false);
  submitError = signal<string | null>(null);
  done = signal<{ type: string; number: string } | null>(null);

  // Customer picker
  custQuery = '';
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
    return (q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list).slice(0, 8);
  });

  total = computed(() => this.cart().reduce((s, l) => s + l.quantity * l.unitPrice, 0));

  newCustomerPhone = computed(() => {
    const q = this.custQuery.trim();
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

  onCustInput(_: string): void {
    this.custFocused.set(true);
    if (this.custTimer) clearTimeout(this.custTimer);
    const q = this.custQuery.trim();
    this.custSearching.set(true);
    this.custTimer = setTimeout(() => {
      this.api.searchCustomers(q).subscribe({
        next: (r) => { this.custResults.set(r || []); this.custSearching.set(false); },
        error: () => { this.custResults.set([]); this.custSearching.set(false); },
      });
    }, 280);
  }

  selectCustomer(c: BuilderCustomer): void { this.selectedCustomer.set(c); this.custFocused.set(false); this.custResults.set([]); }
  useNewCustomer(): void { this.selectedCustomer.set({ id: '', name: '', phone: this.custQuery.trim() }); this.custFocused.set(false); this.custResults.set([]); }
  clearCustomer(): void { this.selectedCustomer.set(null); this.custQuery = ''; this.custResults.set([]); }

  sym(): string {
    const c = this.products()[0]?.currency || 'INR';
    return c === 'INR' ? '₹' : c === 'USD' ? '$' : c === 'EUR' ? '€' : c + ' ';
  }

  addProduct(p: BuilderProduct): void {
    const cart = [...this.cart()];
    const existing = cart.find((l) => l.productId === p.id);
    if (existing) existing.quantity += 1;
    else cart.push({ productId: p.id, name: p.name, quantity: 1, unitPrice: p.price, stock: p.stock });
    this.cart.set(cart);
    this.addQuery = '';
    this.addFocused.set(false);
  }

  addCustom(): void {
    const name = this.customName.trim();
    const price = Number(this.customPrice);
    if (!name) { this.submitError.set('Enter a custom item name.'); return; }
    if (isNaN(price) || price < 0) { this.submitError.set('Enter a valid custom item price.'); return; }
    this.submitError.set(null);
    this.cart.set([...this.cart(), { name, quantity: Math.max(1, Math.floor(Number(this.customQty) || 1)), unitPrice: price, stock: null }]);
    this.customName = '';
    this.customQty = 1;
    this.customPrice = null;
    this.showCustom.set(false);
  }

  setQty(i: number, v: any): void {
    const cart = [...this.cart()];
    cart[i] = { ...cart[i], quantity: Math.max(1, Math.floor(Number(v) || 1)) };
    this.cart.set(cart);
  }

  setPrice(i: number, v: any): void {
    const cart = [...this.cart()];
    cart[i] = { ...cart[i], unitPrice: Math.max(0, Number(v) || 0) };
    this.cart.set(cart);
  }

  remove(i: number): void {
    const cart = [...this.cart()];
    cart.splice(i, 1);
    this.cart.set(cart);
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
        const digits = this.custQuery.replace(/\D/g, '');
        if (digits.length < 7) { this.submitError.set('Select a customer or enter a valid phone number.'); return; }
        customer = { phone: this.custQuery.trim() };
      }
    }

    this.submitting.set(true);
    this.submitError.set(null);
    this.api
      .submit({
        items: this.cart().map((l) => ({ productId: l.productId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice })),
        customerId,
        customer,
        title: this.title.trim() || undefined,
        notes: this.notes.trim() || undefined,
      })
      .subscribe({
        next: (r) => { this.submitting.set(false); this.done.set({ type: r.type, number: r.number }); },
        error: (e) => { this.submitting.set(false); this.submitError.set(e?.error?.message || 'Could not submit. Please try again.'); },
      });
  }
}
