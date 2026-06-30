import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ApiService } from '../../../core/services/api.service';
import { ErpCurrencyService } from '../../../core/services/erp-currency.service';
import { ErpAccessService } from '../../../core/services/erp-access.service';

export interface CrudColumn {
  field: string;
  header: string;
  type?: 'text' | 'currency' | 'badge' | 'date' | 'boolean' | 'phone';
  badgeMap?: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'>;
  width?: string;
}

export interface CrudField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'currency' | 'textarea' | 'select' | 'boolean' | 'date' | 'phone' | 'email';
  options?: { label: string; value: any }[];
  required?: boolean;
  placeholder?: string;
  half?: boolean; // render at half width (two per row)
  default?: any;  // value pre-filled on create
  /** For 'select': load options from this API path ({data:[]}); mapped via optionLabelKey/optionValueKey. */
  optionsPath?: string;
  optionLabelKey?: string; // default 'name'
  optionValueKey?: string; // default 'id'
}

export interface ErpCrudConfig {
  title: string;
  subtitle?: string;
  apiPath: string;            // e.g. '/erp/leads'
  columns: CrudColumn[];
  fields: CrudField[];
  searchFields?: string[];
  newLabel?: string;          // default 'New'
  /** Optional row→label for the delete confirm. */
  labelField?: string;
}

/**
 * Generic ERP CRUD screen — the Angular/PrimeNG analogue of IDURAR's metadata-driven
 * CrudModule. Drives a list + create/edit dialog + delete entirely from an
 * ErpCrudConfig against a BaseTenantCrudService-backed endpoint
 * (GET list → {data,total}, POST/PUT/DELETE). Used for leads, clients, suppliers,
 * expense categories, payment modes, employees, etc.
 */
