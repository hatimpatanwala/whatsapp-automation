import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';

interface TemplateSummary {
  name: string;
  status: string;
  category: string;
  language: string;
  body: string;
  rejectedReason?: string;
}

@Component({
  standalone: true,
  selector: 'app-admin-templates',
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, TagModule, DialogModule,
    InputTextModule, TextareaModule, SelectModule, ToastModule, ConfirmDialogModule,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast />
    <p-confirmDialog />
    <div class="p-6 max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">WhatsApp Message Templates</h1>
          <p class="text-gray-500 text-sm mt-1">Variable-based templates synced with Meta. Status reflects Meta's approval review.</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button pButton icon="pi pi-refresh" label="Refresh" class="p-button-outlined p-button-sm" (click)="load()" [disabled]="loading()"></button>
          <button pButton icon="pi pi-cloud-upload" label="Sync Standard Templates" class="p-button-sm" (click)="provisionAll()" [disabled]="provisioning()"></button>
          <button pButton icon="pi pi-plus" label="New Template" class="p-button-success p-button-sm" (click)="openCreate()"></button>
        </div>
      </div>

      <!-- Status summary -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div class="bg-white rounded-lg border p-3"><div class="text-xs text-gray-500">Total</div><div class="text-xl font-bold">{{ templates().length }}</div></div>
        <div class="bg-green-50 rounded-lg border border-green-100 p-3"><div class="text-xs text-green-700">Approved</div><div class="text-xl font-bold text-green-700">{{ countBy('APPROVED') }}</div></div>
        <div class="bg-amber-50 rounded-lg border border-amber-100 p-3"><div class="text-xs text-amber-700">Pending</div><div class="text-xl font-bold text-amber-700">{{ countBy('PENDING') }}</div></div>
        <div class="bg-red-50 rounded-lg border border-red-100 p-3"><div class="text-xs text-red-700">Rejected</div><div class="text-xl font-bold text-red-700">{{ countBy('REJECTED') }}</div></div>
      </div>

      <div class="bg-white rounded-lg border">
        <p-table [value]="templates()" [loading]="loading()" [paginator]="templates().length > 15" [rows]="15" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th>Name</th><th>Category</th><th>Lang</th><th>Status</th><th>Preview</th><th></th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-t>
            <tr>
              <td class="font-mono text-sm">{{ t.name }}</td>
              <td><p-tag [value]="t.category" severity="secondary" /></td>
              <td class="text-sm">{{ t.language }}</td>
              <td>
                <p-tag [value]="t.status" [severity]="statusSeverity(t.status)" />
                @if (t.rejectedReason) { <i class="pi pi-info-circle text-red-400 ml-1" [title]="t.rejectedReason"></i> }
              </td>
              <td class="text-xs text-gray-600 max-w-md truncate" [title]="t.body">{{ t.body }}</td>
              <td><button pButton icon="pi pi-trash" class="p-button-text p-button-rounded p-button-sm p-button-danger" (click)="confirmDelete(t)"></button></td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6" class="text-center text-gray-400 py-8">No templates yet. Click "Sync Standard Templates" to create the built-in set, or "New Template".</td></tr>
          </ng-template>
        </p-table>
      </div>
    </div>

    <!-- Create dialog -->
    <p-dialog header="New Message Template" [(visible)]="showCreate" [modal]="true" [style]="{ width: '640px' }" [contentStyle]="{ maxHeight: '72vh', overflowY: 'auto' }">
      <div class="flex flex-col gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Template Name *</label>
          <input pInputText [(ngModel)]="form.name" placeholder="e.g. festive_offer" class="w-full" />
          <small class="text-gray-400">Lowercase letters, numbers and underscores only.</small>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">Category *</label>
            <p-select [(ngModel)]="form.category" [options]="categories" optionLabel="label" optionValue="value" class="w-full" appendTo="body" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Language</label>
            <p-select [(ngModel)]="form.language" [options]="languages" optionLabel="label" optionValue="value" class="w-full" appendTo="body" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Header (optional)</label>
          <input pInputText [(ngModel)]="form.header" placeholder="Optional title shown in bold" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Body *</label>
          <textarea pTextarea [(ngModel)]="form.body" (ngModelChange)="syncExamples()" rows="4" class="w-full"
            placeholder="Hi {{ '{{' }}1{{ '}}' }}, your order {{ '{{' }}2{{ '}}' }} is confirmed!"></textarea>
          <div class="flex items-center gap-2 mt-1">
            <small class="text-gray-400">Insert a variable:</small>
            <button pButton type="button" label="+ Add variable" class="p-button-text p-button-sm" (click)="addVariable()"></button>
            <small class="text-gray-400">{{ varCount() }} variable(s)</small>
          </div>
        </div>
        @if (varCount() > 0) {
          <div class="bg-gray-50 rounded p-3">
            <label class="block text-sm font-medium mb-2">Example values (required by Meta for review)</label>
            <div class="flex flex-col gap-2">
              @for (i of varRange(); track i) {
                <div class="flex items-center gap-2">
                  <span class="font-mono text-sm text-gray-500 w-12">{{ '{{' }}{{ i + 1 }}{{ '}}' }}</span>
                  <input pInputText [(ngModel)]="form.examples[i]" placeholder="sample value" class="flex-1" />
                </div>
              }
            </div>
          </div>
        }
        <div>
          <label class="block text-sm font-medium mb-1">Footer (optional)</label>
          <input pInputText [(ngModel)]="form.footer" placeholder="e.g. Reply STOP to unsubscribe" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Quick-reply buttons (optional)</label>
          @for (b of form.buttons; track $index) {
            <div class="flex items-center gap-2 mb-2">
              <input pInputText [(ngModel)]="b.text" placeholder="Button text" class="flex-1" />
              <button pButton icon="pi pi-times" class="p-button-text p-button-rounded p-button-sm p-button-danger" (click)="removeButton($index)"></button>
            </div>
          }
          @if (form.buttons.length < 3) {
            <button pButton type="button" icon="pi pi-plus" label="Add button" class="p-button-text p-button-sm" (click)="addButton()"></button>
          }
        </div>
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Cancel" class="p-button-text" (click)="showCreate.set(false)"></button>
        <button pButton label="Create & Submit to Meta" icon="pi pi-send" (click)="submit()" [disabled]="creating()"></button>
      </ng-template>
    </p-dialog>
  `,
})
export class TemplateListComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  templates = signal<TemplateSummary[]>([]);
  loading = signal(false);
  provisioning = signal(false);
  creating = signal(false);
  showCreate = signal(false);

  categories = [
    { label: 'Utility (transactional)', value: 'UTILITY' },
    { label: 'Marketing (promotional)', value: 'MARKETING' },
    { label: 'Authentication (OTP)', value: 'AUTHENTICATION' },
  ];
  languages = [
    { label: 'English', value: 'en' },
    { label: 'English (US)', value: 'en_US' },
    { label: 'Hindi', value: 'hi' },
  ];

  form: { name: string; category: string; language: string; header: string; body: string; footer: string; examples: string[]; buttons: { text: string }[] } =
    this.blankForm();

  ngOnInit() { this.load(); }

  blankForm() {
    return { name: '', category: 'UTILITY', language: 'en', header: '', body: '', footer: '', examples: [] as string[], buttons: [] as { text: string }[] };
  }

  varCount = computed(() => (this.form.body.match(/\{\{\s*\d+\s*\}\}/g) || []).length);
  varRange() { return Array.from({ length: this.varCount() }, (_, i) => i); }
  syncExamples() {
    const n = this.varCount();
    while (this.form.examples.length < n) this.form.examples.push('');
    this.form.examples.length = n;
  }
  addVariable() { this.form.body = (this.form.body || '') + `{{${this.varCount() + 1}}}`; this.syncExamples(); }
  addButton() { if (this.form.buttons.length < 3) this.form.buttons.push({ text: '' }); }
  removeButton(i: number) { this.form.buttons.splice(i, 1); }

  countBy(status: string) { return this.templates().filter((t) => t.status === status).length; }

  statusSeverity(s: string): any {
    if (s === 'APPROVED') return 'success';
    if (s === 'PENDING' || s === 'IN_APPEAL' || s === 'PENDING_DELETION') return 'warn';
    if (s === 'REJECTED' || s === 'DISABLED' || s === 'PAUSED') return 'danger';
    return 'secondary';
  }

  load() {
    this.loading.set(true);
    this.api.get<TemplateSummary[]>('/admin/templates').subscribe({
      next: (res) => { this.templates.set(res || []); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Failed to load', detail: e?.error?.error?.message || e?.message || 'Could not load templates' }); },
    });
  }

  provisionAll() {
    this.provisioning.set(true);
    this.api.post<{ summary: { created: number; existing: number; failed: number } }>('/admin/templates/provision', {}).subscribe({
      next: (res) => {
        this.provisioning.set(false);
        const s = res?.summary;
        this.toast.add({ severity: 'success', summary: 'Synced', detail: `Created ${s?.created ?? 0}, existing ${s?.existing ?? 0}, failed ${s?.failed ?? 0}` });
        this.load();
      },
      error: (e) => { this.provisioning.set(false); this.toast.add({ severity: 'error', summary: 'Sync failed', detail: e?.error?.error?.message || e?.message }); },
    });
  }

  openCreate() { this.form = this.blankForm(); this.showCreate.set(true); }

  submit() {
    if (!this.form.name.trim() || !this.form.body.trim()) {
      this.toast.add({ severity: 'warn', summary: 'Missing fields', detail: 'Name and body are required.' });
      return;
    }
    this.creating.set(true);
    const payload = {
      name: this.form.name, category: this.form.category, language: this.form.language,
      header: this.form.header || undefined, body: this.form.body, footer: this.form.footer || undefined,
      examples: this.form.examples,
      buttons: this.form.buttons.filter((b) => b.text.trim()).map((b) => ({ type: 'QUICK_REPLY', text: b.text })),
    };
    this.api.post<{ status: string; error?: string }>('/admin/templates', payload).subscribe({
      next: (res) => {
        this.creating.set(false);
        if (res.status === 'failed') {
          this.toast.add({ severity: 'error', summary: 'Rejected by Meta', detail: res.error || 'Template creation failed' });
          return;
        }
        this.toast.add({ severity: 'success', summary: 'Submitted', detail: 'Template submitted to Meta for approval.' });
        this.showCreate.set(false);
        this.load();
      },
      error: (e) => { this.creating.set(false); this.toast.add({ severity: 'error', summary: 'Failed', detail: e?.error?.error?.message || e?.message }); },
    });
  }

  confirmDelete(t: TemplateSummary) {
    this.confirm.confirm({
      message: `Delete template "${t.name}"? This removes it from Meta.`,
      header: 'Delete template', icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.api.delete(`/admin/templates/${encodeURIComponent(t.name)}`).subscribe({
          next: () => { this.toast.add({ severity: 'success', summary: 'Deleted', detail: t.name }); this.load(); },
          error: (e) => this.toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.error?.error?.message || e?.message }),
        });
      },
    });
  }
}
