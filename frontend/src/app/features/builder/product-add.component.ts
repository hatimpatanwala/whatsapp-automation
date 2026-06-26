import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';

interface Taxon { id: string; name: string; }

/**
 * Token-secured single-product add form, opened from WhatsApp (admin bot →
 * Products → Add Product). Name, price, stock, category, brand, HSN & tax.
 * Authenticated purely by the ?token= query param.
 */
@Component({
  selector: 'wa-product-add',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 text-gray-900">
      <header class="sticky top-0 z-10 bg-green-600 text-white shadow">
        <div class="max-w-xl mx-auto px-4 py-3 flex items-center gap-2">
          <i class="pi pi-plus-circle" style="font-size:1.05rem"></i>
          <h1 class="text-base font-semibold">Add Product</h1>
        </div>
      </header>

      @if (!token()) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <i class="pi pi-lock text-red-500 mb-2" style="font-size:1.5rem"></i>
            <p class="text-sm font-semibold text-red-800">Missing or invalid link.</p>
          </div>
        </div>
      } @else if (done(); as d) {
        <div class="max-w-md mx-auto p-6">
          <div class="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <i class="pi pi-check-circle text-green-600 mb-2" style="font-size:2rem"></i>
            <p class="text-sm font-semibold text-green-900">Product added</p>
            <p class="text-lg font-bold text-green-700 mt-1">{{ d.name }}</p>
            <button class="mt-4 text-sm text-green-700 underline" (click)="addAnother()">Add another</button>
          </div>
        </div>
      } @else {
        <main class="max-w-xl mx-auto p-4 space-y-3 pb-28">
          <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Name *</label>
              <input [(ngModel)]="form.name" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Product name" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Price *</label>
                <input type="number" [(ngModel)]="form.price" inputmode="decimal" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0.00" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Sale price</label>
                <input type="number" [(ngModel)]="form.salePrice" inputmode="decimal" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="optional" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Stock</label>
                <input type="number" [(ngModel)]="form.stock" inputmode="numeric" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">SKU</label>
                <input [(ngModel)]="form.sku" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="optional" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Category</label>
                <select [(ngModel)]="form.categoryId" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">— None —</option>
                  @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Brand</label>
                <select [(ngModel)]="form.brandId" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">— None —</option>
                  @for (b of brands(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }
                </select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">HSN / Tax code <span class="text-gray-300">(optional)</span></label>
                <input [(ngModel)]="form.hsnCode" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. 6109" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Tax % <span class="text-gray-300">(optional)</span></label>
                <input type="number" [(ngModel)]="form.taxRate" inputmode="decimal" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. 18" />
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Image URL <span class="text-gray-300">(optional)</span></label>
              <input [(ngModel)]="form.imageUrl" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="https://…" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Description</label>
              <textarea [(ngModel)]="form.description" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="optional"></textarea>
            </div>
          </div>
        </main>

        <footer class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
          <div class="max-w-xl mx-auto px-4 py-3">
            @if (error()) { <p class="text-xs text-red-600 mb-2"><i class="pi pi-exclamation-circle mr-1"></i>{{ error() }}</p> }
            <button class="w-full bg-green-600 text-white font-semibold rounded-lg py-3 hover:bg-green-700 disabled:opacity-50"
              [disabled]="!canSubmit() || saving()" (click)="submit()">
              {{ saving() ? 'Saving…' : 'Save Product' }}
            </button>
          </div>
        </footer>
      }
    </div>
  `,
})
export class ProductAddComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http: HttpClient;
  private readonly base = environment.apiUrl;

  token = signal('');
  categories = signal<Taxon[]>([]);
  brands = signal<Taxon[]>([]);
  saving = signal(false);
  error = signal<string | null>(null);
  done = signal<{ name: string } | null>(null);

  form: any = { name: '', price: null, salePrice: null, stock: 0, sku: '', categoryId: '', brandId: '', hsnCode: '', taxRate: null, imageUrl: '', description: '' };

  canSubmit = computed(() => true);

  constructor() {
    this.http = new HttpClient(inject(HttpBackend));
  }

  ngOnInit(): void {
    const t = this.route.snapshot.queryParamMap.get('token') || '';
    this.token.set(t);
    if (!t) return;
    this.http.get<{ categories: Taxon[]; brands: Taxon[] }>(`${this.base}/m/products/taxonomy?token=${t}`).subscribe({
      next: (r) => { this.categories.set(r.categories || []); this.brands.set(r.brands || []); },
      error: () => {},
    });
  }

  submit(): void {
    if (!this.form.name?.trim()) { this.error.set('Enter a product name.'); return; }
    if (this.form.price == null || this.form.price === '') { this.error.set('Enter a price.'); return; }
    this.saving.set(true);
    this.error.set(null);
    this.http.post<{ id: string; name: string }>(`${this.base}/m/products/create?token=${this.token()}`, this.form).subscribe({
      next: (r) => { this.saving.set(false); this.done.set({ name: r.name }); },
      error: (e) => { this.saving.set(false); this.error.set(e?.error?.message || 'Could not save the product.'); },
    });
  }

  addAnother(): void {
    this.form = { name: '', price: null, salePrice: null, stock: 0, sku: '', categoryId: '', brandId: '', hsnCode: '', taxRate: null, imageUrl: '', description: '' };
    this.done.set(null);
    this.error.set(null);
  }
}
