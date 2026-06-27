import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';
import { returnToWhatsApp } from './webview-return';

interface Taxon { id: string; name: string; }
interface ShopProduct {
  id: string; name: string; description: string; brand: string | null;
  categoryId: string | null; brandId: string | null;
  price: number; basePrice: number; onSale: boolean; currency: string;
  image: string | null; stock: number; uom: string; tags: string[]; isNew: boolean; offer: string | null;
}
interface CartLine { productId: string; name: string; image: string | null; uom: string; quantity: number; unitPrice: number; lineTotal: number; }
interface FreeItem { productId: string; name: string; quantity: number; unitPrice: number; }
interface Cart {
  items: CartLine[]; count: number; subtotal: number;
  schemeDiscount: number; couponDiscount: number; discount: number; total: number;
  freeItems: FreeItem[]; appliedOffers: { name: string; label: string }[];
  coupon: { id: string; code: string; label: string } | null; couponError: string | null;
}

/**
 * Customer-facing ecommerce storefront opened from WhatsApp (/m/shop). Product
 * grid → cart → checkout, all in the in-app browser. Authenticated purely by the
 * ?token= query param (a 'shop' session bound to the customer); the cart is the
 * customer's REAL cart, so it stays in sync with the in-chat flow.
 */
@Component({
  selector: 'wa-shop-webview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900 pb-28">
      <header class="sticky top-0 z-20 bg-green-600 text-white shadow">
        <div class="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          @if (view() !== 'catalog') {
            <button class="text-white/90" (click)="view.set('catalog')"><i class="pi pi-arrow-left"></i></button>
          }
          <div class="flex items-center gap-2 min-w-0">
            <i class="pi pi-shop" style="font-size:1.1rem"></i>
            <h1 class="text-base font-semibold truncate">{{ store()?.name || 'Store' }}</h1>
          </div>
          @if (view() === 'catalog') {
            <button class="ml-auto relative" (click)="view.set('cart')">
              <i class="pi pi-shopping-cart" style="font-size:1.25rem"></i>
              @if (cart().count > 0) {
                <span class="absolute -top-2 -right-2 bg-white text-green-700 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">{{ cart().count }}</span>
              }
            </button>
          }
        </div>
      </header>

      @if (!token() || loadError()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.5rem"></i>
            <p class="text-sm font-semibold text-red-800">{{ loadError() || 'Missing or invalid link.' }}</p>
          </div>
        </div>
      } @else if (loading()) {
        <p class="text-center text-sm text-gray-400 py-16"><i class="pi pi-spin pi-spinner mr-1"></i>Loading store…</p>
      } @else {

        <!-- ─── CATALOG ─────────────────────────────────────────────── -->
        @if (view() === 'catalog') {
          <div class="max-w-2xl mx-auto p-3 space-y-3">
            <div class="relative">
              <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input [ngModel]="search()" (ngModelChange)="search.set($event)" class="w-full border border-gray-300 rounded-full pl-9 pr-3 py-2 text-sm" placeholder="Search products…" />
            </div>
            @if (categories().length || brands().length) {
              <div class="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                <button class="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border"
                  [class]="!catFilter() && !brandFilter() ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'"
                  (click)="clearFilters()">All</button>
                @for (c of categories(); track c.id) {
                  <button class="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border"
                    [class]="catFilter() === c.id ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'"
                    (click)="toggleCat(c.id)">{{ c.name }}</button>
                }
              </div>
            }

            @if (!filteredProducts().length) {
              <p class="text-center text-sm text-gray-400 py-12">No products found.</p>
            }
            <div class="grid grid-cols-2 gap-3">
              @for (p of filteredProducts(); track p.id) {
                <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                  <button class="relative aspect-square bg-gray-50 flex items-center justify-center" (click)="openProduct(p)">
                    @if (p.image) { <img [src]="p.image" class="w-full h-full object-cover" loading="lazy" /> }
                    @else { <i class="pi pi-image text-gray-200" style="font-size:2rem"></i> }
                    <div class="absolute top-1.5 left-1.5 flex flex-col gap-1 items-start">
                      @if (p.isNew) { <span class="text-[9px] font-bold bg-blue-600 text-white rounded px-1.5 py-0.5">NEW</span> }
                      @if (p.offer) { <span class="text-[9px] font-bold bg-green-600 text-white rounded px-1.5 py-0.5">{{ p.offer }}</span> }
                    </div>
                  </button>
                  <div class="p-2.5 flex flex-col flex-1">
                    <p class="text-xs font-semibold leading-tight line-clamp-2 min-h-[2rem]" (click)="openProduct(p)">{{ p.name }}</p>
                    @if (p.brand) { <p class="text-[10px] text-gray-400 mt-0.5">{{ p.brand }}</p> }
                    <div class="flex items-baseline gap-1.5 mt-1">
                      <span class="text-sm font-bold text-gray-900">{{ sym() }}{{ p.price | number:'1.0-2' }}</span>
                      @if (p.onSale) { <span class="text-[10px] text-gray-400 line-through">{{ sym() }}{{ p.basePrice | number:'1.0-2' }}</span> }
                    </div>
                    <span class="text-[10px] text-gray-400">/ {{ p.uom }}</span>
                    <div class="mt-2">
                      @if (qtyOf(p.id) === 0) {
                        <button class="w-full bg-green-600 text-white text-xs font-semibold rounded-lg py-1.5 disabled:opacity-40"
                          [disabled]="p.stock <= 0 || busy()" (click)="setQty(p, 1)">{{ p.stock <= 0 ? 'Out of stock' : 'Add' }}</button>
                      } @else {
                        <div class="flex items-center justify-between border border-green-600 rounded-lg overflow-hidden">
                          <button class="px-2.5 py-1 text-green-700 font-bold" [disabled]="busy()" (click)="setQty(p, qtyOf(p.id) - 1)">−</button>
                          <span class="text-sm font-semibold">{{ qtyOf(p.id) }}</span>
                          <button class="px-2.5 py-1 text-green-700 font-bold" [disabled]="busy()" (click)="setQty(p, qtyOf(p.id) + 1)">+</button>
                        </div>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- ─── CART ────────────────────────────────────────────────── -->
        @if (view() === 'cart') {
          <div class="max-w-2xl mx-auto p-3 space-y-3">
            @if (!cart().items.length) {
              <div class="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
                <p class="text-4xl mb-2">🛒</p>
                <p class="text-sm font-semibold text-gray-700">Your cart is empty</p>
                <button class="mt-4 text-sm text-green-700 font-medium" (click)="view.set('catalog')">Browse products</button>
              </div>
            } @else {
              @for (l of cart().items; track l.productId) {
                <div class="bg-white rounded-xl border border-gray-100 p-2.5 flex gap-3 items-center">
                  <div class="w-14 h-14 rounded-lg bg-gray-50 shrink-0 overflow-hidden flex items-center justify-center">
                    @if (l.image) { <img [src]="l.image" class="w-full h-full object-cover" /> }
                    @else { <i class="pi pi-image text-gray-200"></i> }
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium leading-tight line-clamp-2">{{ l.name }}</p>
                    <p class="text-xs text-gray-500 mt-0.5">{{ sym() }}{{ l.unitPrice | number:'1.0-2' }} / {{ l.uom }}</p>
                  </div>
                  <div class="flex flex-col items-end gap-1.5">
                    <span class="text-sm font-bold">{{ sym() }}{{ l.lineTotal | number:'1.0-2' }}</span>
                    <div class="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                      <button class="px-2 py-0.5 text-gray-600 font-bold" [disabled]="busy()" (click)="setQtyId(l.productId, l.quantity - 1)">−</button>
                      <span class="text-xs font-semibold w-6 text-center">{{ l.quantity }}</span>
                      <button class="px-2 py-0.5 text-gray-600 font-bold" [disabled]="busy()" (click)="setQtyId(l.productId, l.quantity + 1)">+</button>
                    </div>
                  </div>
                </div>
              }

              @if (cart().freeItems.length) {
                <div class="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p class="text-xs font-semibold text-amber-800 mb-1">🎁 Free with your order</p>
                  @for (f of cart().freeItems; track f.productId) {
                    <p class="text-xs text-amber-700">• {{ f.name }} × {{ f.quantity }}</p>
                  }
                </div>
              }

              <!-- Coupon -->
              <div class="bg-white rounded-xl border border-gray-100 p-3">
                @if (cart().coupon) {
                  <div class="flex items-center justify-between">
                    <span class="text-sm"><span class="font-mono font-bold">{{ cart().coupon!.code }}</span> <span class="text-green-700">applied</span></span>
                    <button class="text-xs text-red-500 font-medium" (click)="removeCoupon()">Remove</button>
                  </div>
                } @else {
                  <div class="flex gap-2">
                    <input [(ngModel)]="couponInput" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase" placeholder="Coupon code" />
                    <button class="bg-gray-900 text-white text-sm font-semibold rounded-lg px-4 disabled:opacity-40" [disabled]="busy() || !couponInput.trim()" (click)="applyCoupon()">Apply</button>
                  </div>
                  @if (couponMsg()) { <p class="text-xs text-red-500 mt-1.5">{{ couponMsg() }}</p> }
                }
              </div>

              <!-- Summary -->
              <div class="bg-white rounded-xl border border-gray-100 p-3 space-y-1.5 text-sm">
                @if (cart().appliedOffers.length) {
                  <div class="flex flex-wrap gap-1 mb-1">
                    @for (o of cart().appliedOffers; track o.name) {
                      <span class="text-[10px] bg-green-50 text-green-700 rounded px-1.5 py-0.5">🏷️ {{ o.name }}</span>
                    }
                  </div>
                }
                <div class="flex justify-between text-gray-600"><span>Subtotal</span><span>{{ sym() }}{{ cart().subtotal | number:'1.0-2' }}</span></div>
                @if (cart().schemeDiscount > 0) { <div class="flex justify-between text-green-700"><span>Offer discount</span><span>-{{ sym() }}{{ cart().schemeDiscount | number:'1.0-2' }}</span></div> }
                @if (cart().couponDiscount > 0) { <div class="flex justify-between text-green-700"><span>Coupon</span><span>-{{ sym() }}{{ cart().couponDiscount | number:'1.0-2' }}</span></div> }
                <div class="flex justify-between font-bold text-base pt-1.5 border-t border-gray-100"><span>Total</span><span>{{ sym() }}{{ cart().total | number:'1.0-2' }}</span></div>
              </div>

              <textarea [(ngModel)]="notes" rows="2" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" placeholder="Delivery notes (optional)"></textarea>
            }
          </div>
        }

        <!-- ─── SUCCESS ─────────────────────────────────────────────── -->
        @if (view() === 'success' && order(); as o) {
          <div class="max-w-md mx-auto p-6">
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
              <p class="text-5xl mb-2">✅</p>
              <p class="text-lg font-bold text-gray-900">Order placed!</p>
              <p class="text-sm text-gray-500 mt-1">Your order <span class="font-semibold">{{ o.orderNumber }}</span> has been received.</p>
              <p class="text-2xl font-extrabold text-green-700 mt-3">{{ sym() }}{{ o.total | number:'1.0-2' }}</p>

              <button class="mt-5 w-full bg-green-600 text-white font-semibold rounded-lg py-3 text-sm" (click)="returnNow()">
                <i class="pi pi-whatsapp mr-1"></i>Back to chat@if (returnIn() !== null) { <span> ({{ returnIn() }})</span> }
              </button>
              @if (o.viewUrl) {
                <a [href]="o.viewUrl" (click)="cancelAutoReturn()" class="mt-3 block text-sm text-green-700 font-medium">View order details</a>
              }
              <button class="mt-3 text-sm text-gray-500 font-medium" (click)="continueShopping()">Continue shopping</button>
              @if (returnIn() !== null) {
                <p class="text-[11px] text-gray-400 mt-3">Returning to WhatsApp automatically…</p>
              }
            </div>
          </div>
        }
      }

      <!-- Sticky checkout bar (cart view) -->
      @if (view() === 'cart' && cart().items.length) {
        <div class="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200 p-3">
          <div class="max-w-2xl mx-auto flex items-center gap-3">
            <div class="text-sm">
              <p class="text-gray-400 text-[11px] leading-none">Total</p>
              <p class="font-bold">{{ sym() }}{{ cart().total | number:'1.0-2' }}</p>
            </div>
            <button class="flex-1 bg-green-600 text-white font-semibold rounded-lg py-3 text-sm disabled:opacity-40" [disabled]="placing()" (click)="checkout()">
              {{ placing() ? 'Placing order…' : 'Place Order' }}
            </button>
          </div>
        </div>
      }

      <!-- Product detail modal -->
      @if (detail(); as p) {
        <div class="fixed inset-0 z-30 bg-black/40 flex items-end sm:items-center justify-center" (click)="detail.set(null)">
          <div class="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
            <div class="relative aspect-square bg-gray-50 flex items-center justify-center">
              @if (p.image) { <img [src]="p.image" class="w-full h-full object-cover" /> }
              @else { <i class="pi pi-image text-gray-200" style="font-size:3rem"></i> }
              <button class="absolute top-3 right-3 bg-white/90 rounded-full w-8 h-8 flex items-center justify-center" (click)="detail.set(null)">&times;</button>
              <div class="absolute top-3 left-3 flex gap-1">
                @if (p.isNew) { <span class="text-[10px] font-bold bg-blue-600 text-white rounded px-2 py-0.5">NEW</span> }
                @if (p.offer) { <span class="text-[10px] font-bold bg-green-600 text-white rounded px-2 py-0.5">{{ p.offer }}</span> }
              </div>
            </div>
            <div class="p-4 space-y-2">
              <h2 class="text-base font-bold">{{ p.name }}</h2>
              @if (p.brand) { <p class="text-xs text-gray-400">{{ p.brand }}</p> }
              <div class="flex items-baseline gap-2">
                <span class="text-xl font-extrabold text-gray-900">{{ sym() }}{{ p.price | number:'1.0-2' }}</span>
                @if (p.onSale) { <span class="text-sm text-gray-400 line-through">{{ sym() }}{{ p.basePrice | number:'1.0-2' }}</span> }
                <span class="text-xs text-gray-400">/ {{ p.uom }}</span>
              </div>
              @if (p.description) { <p class="text-sm text-gray-600 whitespace-pre-line">{{ p.description }}</p> }
              <p class="text-xs" [class.text-red-500]="p.stock <= 0" [class.text-gray-400]="p.stock > 0">{{ p.stock > 0 ? 'In stock' : 'Out of stock' }}</p>
            </div>
            <div class="sticky bottom-0 bg-white p-4 border-t border-gray-100">
              @if (qtyOf(p.id) === 0) {
                <button class="w-full bg-green-600 text-white font-semibold rounded-lg py-3 text-sm disabled:opacity-40" [disabled]="p.stock <= 0 || busy()" (click)="setQty(p, 1)">Add to cart</button>
              } @else {
                <div class="flex items-center gap-3">
                  <div class="flex items-center border border-green-600 rounded-lg overflow-hidden">
                    <button class="px-4 py-2 text-green-700 font-bold" [disabled]="busy()" (click)="setQty(p, qtyOf(p.id) - 1)">−</button>
                    <span class="text-sm font-semibold w-8 text-center">{{ qtyOf(p.id) }}</span>
                    <button class="px-4 py-2 text-green-700 font-bold" [disabled]="busy()" (click)="setQty(p, qtyOf(p.id) + 1)">+</button>
                  </div>
                  <button class="flex-1 bg-green-600 text-white font-semibold rounded-lg py-3 text-sm" (click)="detail.set(null); view.set('cart')">View cart</button>
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ShopWebviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http: HttpClient;
  private readonly base = environment.apiUrl;

  token = signal('');
  loading = signal(true);
  loadError = signal<string | null>(null);
  busy = signal(false);
  placing = signal(false);

  view = signal<'catalog' | 'cart' | 'success'>('catalog');
  store = signal<{ name: string; currency: string; whatsappPhone?: string } | null>(null);
  returnIn = signal<number | null>(null);
  private returnTimer: any = null;
  categories = signal<Taxon[]>([]);
  brands = signal<Taxon[]>([]);
  products = signal<ShopProduct[]>([]);
  cart = signal<Cart>(this.empty());
  detail = signal<ShopProduct | null>(null);
  order = signal<{ orderNumber: string; total: number; viewUrl: string | null } | null>(null);

  search = signal('');
  catFilter = signal('');
  brandFilter = signal('');
  couponInput = '';
  couponMsg = signal<string | null>(null);
  notes = '';

  filteredProducts = computed(() => {
    const q = this.search().trim().toLowerCase();
    const cat = this.catFilter();
    return this.products().filter((p) =>
      (!cat || p.categoryId === cat) &&
      (!q || p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q)),
    );
  });

  constructor() { this.http = new HttpClient(inject(HttpBackend)); }

  private empty(): Cart {
    return { items: [], count: 0, subtotal: 0, schemeDiscount: 0, couponDiscount: 0, discount: 0, total: 0, freeItems: [], appliedOffers: [], coupon: null, couponError: null };
  }
  private unwrap<T>(r: any): T { return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T; }
  private opts() { return { headers: { 'X-Builder-Token': this.token() } }; }
  sym(): string { const c = this.store()?.currency; return c === 'USD' ? '$' : c === 'EUR' ? '€' : '₹'; }
  qtyOf(id: string): number { return this.cart().items.find((l) => l.productId === id)?.quantity || 0; }

  ngOnInit(): void {
    const t = this.route.snapshot.queryParamMap.get('token') || '';
    this.token.set(t);
    const startView = this.route.snapshot.queryParamMap.get('view');
    if (startView === 'cart') this.view.set('cart');
    if (!t) { this.loading.set(false); return; }
    this.http.get<any>(`${this.base}/m/shop/bootstrap`, this.opts()).subscribe({
      next: (r) => {
        const d = this.unwrap<any>(r) || {};
        this.store.set(d.store || { name: 'Store', currency: 'INR' });
        this.categories.set(d.categories || []);
        this.brands.set(d.brands || []);
        this.products.set(d.products || []);
        if (d.cart) this.cart.set(d.cart);
        this.loading.set(false);
      },
      error: (e) => { this.loading.set(false); this.loadError.set(e?.error?.message || 'This link is invalid or has expired.'); },
    });
  }

  clearFilters() { this.catFilter.set(''); this.brandFilter.set(''); }
  toggleCat(id: string) { this.catFilter.set(this.catFilter() === id ? '' : id); }
  openProduct(p: ShopProduct) { this.detail.set(p); }

  setQty(p: ShopProduct, qty: number) { this.setQtyId(p.id, qty); }
  setQtyId(productId: string, qty: number) {
    if (this.busy()) return;
    this.busy.set(true);
    this.http.post<any>(`${this.base}/m/shop/cart/item`, { productId, quantity: Math.max(0, qty) }, this.opts()).subscribe({
      next: (r) => { this.cart.set(this.unwrap<Cart>(r) || this.empty()); this.busy.set(false); },
      error: () => { this.busy.set(false); },
    });
  }

  applyCoupon() {
    const code = this.couponInput.trim().toUpperCase();
    if (!code) return;
    this.busy.set(true); this.couponMsg.set(null);
    this.http.post<any>(`${this.base}/m/shop/coupon`, { code }, this.opts()).subscribe({
      next: (r) => {
        const c = this.unwrap<Cart>(r) || this.empty();
        this.cart.set(c); this.busy.set(false);
        if (c.coupon) { this.couponInput = ''; }
        else this.couponMsg.set(c.couponError || 'Invalid coupon.');
      },
      error: (e) => { this.busy.set(false); this.couponMsg.set(e?.error?.message || 'Invalid coupon.'); },
    });
  }
  removeCoupon() {
    // Re-fetch the cart with no coupon.
    this.busy.set(true);
    this.http.get<any>(`${this.base}/m/shop/cart`, this.opts()).subscribe({
      next: (r) => { this.cart.set(this.unwrap<Cart>(r) || this.empty()); this.busy.set(false); },
      error: () => { this.busy.set(false); },
    });
  }

  checkout() {
    if (this.placing()) return;
    this.placing.set(true);
    const body = { couponCode: this.cart().coupon?.code, notes: this.notes || undefined };
    this.http.post<any>(`${this.base}/m/shop/checkout`, body, this.opts()).subscribe({
      next: (r) => {
        const o = this.unwrap<any>(r);
        this.order.set({ orderNumber: o.orderNumber, total: o.total, viewUrl: o.viewUrl });
        this.cart.set(this.empty());
        this.placing.set(false);
        this.view.set('success');
        this.startAutoReturn();
      },
      error: (e) => { this.placing.set(false); this.couponMsg.set(e?.error?.message || 'Could not place the order.'); alert(e?.error?.message || 'Could not place the order.'); },
    });
  }

  // ─── Return to WhatsApp once the order is placed ───────────────────────────
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
    returnToWhatsApp(this.store()?.whatsappPhone);
  }

  continueShopping() {
    this.cancelAutoReturn();
    this.order.set(null);
    this.notes = '';
    this.view.set('catalog');
    // refresh products (stock) + cart
    this.http.get<any>(`${this.base}/m/shop/products`, this.opts()).subscribe({ next: (r) => this.products.set(this.unwrap<ShopProduct[]>(r) || []) });
  }
}
