import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'wa-erp-api-keys', standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, InputTextModule, DialogModule, ToastModule, ConfirmDialogModule, TooltipModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="p-4 max-w-5xl mx-auto">
      <p-toast /><p-confirmDialog />
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">API Keys</h2>
          <p class="text-sm text-gray-500 mt-1">Developer keys for integrating with your ERP — the key is shown only once</p>
        </div>
        <p-button label="Generate Key" icon="pi pi-plus" (onClick)="showNew.set(true)" />
      </div>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p-table [value]="rows()" [loading]="loading()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header"><tr><th>Name</th><th>Key</th><th>Last Used</th><th>Created</th><th class="text-right">Actions</th></tr></ng-template>
          <ng-template pTemplate="body" let-row>
            <tr>
              <td class="font-medium">{{ row.name }}</td>
              <td class="font-mono text-sm text-gray-500">{{ row.keyPrefix }}…</td>
              <td class="text-sm text-gray-400">{{ row.lastUsedAt ? (row.lastUsedAt | date:'medium') : 'never' }}</td>
              <td class="text-sm text-gray-400">{{ row.createdAt | date:'mediumDate' }}</td>
              <td class="text-right"><button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-danger" pTooltip="Revoke" (click)="revoke(row)"></button></td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="text-center py-10 text-gray-400"><i class="pi pi-key text-4xl mb-3 block"></i><p>No API keys yet</p></td></tr></ng-template>
        </p-table>
      </div>

      <p-dialog header="Generate API Key" [(visible)]="showNew" [modal]="true" [style]="{ width: '420px' }" [draggable]="false">
        <label class="block text-xs font-semibold text-gray-500 mb-1">Key name</label>
        <input pInputText [(ngModel)]="newName" class="w-full" placeholder="e.g. Zapier integration" />
        <ng-template pTemplate="footer">
          <p-button label="Cancel" [text]="true" (onClick)="showNew.set(false)" />
          <p-button label="Generate" icon="pi pi-check" [loading]="saving()" (onClick)="generate()" />
        </ng-template>
      </p-dialog>

      <p-dialog header="Copy your API key now" [(visible)]="showKey" [modal]="true" [style]="{ width: '520px' }" [draggable]="false" [closable]="false">
        <p class="text-sm text-amber-600 mb-3"><i class="pi pi-exclamation-triangle"></i> This is the only time the full key is shown. Copy it now.</p>
        <div class="bg-gray-900 text-green-300 font-mono text-sm rounded-lg p-3 break-all">{{ createdKey() }}</div>
        <ng-template pTemplate="footer">
          <p-button label="Copy" icon="pi pi-copy" [outlined]="true" (onClick)="copy()" />
          <p-button label="Done" icon="pi pi-check" (onClick)="showKey.set(false)" />
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class ErpApiKeysComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  loading = signal(true);
  saving = signal(false);
  rows = signal<any[]>([]);
  showNew = signal(false);
  showKey = signal(false);
  createdKey = signal('');
  newName = '';

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.api.get<any>('/erp/api-keys').subscribe({ next: (r) => { this.rows.set(r?.data ?? []); this.loading.set(false); }, error: () => this.loading.set(false) });
  }
  generate() {
    if (!this.newName) { this.toast.add({ severity: 'warn', summary: 'Enter a name' }); return; }
    this.saving.set(true);
    this.api.post<any>('/erp/api-keys', { name: this.newName }).subscribe({
      next: (r) => { this.saving.set(false); this.showNew.set(false); this.newName = ''; this.createdKey.set(r.key); this.showKey.set(true); this.load(); },
      error: () => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Failed' }); },
    });
  }
  copy() { navigator.clipboard?.writeText(this.createdKey()); this.toast.add({ severity: 'success', summary: 'Copied' }); }
  revoke(row: any) {
    this.confirm.confirm({
      message: `Revoke "${row.name}"? Apps using it will stop working.`, header: 'Revoke key', icon: 'pi pi-trash', acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.api.delete(`/erp/api-keys/${row.id}`).subscribe({ next: () => { this.toast.add({ severity: 'success', summary: 'Revoked' }); this.load(); } }),
    });
  }
}
