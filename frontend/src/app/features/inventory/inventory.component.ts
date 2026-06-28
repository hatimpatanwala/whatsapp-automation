import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ToastModule } from 'primeng/toast';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { exportToCsv } from '../../core/utils/csv-export';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../core/services/inventory.service';
import { InventoryItem, InventoryMovementType } from '../../core/models';

@Component({
  selector: 'wa-inventory',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    TagModule,
    DialogModule,
    InputNumberModule,
    SelectModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    ToastModule,
    TextareaModule,
    FormsModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 space-y-5">
      <p-toast />

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Inventory</h1>
          <p class="text-gray-500 text-sm">Monitor and manage stock levels</p>
        </div>
        <div class="flex gap-2">
          <button pButton label="Export" icon="pi pi-download" class="p-button-outlined p-button-sm" [disabled]="!filteredItems().length" (click)="exportCsv()"></button>
          <button pButton label="Stock Movement" icon="pi pi-list" class="p-button-sm" severity="secondary"></button>
        </div>
      </div>

      <!-- Summary cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3.5 hover:shadow-md transition-shadow">
          <div class="flex items-center justify-center w-11 h-11 rounded-xl shrink-0 bg-slate-100 text-slate-600"><i class="pi pi-box" style="font-size:1.1rem"></i></div>
          <div class="min-w-0"><p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ items().length }}</p><p class="text-xs text-gray-500 mt-1 truncate">Total SKUs</p></div>
        </div>
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3.5 hover:shadow-md transition-shadow">
          <div class="flex items-center justify-center w-11 h-11 rounded-xl shrink-0 bg-red-50 text-red-600"><i class="pi pi-exclamation-triangle" style="font-size:1.1rem"></i></div>
          <div class="min-w-0"><p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ lowStockCount() }}</p><p class="text-xs text-gray-500 mt-1 truncate">Low Stock</p></div>
        </div>
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3.5 hover:shadow-md transition-shadow">
          <div class="flex items-center justify-center w-11 h-11 rounded-xl shrink-0 bg-amber-50 text-amber-600"><i class="pi pi-ban" style="font-size:1.1rem"></i></div>
          <div class="min-w-0"><p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ outOfStockCount() }}</p><p class="text-xs text-gray-500 mt-1 truncate">Out of Stock</p></div>
        </div>
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3.5 hover:shadow-md transition-shadow">
          <div class="flex items-center justify-center w-11 h-11 rounded-xl shrink-0 bg-primary-50 text-primary-600"><i class="pi pi-database" style="font-size:1.1rem"></i></div>
          <div class="min-w-0"><p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ totalUnits() }}</p><p class="text-xs text-gray-500 mt-1 truncate">Total Units</p></div>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-3">
        <p-iconfield class="flex-1 min-w-48">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText [(ngModel)]="searchQuery" placeholder="Search products..." class="w-full" (input)="filter()" />
        </p-iconfield>
        <p-select [(ngModel)]="stockFilter" [options]="stockFilterOptions" optionLabel="label" optionValue="value"
          placeholder="All stock levels" styleClass="min-w-40" (onChange)="filter()" />
        <button pButton label="Low Stock Only" icon="pi pi-exclamation-triangle"
          [class]="showLowStockOnly() ? '' : 'p-button-outlined'"
          [severity]="showLowStockOnly() ? 'danger' : undefined"
          class="p-button-sm"
          (click)="toggleLowStockFilter()">
        </button>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <p-table [value]="filteredItems()" [loading]="loading()" dataKey="id" styleClass="text-sm"
          [paginator]="filteredItems().length > 10" [rows]="10" [rowsPerPageOptions]="[10, 25, 50]"
          [showCurrentPageReport]="true" currentPageReportTemplate="Showing {first}–{last} of {totalRecords}">
          <ng-template pTemplate="header">
            <tr>
              <th pSortableColumn="product.name" class="text-xs text-gray-500 font-medium">Product <p-sortIcon field="product.name" /></th>
              <th pSortableColumn="currentStock" class="text-xs text-gray-500 font-medium">Current Stock <p-sortIcon field="currentStock" /></th>
              <th pSortableColumn="reservedStock" class="text-xs text-gray-500 font-medium">Reserved <p-sortIcon field="reservedStock" /></th>
              <th pSortableColumn="availableStock" class="text-xs text-gray-500 font-medium">Available <p-sortIcon field="availableStock" /></th>
              <th pSortableColumn="lowStockThreshold" class="text-xs text-gray-500 font-medium">Threshold <p-sortIcon field="lowStockThreshold" /></th>
              <th class="text-xs text-gray-500 font-medium">Status</th>
              <th pSortableColumn="warehouseLocation" class="text-xs text-gray-500 font-medium">Location <p-sortIcon field="warehouseLocation" /></th>
              <th class="text-xs text-gray-500 font-medium">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-item>
            <tr
              class="hover:bg-gray-50"
              [class.bg-red-50]="item.isLowStock"
            >
              <td>
                <div>
                  <p class="font-medium text-gray-900">{{ item.product?.name || 'Unknown Product' }}</p>
                  <p class="text-xs text-gray-400">{{ item.product?.sku || item.variantName || item.id }}</p>
                </div>
              </td>
              <td>
                <span class="font-semibold"
                  [class.text-red-600]="item.currentStock === 0"
                  [class.text-orange-500]="item.currentStock > 0 && item.isLowStock"
                  [class.text-gray-900]="!item.isLowStock"
                >{{ item.currentStock }}</span>
              </td>
              <td class="text-gray-600">{{ item.reservedStock }}</td>
              <td>
                <span class="font-medium"
                  [class.text-green-600]="item.availableStock > item.lowStockThreshold"
                  [class.text-orange-500]="item.availableStock > 0 && item.availableStock <= item.lowStockThreshold"
                  [class.text-red-600]="item.availableStock === 0"
                >{{ item.availableStock }}</span>
              </td>
              <td class="text-gray-500">{{ item.lowStockThreshold }}</td>
              <td>
                @if (item.currentStock === 0) {
                  <p-tag value="Out of Stock" severity="danger" styleClass="text-xs" />
                } @else if (item.isLowStock) {
                  <p-tag value="Low Stock" severity="warn" styleClass="text-xs" />
                } @else {
                  <p-tag value="In Stock" severity="success" styleClass="text-xs" />
                }
              </td>
              <td class="text-gray-500 text-xs">{{ item.warehouseLocation || '-' }}</td>
              <td>
                <button
                  pButton
                  icon="pi pi-sliders-h"
                  class="p-button-text p-button-sm p-button-rounded"
                  pTooltip="Adjust Stock"
                  (click)="openAdjustDialog(item)"
                ></button>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>

      <!-- Adjust stock dialog -->
      <p-dialog [(visible)]="adjustDialog" [header]="'Adjust Stock: ' + (selectedItem()?.product?.name || 'Item')" [modal]="true" [style]="{width:'420px'}">
        @if (selectedItem()) {
          <div class="space-y-4 py-2">
            <div class="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
              <div>
                <p class="text-xs text-gray-500">Current Stock</p>
                <p class="text-xl font-bold text-gray-900">{{ selectedItem()!.currentStock }}</p>
              </div>
              <i class="pi pi-arrow-right text-gray-300" style="font-size:1.5rem"></i>
              <div>
                <p class="text-xs text-gray-500">New Stock</p>
                <p class="text-xl font-bold text-primary-600">{{ newStockPreview() }}</p>
              </div>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Adjustment Type</label>
              <p-select [(ngModel)]="adjustType" [options]="adjustTypeOptions" optionLabel="label" optionValue="value" styleClass="w-full" />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Quantity</label>
              <p-inputnumber [(ngModel)]="adjustQty" [min]="0" styleClass="w-full" inputStyleClass="w-full" (onInput)="calcPreview()" />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Reason / Notes</label>
              <textarea pTextarea [(ngModel)]="adjustReason" rows="2" class="w-full" placeholder="e.g. Received new shipment, stock count correction..."></textarea>
            </div>
          </div>
        }
        <ng-template pTemplate="footer">
          <button pButton label="Cancel" class="p-button-outlined" (click)="adjustDialog = false"></button>
          <button pButton label="Apply Adjustment" severity="success" [loading]="adjusting()" (click)="applyAdjustment()"></button>
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class InventoryComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly inventoryService = inject(InventoryService);

  loading = signal(true);
  adjusting = signal(false);
  adjustDialog = false;
  selectedItem = signal<InventoryItem | null>(null);
  searchQuery = '';
  stockFilter = '';
  showLowStockOnly = signal(false);
  adjustType = 'add';
  adjustQty = 0;
  adjustReason = '';
  newStockPreview = signal(0);

  items = signal<InventoryItem[]>([]);
  filteredItems = signal<InventoryItem[]>([]);

  lowStockCount = () => this.items().filter(i => i.isLowStock && i.currentStock > 0).length;
  outOfStockCount = () => this.items().filter(i => i.currentStock === 0).length;
  totalUnits = () => this.items().reduce((sum, i) => sum + i.currentStock, 0);

  adjustTypeOptions = [
    { label: 'Add Stock (Received shipment)', value: 'add' },
    { label: 'Remove Stock (Sold / Used)', value: 'remove' },
    { label: 'Set Exact Quantity', value: 'set' },
    { label: 'Write Off (Damaged / Lost)', value: 'writeoff' },
  ];

  stockFilterOptions = [
    { label: 'All Stock Levels', value: '' },
    { label: 'In Stock', value: 'instock' },
    { label: 'Low Stock', value: 'low' },
    { label: 'Out of Stock', value: 'out' },
  ];

  ngOnInit() {
    this.loadInventory();
  }

  exportCsv() {
    const rows = this.filteredItems().map((i) => ({
      product: i.product?.name || 'Unknown Product',
      sku: i.product?.sku || i.variantName || i.id,
      currentStock: i.currentStock,
      reserved: i.reservedStock,
      available: i.availableStock,
      threshold: i.lowStockThreshold,
      status: i.currentStock === 0 ? 'Out of stock' : i.isLowStock ? 'Low stock' : 'In stock',
      location: i.warehouseLocation || '',
    }));
    const ok = exportToCsv('inventory', rows, [
      { key: 'product', header: 'Product' },
      { key: 'sku', header: 'SKU' },
      { key: 'currentStock', header: 'Current Stock' },
      { key: 'reserved', header: 'Reserved' },
      { key: 'available', header: 'Available' },
      { key: 'threshold', header: 'Threshold' },
      { key: 'status', header: 'Status' },
      { key: 'location', header: 'Location' },
    ]);
    this.messageService.add(
      ok
        ? { severity: 'success', summary: 'Exported', detail: `${rows.length} items exported to CSV.` }
        : { severity: 'info', summary: 'Nothing to export', detail: 'No inventory items to export.' },
    );
  }

  private loadInventory() {
    this.loading.set(true);
    this.inventoryService.getAll().subscribe({
      next: (response) => {
        const items = response.data.map(item => ({
          ...item,
          availableStock: item.currentStock - item.reservedStock,
          isLowStock: (item.currentStock - item.reservedStock) <= item.lowStockThreshold,
        }));
        this.items.set(items);
        this.applyFilter();
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load inventory. Please try again.',
        });
      },
    });
  }

  filter() {
    this.applyFilter();
  }

  private applyFilter() {
    let result = [...this.items()];
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(i =>
        (i.product?.name || '').toLowerCase().includes(q) ||
        (i.product?.sku || '').toLowerCase().includes(q) ||
        (i.variantName || '').toLowerCase().includes(q)
      );
    }
    if (this.showLowStockOnly()) {
      result = result.filter(i => i.isLowStock);
    }
    if (this.stockFilter === 'low') result = result.filter(i => i.isLowStock && i.currentStock > 0);
    else if (this.stockFilter === 'out') result = result.filter(i => i.currentStock === 0);
    else if (this.stockFilter === 'instock') result = result.filter(i => !i.isLowStock);
    this.filteredItems.set(result);
  }

  toggleLowStockFilter() {
    this.showLowStockOnly.update(v => !v);
    this.filter();
  }

  openAdjustDialog(item: InventoryItem) {
    this.selectedItem.set(item);
    this.adjustType = 'add';
    this.adjustQty = 0;
    this.adjustReason = '';
    this.newStockPreview.set(item.currentStock);
    this.adjustDialog = true;
  }

  calcPreview() {
    const item = this.selectedItem();
    if (!item) return;
    let preview = item.currentStock;
    if (this.adjustType === 'add') preview += this.adjustQty;
    else if (this.adjustType === 'remove' || this.adjustType === 'writeoff') preview -= this.adjustQty;
    else if (this.adjustType === 'set') preview = this.adjustQty;
    this.newStockPreview.set(Math.max(0, preview));
  }

  applyAdjustment() {
    const item = this.selectedItem();
    if (!item) return;

    this.adjusting.set(true);

    if (this.adjustType === 'set') {
      this.inventoryService.setStock(item.id, {
        quantity: this.adjustQty,
        notes: this.adjustReason || undefined,
      }).subscribe({
        next: () => {
          this.adjustDialog = false;
          this.adjusting.set(false);
          this.messageService.add({
            severity: 'success',
            summary: 'Stock Updated',
            detail: `${item.product?.name || 'Item'} stock set to ${this.adjustQty}`,
          });
          this.loadInventory();
        },
        error: () => {
          this.adjusting.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to adjust stock. Please try again.',
          });
        },
      });
    } else {
      const typeMap: Record<string, InventoryMovementType> = {
        add: 'purchase',
        remove: 'sale',
        writeoff: 'write_off',
      };
      const quantity = this.adjustType === 'add' ? this.adjustQty : -this.adjustQty;

      this.inventoryService.adjustStock(item.id, {
        type: typeMap[this.adjustType] || 'adjustment',
        quantity,
        notes: this.adjustReason || undefined,
      }).subscribe({
        next: () => {
          this.adjustDialog = false;
          this.adjusting.set(false);
          this.messageService.add({
            severity: 'success',
            summary: 'Stock Updated',
            detail: `${item.product?.name || 'Item'} stock adjusted to ${this.newStockPreview()}`,
          });
          this.loadInventory();
        },
        error: () => {
          this.adjusting.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to adjust stock. Please try again.',
          });
        },
      });
    }
  }
}
