import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'wa-erp-stock', standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ButtonModule, TableModule, SelectModule, InputNumberModule, DialogModule, ToastModule, TooltipModule],
  providers: [MessageService],
  template: `
    <div class="p-4 max-w-7xl mx-auto">
      <p-toast />
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Stock by Warehouse</h2>
          <p class="text-sm text-gray-500 mt-1">Multi-warehouse inventory — adjust levels and transfer between locations</p>
        </div>
        <a routerLink="/erp/warehouses" pButton class="p-button-outlined p-button-sm" label="Manage Warehouses"></a>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center gap-3">
        <label class="text-sm font-semibold text-gray-600">Warehouse</label>
        <p-select [options]="warehouses()" [(ngModel)]="warehouseId" optionLabel="name" optionValue="id" (onChange)="loadStock()" styleClass="w-64" placeholder="Select a warehouse" />
      </div>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p-table [value]="rows()" [scrollable]="true" scrollHeight="58vh" [rows]="20" [paginator]="true" [loading]="loading()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header"><tr><th>Product</th><th>SKU</th><th class="text-right">Quantity</th><th class="text-right">Actions</th></tr></ng-template>
          <ng-template pTemplate="body" let-row>
            <tr>
              <td class="font-medium">{{ row.name }}</td>
              <td class="text-gray-400 text-sm">{{ row.sku || '-' }}</td>
              <td class="text-right tabular-nums font-semibold">{{ row.quantity }}</td>
              <td class="text-right">
                <button pButton icon="pi pi-pencil" class="p-button-text p-button-sm" pTooltip="Adjust" (click)="openAdjust(row)"></button>
                <button pButton icon="pi pi-arrow-right-arrow-left" class="p-button-text p-button-sm p-button-info" pTooltip="Transfer" (click)="openTransfer(row)"></button>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="4" class="text-center py-10 text-gray-400">
            <i class="pi pi-box text-4xl mb-3 block"></i><p>{{ warehouseId ? 'No products' : 'Select a warehouse' }}</p>
          </td></tr></ng-template>
        </p-table>
      </div>

      <p-dialog header="Adjust Stock" [(visible)]="showAdjust" [modal]="true" [style]="{ width: '380px' }" [draggable]="false">
        @if (active(); as r) {
          <p class="text-sm mb-3">{{ r.name }} — current <b>{{ r.quantity }}</b></p>
          <label class="block text-xs font-semibold text-gray-500 mb-1">Set quantity to</label>
          <p-inputNumber [(ngModel)]="adjustQty" [min]="0" inputStyleClass="w-full" />
        }
        <ng-template pTemplate="footer">
          <p-button label="Cancel" [text]="true" (onClick)="showAdjust.set(false)" />
          <p-button label="Save" icon="pi pi-check" [loading]="saving()" (onClick)="submitAdjust()" />
        </ng-template>
      </p-dialog>

      <p-dialog header="Transfer Stock" [(visible)]="showTransfer" [modal]="true" [style]="{ width: '420px' }" [draggable]="false">
        @if (active(); as r) {
          <div class="flex flex-col gap-3">
            <p class="text-sm">{{ r.name }} — available here <b>{{ r.quantity }}</b></p>
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">To warehouse</label>
              <p-select [options]="otherWarehouses()" [(ngModel)]="transferTo" optionLabel="name" optionValue="id" styleClass="w-full" placeholder="Destination" /></div>
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">Quantity</label>
              <p-inputNumber [(ngModel)]="transferQty" [min]="1" [max]="r.quantity" inputStyleClass="w-full" /></div>
          </div>
        }
        <ng-template pTemplate="footer">
          <p-button label="Cancel" [text]="true" (onClick)="showTransfer.set(false)" />
          <p-button label="Transfer" icon="pi pi-check" [loading]="saving()" (onClick)="submitTransfer()" />
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class ErpStockComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  warehouses = signal<any[]>([]);
  rows = signal<any[]>([]);
  warehouseId: string | null = null;
  loading = signal(false);
  saving = signal(false);
  showAdjust = signal(false);
  showTransfer = signal(false);
  active = signal<any>(null);
  adjustQty = 0;
  transferTo: string | null = null;
  transferQty = 1;

  ngOnInit() {
    this.api.get<any>('/erp/warehouses', { limit: 200 }).subscribe({
      next: (res) => {
        const w = res?.data ?? [];
        this.warehouses.set(w);
        const def = w.find((x: any) => x.isDefault) || w[0];
        if (def) { this.warehouseId = def.id; this.loadStock(); }
      },
    });
  }

  otherWarehouses() { return this.warehouses().filter((w) => w.id !== this.warehouseId); }

  loadStock() {
    if (!this.warehouseId) return;
    this.loading.set(true);
    this.api.get<any>('/erp/stock', { warehouseId: this.warehouseId }).subscribe({
      next: (res) => { this.rows.set(res?.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openAdjust(r: any) { this.active.set(r); this.adjustQty = Number(r.quantity) || 0; this.showAdjust.set(true); }
  submitAdjust() {
    const r = this.active();
    this.saving.set(true);
    this.api.post('/erp/stock/adjust', { warehouseId: this.warehouseId, productId: r.productId, quantity: this.adjustQty, mode: 'set' }).subscribe({
      next: () => { this.saving.set(false); this.showAdjust.set(false); this.toast.add({ severity: 'success', summary: 'Stock updated' }); this.loadStock(); },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Failed', detail: e?.error?.error?.message || 'Error' }); },
    });
  }

  openTransfer(r: any) { this.active.set(r); this.transferTo = this.otherWarehouses()[0]?.id ?? null; this.transferQty = 1; this.showTransfer.set(true); }
  submitTransfer() {
    const r = this.active();
    if (!this.transferTo) { this.toast.add({ severity: 'warn', summary: 'Pick a destination' }); return; }
    this.saving.set(true);
    this.api.post('/erp/stock/transfer', { fromWarehouseId: this.warehouseId, toWarehouseId: this.transferTo, productId: r.productId, quantity: this.transferQty }).subscribe({
      next: () => { this.saving.set(false); this.showTransfer.set(false); this.toast.add({ severity: 'success', summary: 'Transferred' }); this.loadStock(); },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Failed', detail: e?.error?.error?.message || 'Error' }); },
    });
  }
}
