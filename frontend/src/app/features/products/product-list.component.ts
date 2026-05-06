import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ProductService, ProductListParams } from '../../core/services/product.service';
import { Product, Category } from '../../core/models';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  status: 'active' | 'draft' | 'archived' | 'out_of_stock';
  imageUrl: string;
}

@Component({
  selector: 'wa-product-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TableModule,
    ButtonModule,
    TagModule,
    InputTextModule,
    SelectModule,
    ConfirmDialogModule,
    ToastModule,
    FormsModule,
    IconFieldModule,
    InputIconModule,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <div class="p-6 space-y-5">
      <p-toast />
      <p-confirmDialog />

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Products</h1>
          <p class="text-gray-500 text-sm">Manage your product catalog</p>
        </div>
        <button pButton label="Add Product" icon="pi pi-plus" severity="success" routerLink="new"></button>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-3 items-center">
        <p-iconfield class="flex-1 min-w-48">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText [(ngModel)]="searchQuery" placeholder="Search products..." class="w-full" (input)="onSearchInput()" />
        </p-iconfield>
        <p-select
          [(ngModel)]="selectedStatus"
          [options]="statusOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="All statuses"
          styleClass="min-w-36"
          (onChange)="onFilterChange()"
        />
        <p-select
          [(ngModel)]="selectedCategory"
          [options]="categoryOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="All categories"
          styleClass="min-w-40"
          (onChange)="onFilterChange()"
        />
        <button pButton label="Reset" icon="pi pi-filter-slash" class="p-button-outlined p-button-sm" (click)="resetFilters()"></button>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <p-table
          [value]="products()"
          [paginator]="true"
          [rows]="rows"
          [rowsPerPageOptions]="[10, 25, 50]"
          [totalRecords]="totalRecords()"
          [lazy]="true"
          (onLazyLoad)="onLazyLoad($event)"
          [loading]="loading()"
          dataKey="id"
          styleClass="text-sm"
          [(selection)]="selectedProducts"
        >
          <ng-template pTemplate="header">
            <tr>
              <th style="width:3rem"><p-tableHeaderCheckbox /></th>
              <th pSortableColumn="name" class="text-xs text-gray-500 font-medium">
                Product <p-sortIcon field="name" />
              </th>
              <th class="text-xs text-gray-500 font-medium">Category</th>
              <th pSortableColumn="price" class="text-xs text-gray-500 font-medium">
                Price <p-sortIcon field="price" />
              </th>
              <th pSortableColumn="stock" class="text-xs text-gray-500 font-medium">
                Stock <p-sortIcon field="stock" />
              </th>
              <th class="text-xs text-gray-500 font-medium">Status</th>
              <th class="text-xs text-gray-500 font-medium">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-product>
            <tr class="hover:bg-gray-50">
              <td><p-tableCheckbox [value]="product" /></td>
              <td>
                <div class="flex items-center gap-3">
                  <img [src]="product.imageUrl" [alt]="product.name"
                    class="w-10 h-10 rounded-lg object-cover border border-gray-100"
                    (error)="onImgError($event)"
                  />
                  <div>
                    <p class="font-medium text-gray-900">{{ product.name }}</p>
                    <p class="text-xs text-gray-400">{{ product.sku }}</p>
                  </div>
                </div>
              </td>
              <td class="text-gray-600 text-sm">{{ product.category }}</td>
              <td class="font-semibold text-gray-900">\u20B9{{ product.price | number }}</td>
              <td>
                <span
                  class="font-medium text-sm"
                  [class.text-red-600]="product.stock <= 5"
                  [class.text-orange-500]="product.stock > 5 && product.stock <= 15"
                  [class.text-gray-900]="product.stock > 15"
                >{{ product.stock }}</span>
              </td>
              <td>
                <p-tag
                  [value]="product.status.replace('_', ' ')"
                  [severity]="getStatusSeverity(product.status)"
                  styleClass="text-xs capitalize"
                />
              </td>
              <td>
                <div class="flex gap-1">
                  <button
                    pButton
                    icon="pi pi-pencil"
                    class="p-button-text p-button-sm p-button-rounded"
                    pTooltip="Edit"
                    [routerLink]="[product.id, 'edit']"
                  ></button>
                  <button
                    pButton
                    icon="pi pi-trash"
                    class="p-button-text p-button-sm p-button-rounded p-button-danger"
                    pTooltip="Delete"
                    (click)="confirmDelete(product)"
                  ></button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="7" class="text-center py-12 text-gray-400">
                <i class="pi pi-box" style="font-size:2.5rem"></i>
                <p class="mt-3 text-base font-medium">No products found</p>
                <p class="text-sm mt-1">Try adjusting your filters or add a new product</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>
  `,
})
export class ProductListComponent implements OnInit {
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly productService = inject(ProductService);

  loading = signal(true);
  products = signal<ProductRow[]>([]);
  totalRecords = signal(0);
  selectedProducts: ProductRow[] = [];
  searchQuery = '';
  selectedStatus = '';
  selectedCategory = '';
  rows = 10;
  currentPage = 1;
  currentSortField = '';
  currentSortOrder: 'asc' | 'desc' = 'asc';

  private searchSubject = new Subject<string>();

  statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Active', value: 'active' },
    { label: 'Draft', value: 'draft' },
    { label: 'Out of Stock', value: 'out_of_stock' },
    { label: 'Archived', value: 'archived' },
  ];

  categoryOptions: { label: string; value: string }[] = [
    { label: 'All Categories', value: '' },
  ];

  ngOnInit() {
    this.loadCategories();
    this.loadProducts();

    this.searchSubject
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => {
        this.currentPage = 1;
        this.loadProducts();
      });
  }

  onSearchInput() {
    this.searchSubject.next(this.searchQuery);
  }

  onFilterChange() {
    this.currentPage = 1;
    this.loadProducts();
  }

  onLazyLoad(event: TableLazyLoadEvent) {
    const first = event.first ?? 0;
    const rows = event.rows ?? this.rows;
    this.rows = rows;
    this.currentPage = Math.floor(first / rows) + 1;

    if (event.sortField) {
      this.currentSortField = event.sortField as string;
      this.currentSortOrder = event.sortOrder === 1 ? 'asc' : 'desc';
    }

    this.loadProducts();
  }

  resetFilters() {
    this.searchQuery = '';
    this.selectedStatus = '';
    this.selectedCategory = '';
    this.currentPage = 1;
    this.loadProducts();
  }

  getStatusSeverity(status: string): any {
    const map: Record<string, any> = {
      active: 'success',
      draft: 'warn',
      out_of_stock: 'danger',
      archived: 'secondary',
    };
    return map[status] ?? 'info';
  }

  confirmDelete(product: ProductRow) {
    this.confirmationService.confirm({
      message: `Delete "${product.name}"? This action cannot be undone.`,
      header: 'Confirm Delete',
      icon: 'pi pi-trash',

      accept: () => {
        this.productService.delete(product.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Deleted', detail: `${product.name} removed` });
            this.loadProducts();
          },
          error: (err) => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete product' });
          },
        });
      },
    });
  }

  onImgError(event: Event) {
    (event.target as HTMLImageElement).src = 'https://via.placeholder.com/40';
  }

  private loadProducts() {
    this.loading.set(true);

    const params: ProductListParams = {
      page: this.currentPage,
      limit: this.rows,
    };

    if (this.searchQuery.trim()) {
      params.search = this.searchQuery.trim();
    }
    if (this.selectedStatus) {
      params.status = this.selectedStatus;
    }
    if (this.selectedCategory) {
      params.categoryId = this.selectedCategory;
    }
    if (this.currentSortField) {
      params.sortBy = this.currentSortField;
      params.sortOrder = this.currentSortOrder;
    }

    this.productService.getAll(params).subscribe({
      next: (response) => {
        const rows = response.data.map((p) => this.mapProductToRow(p));
        this.products.set(rows);
        this.totalRecords.set(response.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load products' });
        this.loading.set(false);
      },
    });
  }

  private loadCategories() {
    this.productService.getCategories().subscribe({
      next: (categories) => {
        this.categoryOptions = [
          { label: 'All Categories', value: '' },
          ...categories.map((c) => ({ label: c.name, value: c.id })),
        ];
      },
      error: () => {
        // Keep default "All Categories" option on failure
      },
    });
  }

  private mapProductToRow(product: Product): ProductRow {
    const imageUrl =
      (product.imageUrls && product.imageUrls.length > 0
        ? product.imageUrls[0]
        : null) ?? 'https://via.placeholder.com/40';

    return {
      id: product.id,
      name: product.name,
      sku: product.sku ?? '',
      category: product.category?.name ?? '',
      price: product.price,
      stock: product.stockQuantity,
      status: product.status,
      imageUrl,
    };
  }
}