@Component({
  selector: 'wa-erp-crud',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, TagModule, SelectModule,
    InputTextModule, InputNumberModule, IconFieldModule, InputIconModule, ToastModule,
    TooltipModule, DialogModule, ConfirmDialogModule, CheckboxModule,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="p-4 max-w-7xl mx-auto">
      <p-toast />
      <p-confirmDialog />

      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">{{ config.title }}</h2>
          @if (config.subtitle) { <p class="text-sm text-gray-500 mt-1">{{ config.subtitle }}</p> }
        </div>
        @if (!erpAccess.readOnly()) {
          <p-button [label]="config.newLabel || 'New'" icon="pi pi-plus" (onClick)="openCreate()" />
        }
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <p-iconfield class="min-w-64">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" placeholder="Search..." [(ngModel)]="searchTerm" class="w-full" />
        </p-iconfield>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p-table [value]="filtered()" [scrollable]="true" scrollHeight="58vh" [rows]="15" [paginator]="true"
          [rowsPerPageOptions]="[10, 15, 25, 50]" [loading]="loading()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              @for (c of config.columns; track c.field) { <th>{{ c.header }}</th> }
              <th class="text-right">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-row>
            <tr class="cursor-pointer hover:bg-gray-50" (click)="openEdit(row)">
              @for (c of config.columns; track c.field) {
                <td>
                  @switch (c.type) {
                    @case ('currency') { <span class="tabular-nums">{{ currency.symbol() }}{{ fmt(row[c.field]) }}</span> }
                    @case ('badge') { <p-tag [value]="(row[c.field] || '') | titlecase" [severity]="badge(c, row[c.field])" /> }
                    @case ('date') { <span class="text-sm text-gray-500">{{ row[c.field] ? (row[c.field] | date:'mediumDate') : '-' }}</span> }
                    @case ('boolean') { <i class="pi" [class.pi-check-circle]="row[c.field]" [class.text-green-600]="row[c.field]" [class.pi-minus-circle]="!row[c.field]" [class.text-gray-300]="!row[c.field]"></i> }
                    @default { {{ row[c.field] || '-' }} }
                  }
                </td>
              }
              <td class="text-right" (click)="$event.stopPropagation()">
                @if (!erpAccess.readOnly()) {
                  <button pButton icon="pi pi-pencil" class="p-button-text p-button-sm" pTooltip="Edit" (click)="openEdit(row)"></button>
                  <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-danger" pTooltip="Delete" (click)="confirmDelete(row)"></button>
                }
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td [attr.colspan]="config.columns.length + 1" class="text-center py-10 text-gray-400">
              <i class="pi pi-inbox text-4xl mb-3 block"></i>
              <p class="text-lg font-medium">Nothing here yet</p>
            </td></tr>
          </ng-template>
        </p-table>
      </div>

      <p-dialog [header]="editing() ? 'Edit ' + config.title : (config.newLabel || 'New')" [(visible)]="showDialog" [modal]="true" [style]="{ width: '560px' }" [draggable]="false">
        <div class="grid grid-cols-2 gap-3">
          @for (f of config.fields; track f.key) {
            <div [class.col-span-2]="!f.half">
              <label class="block text-xs font-semibold text-gray-500 mb-1">{{ f.label }}@if (f.required) { <span class="text-red-500">*</span> }</label>
              @switch (f.type) {
                @case ('textarea') { <textarea [(ngModel)]="model[f.key]" rows="2" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" [placeholder]="f.placeholder || ''"></textarea> }
                @case ('number') { <p-inputNumber [(ngModel)]="model[f.key]" inputStyleClass="w-full" /> }
                @case ('currency') { <p-inputNumber [(ngModel)]="model[f.key]" mode="currency" currency="INR" locale="en-IN" inputStyleClass="w-full" /> }
                @case ('select') { <p-select [options]="optionsFor(f)" [(ngModel)]="model[f.key]" optionLabel="label" optionValue="value" [showClear]="true" [filter]="true" styleClass="w-full" [placeholder]="f.placeholder || 'Select'" /> }
                @case ('boolean') { <div class="pt-2"><p-checkbox [(ngModel)]="model[f.key]" [binary]="true" /></div> }
                @case ('date') { <input type="date" [(ngModel)]="model[f.key]" class="w-full border border-gray-300 rounded-md px-2 py-2 text-sm" /> }
                @default { <input pInputText [(ngModel)]="model[f.key]" class="w-full" [placeholder]="f.placeholder || ''" /> }
              }
            </div>
          }
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" [text]="true" (onClick)="showDialog.set(false)" />
          <p-button [label]="editing() ? 'Save' : 'Create'" icon="pi pi-check" [loading]="saving()" (onClick)="submit()" />
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class ErpCrudComponent implements OnInit {
  @Input({ required: true }) config!: ErpCrudConfig;

  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  readonly currency = inject(ErpCurrencyService);
  readonly erpAccess = inject(ErpAccessService);

  loading = signal(true);
  saving = signal(false);
  rows = signal<any[]>([]);
  searchTerm = '';
  showDialog = signal(false);
  editing = signal(false);
  model: Record<string, any> = {};
  asyncOptions = signal<Record<string, { label: string; value: any }[]>>({});

  filtered = computed(() => {
    const term = this.searchTerm.toLowerCase().trim();
    const fields = this.config.searchFields || this.config.columns.map(c => c.field);
    if (!term) return this.rows();
    return this.rows().filter(r => fields.some(f => String(r[f] ?? '').toLowerCase().includes(term)));
  });

  ngOnInit() {
    this.load();
    this.currency.load();
    // Load async select options (FK dropdowns).
    for (const f of this.config.fields) {
      if (f.type === 'select' && f.optionsPath) {
        const lk = f.optionLabelKey || 'name', vk = f.optionValueKey || 'id';
        this.api.get<any>(f.optionsPath, { limit: 200 }).subscribe({
          next: (res) => {
            const rows = res?.data ?? res ?? [];
            this.asyncOptions.update((m) => ({ ...m, [f.key]: rows.map((r: any) => ({ label: r[lk], value: r[vk] })) }));
          },
        });
      }
    }
  }

  optionsFor(f: CrudField): { label: string; value: any }[] {
    return f.options || this.asyncOptions()[f.key] || [];
  }

  load() {
    this.loading.set(true);
    this.api.get<any>(this.config.apiPath, { limit: 200 }).subscribe({
      next: (res) => { this.rows.set(res?.data ?? res ?? []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Failed to load' }); },
    });
  }

  openCreate() {
    this.editing.set(false);
    this.model = {};
    for (const f of this.config.fields) {
      if (f.default !== undefined) this.model[f.key] = f.default;
      else if (f.type === 'boolean') this.model[f.key] = false;
    }
    this.showDialog.set(true);
  }
  openEdit(row: any) { if (this.erpAccess.readOnly()) return; this.editing.set(true); this.model = { ...row }; this.showDialog.set(true); }

  submit() {
    for (const f of this.config.fields) {
      if (f.required && (this.model[f.key] === undefined || this.model[f.key] === null || this.model[f.key] === '')) {
        this.toast.add({ severity: 'warn', summary: `${f.label} is required` });
        return;
      }
    }
    this.saving.set(true);
    const payload = this.payload();
    const req = this.editing()
      ? this.api.put(`${this.config.apiPath}/${this.model['id']}`, payload)
      : this.api.post(this.config.apiPath, payload);
    req.subscribe({
      next: () => { this.saving.set(false); this.showDialog.set(false); this.toast.add({ severity: 'success', summary: this.editing() ? 'Saved' : 'Created' }); this.load(); },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Save failed', detail: e?.error?.error?.message || 'Error' }); },
    });
  }

  confirmDelete(row: any) {
    const label = row[this.config.labelField || this.config.columns[0].field];
    this.confirm.confirm({
      message: `Delete "${label}"?`, header: 'Confirm Delete', icon: 'pi pi-trash', acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.api.delete(`${this.config.apiPath}/${row.id}`).subscribe({
        next: () => { this.toast.add({ severity: 'success', summary: 'Deleted' }); this.load(); },
        error: () => this.toast.add({ severity: 'error', summary: 'Delete failed' }),
      }),
    });
  }

  /** Only send keys declared as fields (+ id). */
  private payload(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const f of this.config.fields) if (this.model[f.key] !== undefined) out[f.key] = this.model[f.key];
    return out;
  }

  fmt(v: any): string { return (parseFloat(v ?? 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  badge(c: CrudColumn, v: any): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    return c.badgeMap?.[v] || 'secondary';
  }
}
