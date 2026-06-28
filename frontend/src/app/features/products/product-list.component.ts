import { Component, OnInit, OnDestroy, signal, inject, ViewChild, ElementRef } from '@angular/core';
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
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';
import { ProductService, ProductListParams } from '../../core/services/product.service';
import { Product, Category } from '../../core/models';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: number;
  stock: number;
  status: 'active' | 'draft' | 'archived' | 'out_of_stock';
  imageUrl: string;
}

interface BulkUploadStatus {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  errors: { row: number; name: string; error: string }[];
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
    ProgressBarModule,
    TooltipModule,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <div class="p-6 space-y-5">
      <p-toast />
      <p-confirmDialog />
      <input #fileInput type="file" accept=".xlsx" class="hidden" (change)="onFileSelected($event)" />

      <!-- Bulk Upload Progress Banner -->
      @if (uploadStatus().status === 'processing') {
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm">
          <div class="flex items-center gap-3 mb-2">
            <i class="pi pi-spin pi-spinner text-blue-600" style="font-size:1.2rem"></i>
            <div class="flex-1">
              <p class="text-sm font-semibold text-blue-800">Bulk Upload in Progress</p>
              <p class="text-xs text-blue-600">{{ uploadStatus().processed }} of {{ uploadStatus().total }} products processed</p>
            </div>
            <span class="text-sm font-bold text-blue-700">{{ uploadProgress() }}%</span>
          </div>
          <p-progressBar [value]="uploadProgress()" [showValue]="false" styleClass="h-2" />
        </div>
      }

      @if (uploadStatus().status === 'completed') {
        <div class="bg-green-50 border border-green-200 rounded-xl p-4 shadow-sm">
          <div class="flex items-center gap-3">
            <i class="pi pi-check-circle text-green-600" style="font-size:1.3rem"></i>
            <div class="flex-1">
              <p class="text-sm font-semibold text-green-800">Bulk Upload Complete</p>
              <p class="text-xs text-green-600">
                {{ uploadStatus().succeeded }} succeeded, {{ uploadStatus().failed }} failed out of {{ uploadStatus().total }}
              </p>
            </div>
            @if (uploadStatus().errors.length > 0) {
              <button pButton label="View Errors" icon="pi pi-exclamation-triangle" class="p-button-outlined p-button-sm p-button-warning" (click)="showErrors = !showErrors"></button>
            }
            <button pButton icon="pi pi-times" class="p-button-text p-button-sm p-button-rounded" pTooltip="Dismiss" (click)="dismissUploadStatus()"></button>
          </div>
          @if (showErrors && uploadStatus().errors.length > 0) {
            <div class="mt-3 max-h-40 overflow-y-auto bg-white rounded-lg border border-red-100 p-3">
              @for (err of uploadStatus().errors; track err.row) {
                <div class="text-xs text-red-600 py-1 border-b border-red-50 last:border-0">
                  <span class="font-semibold">Row {{ err.row }}</span>
                  @if (err.name) { <span> ({{ err.name }})</span> }
                  <span>: {{ err.error }}</span>
                </div>
              }
            </div>
          }
        </div>
      }

      @if (uploadStatus().status === 'failed' && uploadStatus().processed === 0) {
        <div class="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
          <div class="flex items-center gap-3">
            <i class="pi pi-times-circle text-red-600" style="font-size:1.3rem"></i>
            <div class="flex-1">
              <p class="text-sm font-semibold text-red-800">Bulk Upload Failed</p>
              <p class="text-xs text-red-600">{{ uploadStatus().errors[0]?.error || 'An unexpected error occurred' }}</p>
            </div>
            <button pButton icon="pi pi-times" class="p-button-text p-button-sm p-button-rounded" pTooltip="Dismiss" (click)="dismissUploadStatus()"></button>
          </div>
        </div>
      }

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Products</h1>
          <p class="text-gray-500 text-sm">Manage your product catalog</p>
        </div>
        <div class="flex items-center gap-2">
          <button pButton label="Export Products" icon="pi pi-file-export" class="p-button-outlined p-button-sm" (click)="exportProducts()" [disabled]="isUploading()" [loading]="exporting()" pTooltip="Download all products to edit & re-upload"></button>
          <button pButton label="Template" icon="pi pi-download" class="p-button-outlined p-button-sm" (click)="downloadTemplate()" [disabled]="isUploading()"></button>
          <button pButton label="Upload / Update" icon="pi pi-upload" class="p-button-sm" severity="info" (click)="fileInput.click()" [disabled]="isUploading()" [loading]="uploadStarting()" pTooltip="Upload to add new or update existing products"></button>
          <button pButton label="Add Product" icon="pi pi-plus" severity="success" routerLink="new" [disabled]="isUploading()"></button>
        </div>
      </div>

