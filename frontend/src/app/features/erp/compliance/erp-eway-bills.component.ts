import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../../core/services/api.service';
import { ErpCurrencyService } from '../../../core/services/erp-currency.service';

@Component({
  selector: 'wa-erp-eway-bills', standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, TagModule, SelectModule, InputTextModule, InputNumberModule, DialogModule, ToastModule, TooltipModule],
  providers: [MessageService],
  template: `
    <div class="p-4 max-w-7xl mx-auto">
      <p-toast />
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">E-Way Bills</h2>
          <p class="text-sm text-gray-500 mt-1">Goods transport documents — generated locally with validity (1 day / 200 km)</p>
        </div>
        <p-button label="Generate E-Way Bill" icon="pi pi-plus" (onClick)="openCreate()" />
      </div>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p-table [value]="rows()" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="true" [rows]="15">
          <ng-template pTemplate="header"><tr><th>EWB No.</th><th>Invoice</th><th>Vehicle</th><th>Route</th><th class="text-right">Value</th><th>Valid Until</th><th>Status</th><th class="text-right">Actions</th></tr></ng-template>
          <ng-template pTemplate="body" let-row>
            <tr>
              <td class="font-mono font-semibold text-primary-600">{{ row.ewayNumber }}</td>
              <td>{{ row.invoiceNumber || '—' }}</td>
              <td>{{ row.vehicleNumber || '—' }}</td>
              <td class="text-sm">{{ row.fromPlace || '?' }} → {{ row.toPlace || '?' }} <span class="text-gray-400">({{ row.distanceKm || 0 }}km)</span></td>
              <td class="text-right tabular-nums">{{ cur.symbol() }}{{ fmt(row.value) }}</td>
              <td class="text-sm text-gray-500">{{ row.validUntil | date:'mediumDate' }}</td>
              <td><p-tag [value]="row.status | titlecase" [severity]="row.status === 'active' ? 'success' : 'danger'" /></td>
              <td class="text-right">
                <button pButton icon="pi pi-download" class="p-button-text p-button-sm" pTooltip="Download PDF" (click)="downloadPdf(row)"></button>
                @if (row.status === 'active') { <button pButton icon="pi pi-ban" class="p-button-text p-button-sm p-button-danger" pTooltip="Cancel" (click)="cancel(row)"></button> }
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="8" class="text-center py-10 text-gray-400"><i class="pi pi-truck text-4xl mb-3 block"></i><p>No e-way bills yet</p></td></tr></ng-template>
        </p-table>
      </div>

      <p-dialog header="Generate E-Way Bill" [(visible)]="show" [modal]="true" [style]="{ width: '560px' }" [draggable]="false">
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label class="block text-xs font-semibold text-gray-500 mb-1">Invoice</label>
            <p-select [options]="invoices()" [(ngModel)]="form.invoiceId" optionLabel="label" optionValue="id" [filter]="true" [showClear]="true" styleClass="w-full" placeholder="Link an invoice (optional)" /></div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">Transport Mode</label>
            <p-select [options]="modes" [(ngModel)]="form.transportMode" styleClass="w-full" /></div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">Vehicle Number</label><input pInputText [(ngModel)]="form.vehicleNumber" class="w-full" placeholder="e.g. MH12AB1234" /></div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">From</label><input pInputText [(ngModel)]="form.fromPlace" class="w-full" /></div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">To</label><input pInputText [(ngModel)]="form.toPlace" class="w-full" /></div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">Distance (km)</label><p-inputNumber [(ngModel)]="form.distanceKm" [min]="0" inputStyleClass="w-full" /></div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">Transporter</label><input pInputText [(ngModel)]="form.transporter" class="w-full" /></div>
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" [text]="true" (onClick)="show.set(false)" />
          <p-button label="Generate" icon="pi pi-check" [loading]="saving()" (onClick)="submit()" />
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class ErpEwayBillsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly cur = inject(ErpCurrencyService);
  private readonly toast = inject(MessageService);
  loading = signal(true);
  saving = signal(false);
  rows = signal<any[]>([]);
  invoices = signal<any[]>([]);
  show = signal(false);
  modes = ['road', 'rail', 'air', 'ship'];
  form = this.blank();

  ngOnInit() {
    this.load();
    this.cur.load();
    this.api.get<any>('/erp/invoices', { limit: 100 }).subscribe({
      next: (r) => this.invoices.set((r?.data || []).map((i: any) => ({ id: i.id, label: `${i.invoiceNumber} — ${this.cur.symbol()}${i.total}` }))),
    });
  }
  load() {
    this.loading.set(true);
    this.api.get<any>('/erp/eway-bills', { limit: 200 }).subscribe({ next: (r) => { this.rows.set(r?.data || []); this.loading.set(false); }, error: () => this.loading.set(false) });
  }
  openCreate() { this.form = this.blank(); this.show.set(true); }
  submit() {
    this.saving.set(true);
    this.api.post('/erp/eway-bills', this.form).subscribe({
      next: () => { this.saving.set(false); this.show.set(false); this.toast.add({ severity: 'success', summary: 'E-way bill generated' }); this.load(); },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Failed', detail: e?.error?.error?.message || 'Error' }); },
    });
  }
  cancel(row: any) {
    this.api.put(`/erp/eway-bills/${row.id}/cancel`, {}).subscribe({ next: () => { this.toast.add({ severity: 'success', summary: 'Cancelled' }); this.load(); } });
  }
  /** Download the standard-format e-way bill PDF as a blob (works in the WhatsApp webview). */
  downloadPdf(row: any) {
    this.api.downloadFile(`/erp/eway-bills/${row.id}/pdf`, `eway-bill-${row.ewayNumber || row.id}.pdf`,
      () => this.toast.add({ severity: 'error', summary: 'Download failed' }));
  }
  fmt(v: any): string { return (parseFloat(v ?? 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  private blank() { return { invoiceId: null as any, transportMode: 'road', vehicleNumber: '', fromPlace: '', toPlace: '', distanceKm: 0, transporter: '' }; }
}
