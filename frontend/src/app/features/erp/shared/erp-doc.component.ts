import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ApiService } from '../../../core/services/api.service';
import { ErpCurrencyService } from '../../../core/services/erp-currency.service';
import { ErpAccessService } from '../../../core/services/erp-access.service';

export interface ErpDocConfig {
  title: string;
  subtitle?: string;
  apiPath: string;                // '/erp/offers'
  numberField: string;            // 'offerNumber'
  partyLabel: string;             // 'Lead' | 'Supplier'
  partyField: string;             // create payload key, 'leadId' | 'supplierId'
  partyNameField: string;         // row display field, 'leadName' | 'supplierName'
  partyOptionsPath: string;       // '/erp/leads'
  partyLabelExpr: (r: any) => string;
  statuses: { label: string; value: string }[];
  statusBadge: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'>;
  hasTitle?: boolean;             // offers carry a title
  convertLabel?: string;          // 'Convert to Invoice'
  removeMethod?: 'delete' | 'put-remove';
  hasPdf?: boolean;               // show a Download PDF button (default true)
}

interface LineForm { description: string; quantity: number; unitPrice: number; }

@Component({
  selector: 'wa-erp-doc', standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, TagModule, SelectModule, InputTextModule, InputNumberModule, ToastModule, TooltipModule, DialogModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="p-4 max-w-7xl mx-auto">
      <p-toast /><p-confirmDialog />
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">{{ config.title }}</h2>
          @if (config.subtitle) { <p class="text-sm text-gray-500 mt-1">{{ config.subtitle }}</p> }
        </div>
        @if (!erpAccess.readOnly()) { <p-button label="New" icon="pi pi-plus" (onClick)="openCreate()" /> }
      </div>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p-table [value]="rows()" [scrollable]="true" scrollHeight="58vh" [rows]="15" [paginator]="true" [loading]="loading()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr><th>Number</th><th>{{ config.partyLabel }}</th><th class="text-right">Total</th><th>Status</th><th>Created</th><th class="text-right">Actions</th></tr>
          </ng-template>
          <ng-template pTemplate="body" let-row>
            <tr class="cursor-pointer hover:bg-gray-50" (click)="openDetail(row)">
              <td class="font-mono text-sm font-semibold text-primary-600">{{ row[config.numberField] }}</td>
              <td>{{ row[config.partyNameField] || '-' }}</td>
              <td class="text-right font-semibold tabular-nums">{{ currency.symbol() }}{{ fmt(row.total) }}</td>
              <td><p-tag [value]="(row.status || '') | titlecase" [severity]="badge(row.status)" /></td>
              <td class="text-sm text-gray-500">{{ row.createdAt | date:'mediumDate' }}</td>
              <td class="text-right" (click)="$event.stopPropagation()">
                @if (!erpAccess.readOnly()) {
                  <p-select [options]="config.statuses" [ngModel]="row.status" (onChange)="setStatus(row, $event.value)" optionLabel="label" optionValue="value" styleClass="w-36 mr-1" appendTo="body" />
                } @else {
                  <span class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 mr-1">{{ row.status | titlecase }}</span>
                }
                @if (config.hasPdf !== false) {
                  <button pButton icon="pi pi-file-pdf" class="p-button-text p-button-sm" pTooltip="Download PDF" (click)="downloadPdf(row)"></button>
                }
                @if (!erpAccess.readOnly()) {
                  @if (config.convertLabel && row.status !== 'converted') {
                    <button pButton icon="pi pi-arrow-right-arrow-left" class="p-button-text p-button-sm p-button-success" [pTooltip]="config.convertLabel" (click)="convert(row)"></button>
                  }
                  <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-danger" pTooltip="Delete" (click)="confirmDelete(row)"></button>
                }
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="6" class="text-center py-10 text-gray-400"><i class="pi pi-file text-4xl mb-3 block"></i><p class="text-lg font-medium">Nothing yet</p></td></tr></ng-template>
        </p-table>
      </div>

      <p-dialog [header]="'New ' + config.title" [(visible)]="showCreate" [modal]="true" [style]="{ width: '720px' }" [draggable]="false">
        <div class="flex flex-col gap-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">{{ config.partyLabel }}</label>
              <p-select [options]="partyOptions()" [(ngModel)]="form.party" optionLabel="label" optionValue="value" [showClear]="true" [filter]="true" styleClass="w-full" placeholder="Select" />
            </div>
            @if (config.hasTitle) {
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">Title</label><input pInputText [(ngModel)]="form.title" class="w-full" /></div>
            }
          </div>
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs font-semibold text-gray-500 uppercase">Line Items</label>
              <button pButton icon="pi pi-plus" label="Add line" class="p-button-text p-button-sm" (click)="addLine()"></button>
            </div>
            @for (line of form.items; track $index) {
              <div class="flex gap-2 items-center mb-2">
                <input pInputText [(ngModel)]="line.description" placeholder="Description" class="flex-1" />
                <p-inputNumber [(ngModel)]="line.quantity" [min]="1" inputStyleClass="w-20" />
                <p-inputNumber [(ngModel)]="line.unitPrice" mode="currency" currency="INR" locale="en-IN" inputStyleClass="w-28" />
                <span class="w-24 text-right text-sm font-medium tabular-nums">{{ currency.symbol() }}{{ fmt(line.quantity * line.unitPrice) }}</span>
                <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-danger" (click)="removeLine($index)" [disabled]="form.items.length === 1"></button>
              </div>
            }
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">Tax %</label><p-inputNumber [(ngModel)]="form.taxRatePct" [min]="0" [max]="100" suffix="%" inputStyleClass="w-full" /></div>
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">Discount ({{ currency.symbol() }})</label><p-inputNumber [(ngModel)]="form.discount" [min]="0" inputStyleClass="w-full" /></div>
          </div>
          <div class="bg-gray-50 rounded-lg p-3 text-sm">
            <div class="flex justify-between"><span class="text-gray-500">Subtotal</span><span class="tabular-nums">{{ currency.symbol() }}{{ fmt(preview().subtotal) }}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Tax</span><span class="tabular-nums">{{ currency.symbol() }}{{ fmt(preview().tax) }}</span></div>
            <div class="flex justify-between font-bold border-t border-gray-200 mt-1 pt-1"><span>Total</span><span class="tabular-nums">{{ currency.symbol() }}{{ fmt(preview().total) }}</span></div>
          </div>
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" [text]="true" (onClick)="showCreate.set(false)" />
          <p-button label="Create" icon="pi pi-check" [loading]="saving()" (onClick)="submit()" />
        </ng-template>
      </p-dialog>

      <p-dialog header="Document" [(visible)]="showDetail" [modal]="true" [style]="{ width: '560px' }" [draggable]="false">
        @if (detail(); as d) {
          <div class="flex flex-col gap-3">
            <p class="font-mono text-lg font-bold text-primary-600">{{ d[config.numberField] }}</p>
            <table class="w-full text-sm"><tbody>
              @for (l of d.items || []; track $index) {
                <tr class="border-t border-gray-100"><td class="py-1">{{ l.description }}</td><td class="text-right">{{ l.quantity }}</td><td class="text-right tabular-nums">{{ currency.symbol() }}{{ fmt(l.unit_price ?? l.unitPrice) }}</td><td class="text-right tabular-nums">{{ currency.symbol() }}{{ fmt(l.line_total ?? l.lineTotal) }}</td></tr>
              }
            </tbody></table>
            <div class="text-right font-bold">Total: {{ currency.symbol() }}{{ fmt(d.total) }}</div>
          </div>
        }
        <ng-template pTemplate="footer"><p-button label="Close" [text]="true" (onClick)="showDetail.set(false)" /></ng-template>
      </p-dialog>
    </div>
  `,
})
export class ErpDocComponent implements OnInit {
  @Input({ required: true }) config!: ErpDocConfig;
  private readonly api = inject(ApiService);
  readonly currency = inject(ErpCurrencyService);
  readonly erpAccess = inject(ErpAccessService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  loading = signal(true);
  saving = signal(false);
  rows = signal<any[]>([]);
  partyOptions = signal<{ label: string; value: any }[]>([]);
  showCreate = signal(false);
  showDetail = signal(false);
  detail = signal<any>(null);
  form = this.blank();

  preview = computed(() => {
    const subtotal = this.form.items.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
    const taxable = Math.max(0, subtotal - (Number(this.form.discount) || 0));
    const tax = taxable * ((Number(this.form.taxRatePct) || 0) / 100);
    return { subtotal, tax, total: taxable + tax };
  });

  ngOnInit() {
    this.load();
    this.currency.load();
    this.api.get<any>(this.config.partyOptionsPath, { limit: 200 }).subscribe({
      next: (res) => this.partyOptions.set((res?.data ?? res ?? []).map((r: any) => ({ label: this.config.partyLabelExpr(r), value: r.id }))),
    });
  }

  load() {
    this.loading.set(true);
    this.api.get<any>(this.config.apiPath, { limit: 200 }).subscribe({
      next: (res) => { this.rows.set(res?.data ?? []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Failed to load' }); },
    });
  }

  openCreate() { this.form = this.blank(); this.showCreate.set(true); }
  addLine() { this.form.items.push({ description: '', quantity: 1, unitPrice: 0 }); }
  removeLine(i: number) { this.form.items.splice(i, 1); }

  submit() {
    const items = this.form.items.filter(l => l.description && l.quantity > 0);
    if (!items.length) { this.toast.add({ severity: 'warn', summary: 'Add at least one line item' }); return; }
    this.saving.set(true);
    const payload: any = {
      [this.config.partyField]: this.form.party || undefined,
      items: items.map(l => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      taxRate: (Number(this.form.taxRatePct) || 0) / 100,
      discount: Number(this.form.discount) || 0,
    };
    if (this.config.hasTitle) payload.title = this.form.title || undefined;
    this.api.post(this.config.apiPath, payload).subscribe({
      next: () => { this.saving.set(false); this.showCreate.set(false); this.toast.add({ severity: 'success', summary: 'Created' }); this.load(); },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Create failed', detail: e?.error?.error?.message || 'Error' }); },
    });
  }

  setStatus(row: any, status: string) {
    if (status === row.status) return;
    this.api.patch(`${this.config.apiPath}/${row.id}/status`, { status }).subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: `Set to ${status}` }); this.load(); },
      error: () => this.toast.add({ severity: 'error', summary: 'Update failed' }),
    });
  }

  convert(row: any) {
    this.api.post(`${this.config.apiPath}/${row.id}/convert`, {}).subscribe({
      next: (r: any) => { this.toast.add({ severity: 'success', summary: 'Converted', detail: r?.invoice?.invoiceNumber }); this.load(); },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Convert failed', detail: e?.error?.error?.message || 'Error' }),
    });
  }

  openDetail(row: any) {
    this.showDetail.set(true);
    this.api.get<any>(`${this.config.apiPath}/${row.id}`).subscribe({ next: (d) => this.detail.set(d) });
  }

  downloadPdf(row: any) {
    window.open(this.api.url(`${this.config.apiPath}/${row.id}/pdf`), '_blank');
  }

  confirmDelete(row: any) {
    this.confirm.confirm({
      message: `Delete ${row[this.config.numberField]}?`, header: 'Confirm', icon: 'pi pi-trash', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        const req = this.config.removeMethod === 'put-remove'
          ? this.api.put(`${this.config.apiPath}/${row.id}/remove`, {})
          : this.api.delete(`${this.config.apiPath}/${row.id}`);
        req.subscribe({ next: () => { this.toast.add({ severity: 'success', summary: 'Deleted' }); this.load(); } });
      },
    });
  }

  fmt(v: any): string { return (parseFloat(v ?? 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  badge(s: string) { return this.config.statusBadge[s] || 'secondary'; }
  private blank() { return { party: null as any, title: '', items: [{ description: '', quantity: 1, unitPrice: 0 }] as LineForm[], taxRatePct: 0, discount: 0 }; }
}
