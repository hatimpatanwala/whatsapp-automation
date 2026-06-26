import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  BuilderApiService,
  BuilderProduct,
  BuilderSessionInfo,
} from './builder-api.service';

interface CartLine {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  stock: number;
}

/**
 * Token-secured order/quote builder, designed to run inside WhatsApp's in-app
 * browser. Authenticated purely by the ?token= query param (validated server
 * side); shows products with live stock, lets the admin set qty + price, and
 * submits a new order/quote. Cannot do anything without a valid token.
 */
@Component({
  selector: 'wa-mobile-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900">
      <!-- Header -->
      <header class="sticky top-0 z-10 bg-green-600 text-white px-4 py-3 shadow">
        <div class="flex items-center gap-2">
          <i class="pi pi-whatsapp" style="font-size:1.1rem"></i>
          <h1 class="text-base font-semibold">
            {{ session() ? (session()!.type === 'quote' ? 'Create Quote' : 'Create Order') : 'Builder' }}
          </h1>
        </div>
      </header>

      <!-- Loading -->
      @if (loading()) {
        <div class="p-8 text-center text-gray-500 text-sm">
          <i class="pi pi-spin pi-spinner mr-2"></i>Loading…
        </div>
      }

      <!-- Error / invalid token -->
      @if (error()) {
        <div class="p-6">
          <div class="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.5rem"></i>
            <p class="text-sm font-semibold text-red-800">{{ error() }}</p>
            <p class="text-xs text-red-600 mt-1">This page can only be opened from a valid link.</p>
          </div>
        </div>
      }

      <!-- Done -->
      @if (done(); as d) {
        <div class="p-6">
          <div class="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
            <i class="pi pi-check-circle text-green-600 mb-2" style="font-size:2rem"></i>
            <p class="text-sm font-semibold text-green-900">
              {{ d.type === 'quote' ? 'Quote created' : 'Order created' }}
            </p>
            <p class="text-lg font-bold text-green-700 mt-1">{{ d.number }}</p>
            <p class="text-xs text-gray-500 mt-3">You can close this window and return to WhatsApp.</p>
          </div>
        </div>
      }

      <!-- Builder -->
      @if (session() && !done() && !error()) {
        <div class="p-4 space-y-4 pb-32">
          <!-- Customer -->
          <section class="bg-white rounded-xl border border-gray-200 p-4">
            <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Customer</p>
            @if (session()!.customerLocked) {
              <p class="text-sm font-medium">{{ session()!.customer.name || 'Customer' }}</p>
              <p class="text-xs text-gray-500">{{ session()!.customer.phone }}</p>
            } @else {
              <div class="space-y-2">
                <input [(ngModel)]="customerPhone" inputmode="tel" placeholder="Customer phone (e.g. +91…)"
                  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <input [(ngModel)]="customerName" placeholder="Customer name (optional)"
                  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            }
          </section>

          <!-- Cart -->
          @if (cart().length) {
            <section class="bg-white rounded-xl border border-gray-200 p-4">
              <p class="text-xs font-semibold text-gray-500 uppercase mb-3">Items</p>
              <div class="space-y-3">
                @for (line of cart(); track line.name; let i = $index) {
                  <div class="border border-gray-100 rounded-lg p-3">
                    <div class="flex items-start justify-between gap-2">
                      <p class="text-sm font-medium flex-1">{{ line.name }}</p>
                      <button class="text-red-500 text-xs" (click)="remove(i)"><i class="pi pi-trash"></i></button>
                    </div>
                    <div class="flex items-center gap-2 mt-2">
                      <div class="flex-1">
                        <label class="block text-[10px] text-gray-400">Qty</label>
                        <input type="number" min="1" [ngModel]="line.quantity"
                          (ngModelChange)="setQty(i, $event)" inputmode="numeric"
                          class="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                      </div>
                      <div class="flex-1">
                        <label class="block text-[10px] text-gray-400">Unit price</label>
                        <input type="number" min="0" step="0.01" [ngModel]="line.unitPrice"
                          (ngModelChange)="setPrice(i, $event)" inputmode="decimal"
                          class="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                      </div>
                      <div class="text-right">
                        <label class="block text-[10px] text-gray-400">Total</label>
                        <p class="text-sm font-semibold">{{ sym() }}{{ (line.quantity * line.unitPrice) | number:'1.0-2' }}</p>
                      </div>
                    </div>
                    @if (line.stock != null) {
                      <p class="text-[10px] mt-1"
                         [class.text-red-500]="line.quantity > line.stock"
                         [class.text-gray-400]="line.quantity <= line.stock">
                        In stock: {{ line.stock }}{{ line.quantity > line.stock ? ' — exceeds stock!' : '' }}
                      </p>
                    }
                  </div>
                }
              </div>
            </section>
          }

          <!-- Title (quote) + notes -->
          <section class="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            @if (session()!.type === 'quote') {
              <input [(ngModel)]="title" placeholder="Quote title (optional)"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            }
            <textarea [(ngModel)]="notes" rows="2" placeholder="Notes (optional)"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></textarea>
          </section>

          <!-- Product picker -->
          <section class="bg-white rounded-xl border border-gray-200 p-4">
            <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Add products</p>
            <input [(ngModel)]="search" placeholder="Search products…"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3" />
            <div class="divide-y divide-gray-100 max-h-80 overflow-auto">
              @for (p of filteredProducts(); track p.id) {
                <div class="flex items-center justify-between py-2 gap-2">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">{{ p.name }}</p>
                    <p class="text-xs text-gray-500">
                      {{ sym() }}{{ p.price | number:'1.0-2' }}
                      · <span [class.text-red-500]="p.stock <= 0">stock {{ p.stock }}</span>
                    </p>
                  </div>
                  <button class="bg-green-600 text-white text-xs rounded-lg px-3 py-1.5"
                    (click)="add(p)">Add</button>
                </div>
              } @empty {
                <p class="text-xs text-gray-400 py-3 text-center">No products found.</p>
              }
            </div>
          </section>
        </div>

        <!-- Sticky footer: total + submit -->
        <footer class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-gray-500">Total</span>
            <span class="text-lg font-bold">{{ sym() }}{{ total() | number:'1.0-2' }}</span>
          </div>
          @if (submitError()) {
            <p class="text-xs text-red-600 mb-2"><i class="pi pi-exclamation-circle mr-1"></i>{{ submitError() }}</p>
          }
          <button class="w-full bg-green-600 text-white font-semibold rounded-lg py-3 disabled:opacity-50"
            [disabled]="!cart().length || submitting()" (click)="submit()">
            {{ submitting() ? 'Submitting…' : (session()!.type === 'quote' ? 'Create Quote' : 'Create Order') }}
          </button>
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

  search = '';
  customerPhone = '';
  customerName = '';
  title = '';
  notes = '';

  filteredProducts = computed(() => {
    const q = this.search.trim().toLowerCase();
    const list = this.products();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  });

  total = computed(() => this.cart().reduce((s, l) => s + l.quantity * l.unitPrice, 0));

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!token) {
      this.loading.set(false);
      this.error.set('Missing or invalid link.');
      return;
    }
    this.api.setToken(token);
    this.api.getSession().subscribe({
      next: (s) => {
        this.session.set(s);
        this.loadProducts();
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(e?.error?.message || 'This link is invalid or has expired.');
      },
    });
  }

  private loadProducts(): void {
    this.api.getProducts().subscribe({
      next: (p) => {
        this.products.set(p || []);
        this.loading.set(false);
      },
      error: () => {
        this.products.set([]);
        this.loading.set(false);
      },
    });
  }

  sym(): string {
    const c = this.products()[0]?.currency || 'INR';
    return c === 'INR' ? '₹' : c === 'USD' ? '$' : c === 'EUR' ? '€' : c + ' ';
  }

  add(p: BuilderProduct): void {
    const cart = [...this.cart()];
    const existing = cart.find((l) => l.productId === p.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({ productId: p.id, name: p.name, quantity: 1, unitPrice: p.price, stock: p.stock });
    }
    this.cart.set(cart);
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
    if (!s.customerLocked && !this.customerPhone.trim()) {
      this.submitError.set('Enter the customer phone number.');
      return;
    }
    this.submitting.set(true);
    this.submitError.set(null);
    this.api
      .submit({
        items: this.cart().map((l) => ({
          productId: l.productId,
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        customer: s.customerLocked ? undefined : { phone: this.customerPhone.trim(), name: this.customerName.trim() },
        title: this.title.trim() || undefined,
        notes: this.notes.trim() || undefined,
      })
      .subscribe({
        next: (r) => {
          this.submitting.set(false);
          this.done.set({ type: r.type, number: r.number });
        },
        error: (e) => {
          this.submitting.set(false);
          this.submitError.set(e?.error?.message || 'Could not submit. Please try again.');
        },
      });
  }
}
