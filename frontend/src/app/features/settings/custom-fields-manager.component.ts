import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/services/api.service';

interface FieldDef {
  id: string;
  entity: 'customer' | 'product';
  field_key: string; fieldKey?: string;
  label: string;
  field_type: string; fieldType?: string;
  options: string[];
  placeholder?: string; help_text?: string; helpText?: string;
  is_required?: boolean; isRequired?: boolean;
  collect_from_customer?: boolean; collectFromCustomer?: boolean;
  sort_order?: number; sortOrder?: number;
  is_active?: boolean; isActive?: boolean;
}

/**
 * Admin manager for customer/product custom fields. Lives under
 * Settings → Custom Fields. Definitions drive the product add form, the
 * customer detail view, the customer onboarding webview, and workflow variables.
 */
@Component({
  selector: 'wa-custom-fields-manager',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, InputTextModule, SelectModule,
    ToggleSwitchModule, DialogModule, TagModule, ToastModule,
  ],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold text-gray-900">Custom Fields</h3>
          <p class="text-xs text-gray-500">Add your own fields to customers and products. Customer fields can be required and collected from the customer; their values are usable as workflow variables.</p>
        </div>
        <button pButton label="Add field" icon="pi pi-plus" severity="success" class="p-button-sm" (click)="openNew()"></button>
      </div>

      <!-- Entity toggle -->
      <div class="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        @for (e of entities; track e.value) {
          <button class="text-sm font-semibold rounded-lg py-1.5 px-4 border-0 cursor-pointer transition-all"
            [class.bg-white]="entity()===e.value" [class.shadow-sm]="entity()===e.value" [class.text-primary-600]="entity()===e.value" [class.text-gray-500]="entity()!==e.value"
            (click)="entity.set(e.value)">{{ e.label }}</button>
        }
      </div>

      <!-- List -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        @if (!filtered().length) {
          <div class="text-center py-10">
            <i class="pi pi-sliders-h text-gray-200" style="font-size:2rem"></i>
            <p class="text-sm text-gray-500 mt-2">No {{ entity() }} fields yet.</p>
            <button pButton label="Add your first field" icon="pi pi-plus" class="p-button-text p-button-sm mt-1" (click)="openNew()"></button>
          </div>
        }
        @for (f of filtered(); track f.id) {
          <div class="flex items-center gap-3 p-4">
            <div class="w-9 h-9 rounded-lg bg-gray-50 text-gray-500 flex items-center justify-center shrink-0"><i [class]="'pi ' + typeIcon(f.field_type)"></i></div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-gray-900 truncate">
                {{ f.label }}
                @if (f.is_required) { <span class="text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 ml-1 align-middle">Required</span> }
                @if (f.is_active === false) { <span class="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 ml-1 align-middle">Hidden</span> }
                @if (entity() === 'customer' && f.collect_from_customer) { <span class="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5 ml-1 align-middle">Onboarding</span> }
              </p>
              <p class="text-xs text-gray-400 truncate">
                <span class="font-mono">{{ '{{' }}{{ f.field_key }}{{ '}}' }}</span> · {{ typeLabel(f.field_type) }}
                @if (f.field_type === 'select' && f.options?.length) { <span> · {{ f.options.join(', ') }}</span> }
              </p>
            </div>
            <button pButton icon="pi pi-pencil" class="p-button-text p-button-sm p-button-rounded" (click)="openEdit(f)"></button>
            <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-rounded p-button-danger" (click)="remove(f)"></button>
          </div>
        }
      </div>
    </div>

    <!-- Add / edit dialog -->
    <p-dialog [(visible)]="dialogVisible" [header]="model?.id ? 'Edit field' : 'New ' + entity() + ' field'" [modal]="true" [style]="{ width: '460px' }" [draggable]="false">
      @if (model; as m) {
        <div class="space-y-3">
          <div>
            <label class="text-xs font-medium text-gray-500">Label</label>
            <input pInputText [(ngModel)]="m.label" class="w-full" placeholder="e.g. GST Number, Date of Birth" />
          </div>
          <div>
            <label class="text-xs font-medium text-gray-500">Type</label>
            <p-select [(ngModel)]="m.field_type" [options]="fieldTypes" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
          </div>
          @if (m.field_type === 'select') {
            <div>
              <label class="text-xs font-medium text-gray-500">Choices (comma-separated)</label>
              <input pInputText [(ngModel)]="optionsText" class="w-full" placeholder="Small, Medium, Large" />
            </div>
          }
          <div>
            <label class="text-xs font-medium text-gray-500">Help text <span class="text-gray-300">(optional)</span></label>
            <input pInputText [(ngModel)]="m.help_text" class="w-full" placeholder="Shown under the field" />
          </div>
          <label class="flex items-center justify-between pt-1">
            <span class="text-sm text-gray-900">Required</span>
            <p-toggleswitch [(ngModel)]="m.is_required" />
          </label>
          @if (entity() === 'customer') {
            <label class="flex items-center justify-between">
              <span class="text-sm text-gray-900">Collect from customer <span class="text-xs text-gray-400">(onboarding form)</span></span>
              <p-toggleswitch [(ngModel)]="m.collect_from_customer" />
            </label>
          }
          <label class="flex items-center justify-between">
            <span class="text-sm text-gray-900">Active</span>
            <p-toggleswitch [(ngModel)]="m.is_active" />
          </label>
        </div>
      }
      <ng-template pTemplate="footer">
        <button pButton label="Cancel" class="p-button-text" (click)="dialogVisible = false"></button>
        <button pButton [label]="saving() ? 'Saving…' : 'Save'" icon="pi pi-check" severity="success" [disabled]="saving() || !model?.label?.trim()" (click)="save()"></button>
      </ng-template>
    </p-dialog>
  `,
})
export class CustomFieldsManagerComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  entity = signal<'customer' | 'product'>('customer');
  entities = [{ label: '👤 Customer fields', value: 'customer' as const }, { label: '📦 Product fields', value: 'product' as const }];
  fieldTypes = [
    { label: 'Text', value: 'text' }, { label: 'Long text', value: 'textarea' }, { label: 'Number', value: 'number' },
    { label: 'Date', value: 'date' }, { label: 'Dropdown', value: 'select' }, { label: 'Yes / No', value: 'boolean' },
    { label: 'Phone', value: 'phone' }, { label: 'Email', value: 'email' },
  ];

  all = signal<FieldDef[]>([]);
  filtered = computed(() => this.all().filter(f => f.entity === this.entity()));
  dialogVisible = false;
  model: any = null;
  optionsText = '';
  saving = signal(false);

  private arr(r: any): any[] { return Array.isArray(r) ? r : (r?.data ?? r?.items ?? []); }
  private norm(f: any): FieldDef {
    return {
      ...f,
      field_key: f.field_key ?? f.fieldKey,
      field_type: f.field_type ?? f.fieldType ?? 'text',
      options: f.options ?? [],
      help_text: f.help_text ?? f.helpText,
      is_required: f.is_required ?? f.isRequired ?? false,
      collect_from_customer: f.collect_from_customer ?? f.collectFromCustomer ?? false,
      is_active: f.is_active ?? f.isActive ?? true,
    };
  }

  ngOnInit() { this.load(); }
  load() {
    this.api.get<any>('/custom-fields').subscribe({
      next: (r) => this.all.set(this.arr(r).map((f: any) => this.norm(f))),
      error: () => this.all.set([]),
    });
  }

  typeLabel(t: string) { return this.fieldTypes.find(x => x.value === t)?.label || t; }
  typeIcon(t: string) {
    return ({ text: 'pi-pencil', textarea: 'pi-align-left', number: 'pi-hashtag', date: 'pi-calendar', select: 'pi-list', boolean: 'pi-check-square', phone: 'pi-phone', email: 'pi-envelope' } as any)[t] || 'pi-pencil';
  }

  openNew() {
    this.model = { entity: this.entity(), label: '', field_type: 'text', is_required: false, collect_from_customer: false, is_active: true };
    this.optionsText = '';
    this.dialogVisible = true;
  }
  openEdit(f: FieldDef) {
    this.model = { ...f };
    this.optionsText = (f.options || []).join(', ');
    this.dialogVisible = true;
  }

  save() {
    const m = this.model;
    if (!m?.label?.trim() || this.saving()) return;
    this.saving.set(true);
    const body: any = {
      entity: this.entity(),
      label: m.label.trim(),
      fieldType: m.field_type,
      options: m.field_type === 'select' ? this.optionsText.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      helpText: m.help_text || undefined,
      isRequired: !!m.is_required,
      collectFromCustomer: this.entity() === 'customer' ? !!m.collect_from_customer : false,
      isActive: m.is_active !== false,
    };
    const req = m.id ? this.api.put<any>(`/custom-fields/${m.id}`, body) : this.api.post<any>('/custom-fields', body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.toast.add({ severity: 'success', summary: m.id ? 'Field updated' : 'Field added' });
        this.load();
      },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Could not save', detail: e?.error?.message }); },
    });
  }

  remove(f: FieldDef) {
    if (!confirm(`Delete the "${f.label}" field? Existing values stay on records but the field is removed.`)) return;
    this.api.delete<any>(`/custom-fields/${f.id}`).subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: 'Field deleted' }); this.load(); },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Could not delete', detail: e?.error?.message }),
    });
  }
}
