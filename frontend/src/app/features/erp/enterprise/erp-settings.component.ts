import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../../core/services/api.service';

interface SettingField { key: string; label: string; type?: 'text' | 'number' | 'textarea' | 'select' | 'boolean'; options?: { label: string; value: any }[]; half?: boolean; }
interface SettingGroup { title: string; fields: SettingField[]; }

const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

@Component({
  selector: 'wa-erp-settings', standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, InputNumberModule, SelectModule, ToastModule, CheckboxModule],
  providers: [MessageService],
  template: `
    <div class="p-4 max-w-4xl mx-auto">
      <p-toast />
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">ERP Settings</h2>
          <p class="text-sm text-gray-500 mt-1">Company profile, currency, tax and document numbering — used across invoices & PDFs</p>
        </div>
        <p-button label="Save Changes" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </div>

      @for (g of groups; track g.title) {
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
          <h3 class="font-semibold text-gray-800 mb-4">{{ g.title }}</h3>
          <div class="grid grid-cols-2 gap-4">
            @for (f of g.fields; track f.key) {
              <div [class.col-span-2]="!f.half">
                <label class="block text-xs font-semibold text-gray-500 mb-1">{{ f.label }}</label>
                @switch (f.type) {
                  @case ('textarea') { <textarea [(ngModel)]="model[f.key]" rows="2" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"></textarea> }
                  @case ('number') { <p-inputNumber [(ngModel)]="model[f.key]" inputStyleClass="w-full" /> }
                  @case ('select') { <p-select [options]="f.options || []" [(ngModel)]="model[f.key]" optionLabel="label" optionValue="value" styleClass="w-full" /> }
                  @case ('boolean') { <div class="pt-2"><p-checkbox [(ngModel)]="model[f.key]" [binary]="true" /> <span class="text-sm text-gray-600 ml-2">Enabled</span></div> }
                  @default { <input pInputText [(ngModel)]="model[f.key]" class="w-full" /> }
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class ErpSettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  saving = signal(false);
  model: Record<string, any> = {};

  groups: SettingGroup[] = [
    { title: 'Company Profile', fields: [
      { key: 'invoice_legal_name', label: 'Legal / Company Name', half: true },
      { key: 'invoice_gstin', label: 'GSTIN', half: true },
      { key: 'erp_company_email', label: 'Email', half: true },
      { key: 'erp_company_phone', label: 'Phone', half: true },
      { key: 'erp_company_website', label: 'Website', half: true },
      { key: 'invoice_state', label: 'State', half: true },
      { key: 'invoice_address', label: 'Address', type: 'textarea' },
    ]},
    { title: 'Currency & Tax', fields: [
      { key: 'erp_base_currency', label: 'Base Currency Code', half: true },
      { key: 'erp_currency_position', label: 'Symbol Position', type: 'select', half: true, options: [{ label: 'Before (₹100)', value: 'before' }, { label: 'After (100₹)', value: 'after' }] },
      { key: 'erp_currency_decimals', label: 'Decimal Places', type: 'number', half: true },
      { key: 'erp_default_tax_rate', label: 'Default Tax Rate (fraction)', type: 'number', half: true },
    ]},
    { title: 'Document Numbering', fields: [
      { key: 'erp_invoice_prefix', label: 'Invoice Prefix', half: true },
      { key: 'erp_quote_prefix', label: 'Quote Prefix', half: true },
      { key: 'erp_offer_prefix', label: 'Offer Prefix', half: true },
    ]},
    { title: 'WhatsApp Automation', fields: [
      { key: 'erp_auto_reminders', label: 'Auto payment reminders (daily 10am)', type: 'boolean', half: true },
      { key: 'erp_reminder_days_overdue', label: 'Remind when overdue by (days)', type: 'number', half: true },
    ]},
  ];

  ngOnInit() {
    this.api.get<any>('/erp/settings').subscribe({
      next: (data) => {
        for (const g of this.groups) for (const f of g.fields) {
          const v = data[toCamel(f.key)];
          this.model[f.key] = f.type === 'boolean' ? v === true : (v ?? '');
        }
      },
    });
  }

  save() {
    this.saving.set(true);
    // model is keyed by the snake_case setting keys the backend expects.
    this.api.put('/erp/settings', this.model).subscribe({
      next: () => { this.saving.set(false); this.toast.add({ severity: 'success', summary: 'Settings saved' }); },
      error: () => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Save failed' }); },
    });
  }
}