      <!-- Upload Lock Overlay Message -->
      @if (isUploading()) {
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-sm flex items-center gap-2">
          <i class="pi pi-lock text-amber-600"></i>
          <span class="text-sm text-amber-700">Product actions are locked while bulk upload is in progress</span>
        </div>
      }

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
        <p-select
          [(ngModel)]="selectedBrand"
          [options]="brandOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="All brands"
          styleClass="min-w-40"
          (onChange)="onFilterChange()"
        />
        <button pButton label="Reset" icon="pi pi-filter-slash" class="p-button-outlined p-button-sm" (click)="resetFilters()"></button>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" [class.opacity-60]="isUploading()" [class.pointer-events-none]="isUploading()">
        <p-table
          [value]="products()"
          [scrollable]="true"
          scrollHeight="58vh"
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
              <th class="text-xs text-gray-500 font-medium">Product</th>
              <th class="text-xs text-gray-500 font-medium">Category</th>
              <th class="text-xs text-gray-500 font-medium">Brand</th>
              <th class="text-xs text-gray-500 font-medium">Price</th>
              <th class="text-xs text-gray-500 font-medium">Stock</th>
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
              <td class="text-gray-600 text-sm">{{ product.brand || '—' }}</td>
              <td class="font-semibold text-gray-900">₹{{ product.price | number }}</td>
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
                    [disabled]="isUploading()"
                  ></button>
                  <button
                    pButton
                    icon="pi pi-trash"
                    class="p-button-text p-button-sm p-button-rounded p-button-danger"
                    pTooltip="Delete"
                    (click)="confirmDelete(product)"
                    [disabled]="isUploading()"
                  ></button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="8" class="text-center py-12 text-gray-400">
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
export class ProductListComponent implements OnInit, OnDestroy {
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly productService = inject(ProductService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

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
  showErrors = false;

  uploadStatus = signal<BulkUploadStatus>({
    status: 'idle', total: 0, processed: 0, succeeded: 0, failed: 0, errors: [],
  });
  uploadStarting = signal(false);
  isUploading = signal(false);

  uploadProgress = signal(0);

  private searchSubject = new Subject<string>();
  private pollTimer: any = null;

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
  selectedBrand = '';
  brandOptions: { label: string; value: string }[] = [
    { label: 'All Brands', value: '' },
  ];

  ngOnInit() {
    this.loadCategories();
    this.loadBrands();
    this.loadProducts();
    this.checkUploadStatus();

    this.searchSubject
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => {
        this.currentPage = 1;
        this.loadProducts();
      });
  }

  ngOnDestroy() {
    this.stopPolling();
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
    this.selectedBrand = '';
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
    if (this.isUploading()) return;

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
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete product' });
          },
        });
      },
    });
  }

  onImgError(event: Event) {
    (event.target as HTMLImageElement).src = 'https://via.placeholder.com/40';
  }

  // ─── Bulk Upload ──────────────────────────────────────────────────────────

  downloadTemplate() {
    this.productService.downloadBulkTemplate().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'product-upload-template.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download template' });
      },
    });
  }

  exporting = signal(false);

  /** Download all products as an editable xlsx (re-upload to bulk-update). */
  exportProducts() {
    this.exporting.set(true);
    this.productService.exportProducts().subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'products-export.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.exporting.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to export products' });
      },
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx')) {
      this.messageService.add({ severity: 'warn', summary: 'Invalid File', detail: 'Please upload an .xlsx file' });
      input.value = '';
      return;
    }

    this.uploadStarting.set(true);
    this.productService.bulkUpload(file).subscribe({
      next: () => {
        this.uploadStarting.set(false);
        this.isUploading.set(true);
        this.messageService.add({ severity: 'info', summary: 'Upload Started', detail: 'Products are being uploaded in the background' });
        this.startPolling();
      },
      error: (err) => {
        this.uploadStarting.set(false);
        const msg = err.error?.message || 'Failed to start upload';
        this.messageService.add({ severity: 'error', summary: 'Upload Failed', detail: msg });
      },
    });

    input.value = '';
  }

  dismissUploadStatus() {
    this.productService.clearBulkUploadStatus().subscribe();
    this.uploadStatus.set({ status: 'idle', total: 0, processed: 0, succeeded: 0, failed: 0, errors: [] });
    this.showErrors = false;
    this.loadProducts();
  }

  private checkUploadStatus() {
    this.productService.getBulkUploadStatus().subscribe({
      next: (status) => {
        this.uploadStatus.set(status);
        this.updateProgress(status);
        if (status.status === 'processing') {
          this.isUploading.set(true);
          this.startPolling();
        }
      },
    });
  }

  private startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      this.productService.getBulkUploadStatus().subscribe({
        next: (status) => {
          this.uploadStatus.set(status);
          this.updateProgress(status);

          if (status.status === 'completed' || status.status === 'failed') {
            this.isUploading.set(false);
            this.stopPolling();
            this.loadProducts();

            if (status.status === 'completed') {
              this.messageService.add({
                severity: status.failed > 0 ? 'warn' : 'success',
                summary: 'Upload Complete',
                detail: `${status.succeeded} products added${status.failed > 0 ? `, ${status.failed} failed` : ''}`,
              });
            }
          }
        },
      });
    }, 2000);
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private updateProgress(status: BulkUploadStatus) {
    this.uploadProgress.set(
      status.total > 0 ? Math.round((status.processed / status.total) * 100) : 0,
    );
  }

  // ─── Data Loading ─────────────────────────────────────────────────────────

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
    if (this.selectedBrand) {
      params.brandId = this.selectedBrand;
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
      error: () => {
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
    });
  }

  private loadBrands() {
    this.productService.getBrands().subscribe({
      next: (brands) => {
        this.brandOptions = [
          { label: 'All Brands', value: '' },
          ...(brands || []).map((b) => ({ label: b.name, value: b.id })),
        ];
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
      brand: (product as any).brand?.name ?? '',
      price: product.price,
      stock: product.stockQuantity,
      status: product.status,
      imageUrl,
    };
  }
}
