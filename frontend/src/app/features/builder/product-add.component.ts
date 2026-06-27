import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';
import { returnToWhatsApp } from './webview-return';

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
            <button class="mt-5 w-full bg-green-600 text-white font-semibold rounded-lg py-3 text-sm" (click)="backToChat()">
              <i class="pi pi-whatsapp mr-1"></i>Back to chat
            </button>
            <button class="mt-3 text-sm text-green-700 underline" (click)="addAnother()">Add another</button>
          </div>
        </div>
      } @else {
        <main class="max-w-xl mx-auto p-4 space-y-3 pb-10">
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
                <label class="block text-xs font-semibold text-gray-500 mb-1">Low stock alert</label>
                <input type="number" [(ngModel)]="form.lowStockThreshold" inputmode="numeric" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="5" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Unit (UOM) *</label>
                <select [(ngModel)]="form.uom" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  @for (u of uomOptions; track u.value) { <option [value]="u.value">{{ u.label }}</option> }
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">SKU</label>
                <input [(ngModel)]="form.sku" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="optional" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Barcode</label>
                <input [(ngModel)]="form.barcode" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="optional" />
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
              <label class="block text-xs font-semibold text-gray-500 mb-1">Status</label>
              <select [(ngModel)]="form.status" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Short description <span class="text-gray-300">(optional)</span></label>
              <input [(ngModel)]="form.shortDescription" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Brief summary" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Tags <span class="text-gray-300">(comma separated)</span></label>
              <input [(ngModel)]="form.tags" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. new, sale, featured" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Image <span class="text-gray-300">(optional)</span></label>
              @if (form.imageUrl) {
                <div class="relative inline-block">
                  <img [src]="form.imageUrl" class="w-24 h-24 rounded-lg object-cover border border-gray-200" />
                  <button type="button" class="absolute -top-2 -right-2 bg-white rounded-full border border-gray-200 w-6 h-6 text-red-500 flex items-center justify-center" (click)="form.imageUrl = ''"><i class="pi pi-times text-xs"></i></button>
                </div>
              } @else {
                <input #img type="file" accept="image/*" class="hidden" (change)="uploadImage($event)" />
                <button type="button" class="w-full border border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  [disabled]="uploading()" (click)="img.click()">
                  <i class="pi pi-camera mr-1"></i>{{ uploading() ? 'Uploading…' : 'Upload image' }}
                </button>
                <input [(ngModel)]="form.imageUrl" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-2" placeholder="…or paste an image URL" />
              }
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Description</label>
              <textarea [(ngModel)]="form.description" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="optional"></textarea>
            </div>
          </div>

          @if (error()) { <p class="text-xs text-red-600"><i class="pi pi-exclamation-circle mr-1"></i>{{ error() }}</p> }
          <button class="w-full bg-green-600 text-white font-semibold rounded-lg py-3.5 hover:bg-green-700 disabled:opacity-50"
            [disabled]="saving() || uploading()" (click)="submit()">
            {{ saving() ? 'Saving…' : 'Save Product' }}
          </button>
        </main>
      }
    </div>
  `,
})
export class ProductAddComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http: HttpClient;
  private readonly base = environment.apiUrl;

  token = signal('');
  whatsappPhone = '';
  categories = signal<Taxon[]>([]);
  brands = signal<Taxon[]>([]);
  saving = signal(false);
  uploading = signal(false);
  error = signal<string | null>(null);
  done = signal<{ name: string } | null>(null);

  form: any = {
    name: '', price: null, salePrice: null, stock: 0, lowStockThreshold: 5,
    sku: '', uom: 'pcs', barcode: '', categoryId: '', brandId: '', hsnCode: '', taxRate: null,
    status: 'active', shortDescription: '', tags: '', imageUrl: '', description: '',
  };

  readonly uomOptions = [
    { value: 'pcs', label: 'Piece (pcs)' }, { value: 'unit', label: 'Unit' },
    { value: 'kg', label: 'Kilogram (kg)' }, { value: 'g', label: 'Gram (g)' },
    { value: 'l', label: 'Litre (L)' }, { value: 'ml', label: 'Millilitre (ml)' },
    { value: 'm', label: 'Metre (m)' }, { value: 'cm', label: 'Centimetre (cm)' },
    { value: 'box', label: 'Box' }, { value: 'pack', label: 'Pack' },
    { value: 'dozen', label: 'Dozen' }, { value: 'pair', label: 'Pair' },
    { value: 'set', label: 'Set' }, { value: 'bottle', label: 'Bottle' },
    { value: 'bag', label: 'Bag' }, { value: 'carton', label: 'Carton' },
    { value: 'sqft', label: 'Sq. ft' }, { value: 'sqm', label: 'Sq. m' },
  ];

  canSubmit = computed(() => true);

  constructor() {
    this.http = new HttpClient(inject(HttpBackend));
  }

  ngOnInit(): void {
    const t = this.route.snapshot.queryParamMap.get('token') || '';
    this.token.set(t);
    if (!t) return;
    this.http.get<{ categories: Taxon[]; brands: Taxon[]; whatsappPhone?: string }>(`${this.base}/m/products/taxonomy?token=${t}`).subscribe({
      next: (r) => { this.categories.set(r.categories || []); this.brands.set(r.brands || []); this.whatsappPhone = r.whatsappPhone || ''; },
      error: () => {},
    });
  }

  backToChat(): void { returnToWhatsApp(this.whatsappPhone); }

  uploadImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.uploading.set(true);
    this.error.set(null);
    const fd = new FormData();
    fd.append('file', f);
    this.http.post<{ url: string }>(`${this.base}/m/products/upload-image?token=${this.token()}`, fd).subscribe({
      next: (r) => { this.uploading.set(false); this.form.imageUrl = r.url; input.value = ''; },
      error: (e) => { this.uploading.set(false); this.error.set(e?.error?.message || 'Image upload failed.'); },
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
    this.form = {
      name: '', price: null, salePrice: null, stock: 0, lowStockThreshold: 5,
      sku: '', uom: 'pcs', barcode: '', categoryId: '', brandId: '', hsnCode: '', taxRate: null,
      status: 'active', shortDescription: '', tags: '', imageUrl: '', description: '',
    };
    this.done.set(null);
    this.error.set(null);
  }
}
