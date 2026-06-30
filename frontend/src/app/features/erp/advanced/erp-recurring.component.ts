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
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ApiService } from '../../../core/services/api.service';

interface LineForm { description: string; quantity: number; unitPrice: number; }

@Component({
  selector: 'wa-erp-recurring', standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, TagModule, SelectModule, InputTextModule, InputNumberModule, DialogModule, ToastModule, TooltipModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="p-4 max-w-7xl mx-auto">
      <p-toast /><p-confirmDialog />
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Recurring Invoices</h2>
          <p class="text-sm text-gray-500 mt-1">Templates that auto-generate invoices on a schedule (daily 6am cron)</p>
        </div>
        <div class="flex gap-2">
          <p-button label="Run Due Now" icon="pi pi-bolt" [outlined]="true" (onClick)="runNow()" />
          <p-button label="New Template" icon="pi pi-plus" (onClick)="openCreate()" />
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p-table [value]="rows()" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="true" [rows]="15">
          <ng-template pTemplate="header"><tr><th>Title</th><th>Customer</th><th>Frequency</th><th>Next Run</th><th class="text-right">Generated</th><th>Status</th><th class="text-right">Actions</th></tr></ng-template>
          <ng-template pTemplate="body" let-row>
            <tr>
              <td class="font-medium">{{ row.title || '—' }}</td>
              <td>{{ row.customerName || '—' }}</td>
              <td>{{ row.frequency | titlecase }}</td>
              <td class="text-sm">{{ row.nextRunDate | date:'mediumDate' }}</td>
              <td class="text-right tabular-nums">{{ row.generatedCount }}</td>
              <td><p-tag [value]="row.enabled ? 'Active' : 'Paused'" [severity]="row.enabled ? 'success' : 'secondary'" /></td>
              <td class="text-right">
                <button pButton [icon]="row.enabled ? 'pi pi-pause' : 'pi pi-play'" class="p-button-text p-button-sm" [pTooltip]="row.enabled ? 'Pause' : 'Resume'" (click)="toggle(row)"></button>
                <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-danger" pTooltip="Delete" (click)="remove(row)"></button>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="7" class="text-center py-10 text-gray-400"><i class="pi pi-replay text-4xl mb-3 block"></i><p>No recurring templates yet</p></td></tr></ng-template>
        </p-table>
      </div>

      <p-dialog header="New Recurring Invoice" [(visible)]="showCreate" [modal]="true" [style]="{ width: '720px' }" [draggable]="false">
        <div class="flex flex-col gap-4">
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">Title</label><input pInputText [(ngModel)]="form.title" class="w-full" placeholder="e.g. Monthly retainer" /></div>
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">Customer Name</label><input pInputText [(ngModel)]="form.customerName" class="w-full" /></div>
          </div>
          <div>
            <div class="flex items-center justify-between mb-2"><label class="text-xs font-semibold text-gray-500 uppercase">Line Items</label><button pButton icon="pi pi-plus" label="Add line" class="p-button-text p-button-sm" (click)="addLine()"></button></div>
            @for (line of form.items; track $index) {
              <div class="flex gap-2 items-center mb-2">
                <input pInputText [(ngModel)]="line.description" placeholder="Description" class="flex-1" />
                <p-inputNumber [(ngModel)]="line.quantity" [min]="1" inputStyleClass="w-20" />
                <p-inputNumber [(ngModel)]="line.unitPrice" mode="currency" currency="INR" locale="en-IN" inputStyleClass="w-28" />
                <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-danger" (click)="removeLine($index)" [disabled]="form.items.length === 1"></button>
              </div>
            }
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">Frequency</label><p-select [options]="frequencies" [(ngModel)]="form.frequency" optionLabel="label" optionValue="value" styleClass="w-full" /></div>
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">Start / Next date</label><input type="date" [(ngModel)]="form.nextRunDate" class="w-full border border-gray-300 rounded-md px-2 py-2 text-sm" /></div>
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">Tax %</label><p-inputNumber [(ngModel)]="form.taxRatePct" [min]="0" [max]="100" suffix="%" inputStyleClass="w-full" /></div>
          </div>
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" [text]="true" (onClick)="showCreate.set(false)" />
          <p-button label="Create" icon="pi pi-check" [loading]="saving()" (onClick)="submit()" />
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class ErpRecurringComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  loading = signal(true);
  saving = signal(false);
  rows = signal<any[]>([]);
  showCreate = signal(false);
  form = this.blank();
  frequencies = ['weekly', 'monthly', 'quarterly', 'yearly'].map((v) => ({ label: v[0].toUpperCase() + v.slice(1), value: v }));

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.api.get<any>('/erp/recurring-invoices', { limit: 200 }).subscribe({ next: (r) => { this.rows.set(r?.data ?? []); this.loading.set(false); }, error: () => this.loading.set(false) });
  }
  openCreate() { this.form = this.blank(); this.showCreate.set(true); }
  addLine() { this.form.items.push({ description: '', quantity: 1, unitPrice: 0 }); }
  removeLine(i: number) { this.form.items.splice(i, 1); }
  submit() {
    const items = this.form.items.filter((l) => l.description && l.quantity > 0);
    if (!items.length) { this.toast.add({ severity: 'warn', summary: 'Add a line item' }); return; }
    if (!this.form.nextRunDate) { this.toast.add({ severity: 'warn', summary: 'Pick a start date' }); return; }
    this.saving.set(true);
    this.api.post('/erp/recurring-invoices', {
      title: this.form.title || undefined, customerName: this.form.customerName || undefined,
      items: items.map((l) => ({ description: l.description, quantity: +l.quantity, unitPrice: +l.unitPrice })),
      taxRate: (+this.form.taxRatePct || 0) / 100, frequency: this.form.frequency, nextRunDate: this.form.nextRunDate,
    }).subscribe({
      next: () => { this.saving.set(false); this.showCreate.set(false); this.toast.add({ severity: 'success', summary: 'Template created' }); this.load(); },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Failed', detail: e?.error?.error?.message || 'Error' }); },
    });
  }
  toggle(row: any) {
    this.api.put(`/erp/recurring-invoices/${row.id}`, { enabled: !row.enabled }).subscribe({ next: () => this.load() });
  }
  remove(row: any) {
    this.confirm.confirm({ message: `Delete this recurring template?`, header: 'Confirm', icon: 'pi pi-trash', acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.api.delete(`/erp/recurring-invoices/${row.id}`).subscribe({ next: () => { this.toast.add({ severity: 'success', summary: 'Deleted' }); this.load(); } }) });
  }
  runNow() {
    this.api.post<any>('/erp/recurring-invoices/run-now', {}).subscribe({
      next: (r) => { this.toast.add({ severity: 'success', summary: `Generated ${r.generated} invoice(s)` }); this.load(); },
      error: () => this.toast.add({ severity: 'error', summary: 'Failed' }),
    });
  }
  private blank() { return { title: '', customerName: '', items: [{ description: '', quantity: 1, unitPrice: 0 }] as LineForm[], frequency: 'monthly', nextRunDate: new Date().toISOString().slice(0, 10), taxRatePct: 0 }; }
}
