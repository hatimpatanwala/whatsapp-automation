import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/services/api.service';

interface Taxon { id: string; name: string; }

/**
 * Manage product Categories and Brands — create your own, list, and remove.
 * Mirrors what the WhatsApp admin bot can do (Products → Categories / Brands).
 */
@Component({
  selector: 'wa-catalog-taxonomy',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastModule],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-5xl mx-auto">
      <p-toast />
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900">Categories & Brands</h1>
        <p class="text-gray-500 text-sm mt-1">Create and manage your own product categories and brands. You can also do this from WhatsApp (Products → Categories / Brands).</p>
      </div>

      <div class="grid gap-6 md:grid-cols-2">
        <!-- Categories -->
        <section class="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 class="text-base font-semibold text-gray-900 mb-3"><i class="pi pi-tag mr-2 text-green-600"></i>Categories</h2>
          <div class="flex gap-2 mb-4">
            <input [(ngModel)]="newCategory" (keyup.enter)="addCategory()" placeholder="New category name"
              class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button class="bg-green-600 text-white text-sm font-semibold rounded-lg px-4 hover:bg-green-700 disabled:opacity-50"
              [disabled]="!newCategory.trim() || savingCat()" (click)="addCategory()">Add</button>
          </div>
          @if (categories().length) {
            <ul class="divide-y divide-gray-100 max-h-[26rem] overflow-y-auto -mr-2 pr-2">
              @for (c of categories(); track c.id) {
                <li class="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <span class="text-sm text-gray-700">{{ c.name }}</span>
                  <button class="text-gray-300 hover:text-red-500 transition-colors" (click)="remove('categories', c)"><i class="pi pi-trash"></i></button>
                </li>
              }
            </ul>
          } @else { <p class="text-xs text-gray-400 py-2">No categories yet.</p> }
        </section>

        <!-- Brands -->
        <section class="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 class="text-base font-semibold text-gray-900 mb-3"><i class="pi pi-bookmark mr-2 text-blue-600"></i>Brands</h2>
          <div class="flex gap-2 mb-4">
            <input [(ngModel)]="newBrand" (keyup.enter)="addBrand()" placeholder="New brand name"
              class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button class="bg-green-600 text-white text-sm font-semibold rounded-lg px-4 hover:bg-green-700 disabled:opacity-50"
              [disabled]="!newBrand.trim() || savingBrand()" (click)="addBrand()">Add</button>
          </div>
          @if (brands().length) {
            <ul class="divide-y divide-gray-100 max-h-[26rem] overflow-y-auto -mr-2 pr-2">
              @for (b of brands(); track b.id) {
                <li class="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <span class="text-sm text-gray-700">{{ b.name }}</span>
                  <button class="text-gray-300 hover:text-red-500 transition-colors" (click)="remove('brands', b)"><i class="pi pi-trash"></i></button>
                </li>
              }
            </ul>
          } @else { <p class="text-xs text-gray-400 py-2">No brands yet.</p> }
        </section>
      </div>
    </div>
  `,
})
export class CatalogTaxonomyComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  categories = signal<Taxon[]>([]);
  brands = signal<Taxon[]>([]);
  newCategory = '';
  newBrand = '';
  savingCat = signal(false);
  savingBrand = signal(false);

  ngOnInit(): void {
    this.load('categories');
    this.load('brands');
  }

  private load(kind: 'categories' | 'brands'): void {
    this.api.get<Taxon[]>(`/${kind}`).subscribe({
      next: (r) => (kind === 'categories' ? this.categories : this.brands).set(r || []),
      error: () => {},
    });
  }

  addCategory(): void {
    const name = this.newCategory.trim();
    if (!name) return;
    this.savingCat.set(true);
    this.api.post('/categories', { name }).subscribe({
      next: () => { this.savingCat.set(false); this.newCategory = ''; this.load('categories'); },
      error: () => { this.savingCat.set(false); this.toast.add({ severity: 'error', summary: 'Could not add category' }); },
    });
  }

  addBrand(): void {
    const name = this.newBrand.trim();
    if (!name) return;
    this.savingBrand.set(true);
    this.api.post('/brands', { name }).subscribe({
      next: () => { this.savingBrand.set(false); this.newBrand = ''; this.load('brands'); },
      error: () => { this.savingBrand.set(false); this.toast.add({ severity: 'error', summary: 'Could not add brand' }); },
    });
  }

  remove(kind: 'categories' | 'brands', t: Taxon): void {
    this.api.delete(`/${kind}/${t.id}`).subscribe({
      next: () => this.load(kind),
      error: () => this.toast.add({ severity: 'error', summary: 'Could not remove' }),
    });
  }
}
