import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { SchemeService, Scheme } from '../../core/services/scheme.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-schemes',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule, SelectModule, MultiSelectModule,
    InputTextModule, InputNumberModule, ToggleSwitchModule, TagModule, ToastModule, TextareaModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-6xl mx-auto">
      <p-toast />

      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Schemes & Offers</h1>
          <p class="text-gray-500 text-sm mt-1">Create discounts that auto-apply to the cart. More types (BOGO, loyalty, coupons) coming next.</p>
        </div>
        <button pButton label="New Scheme" icon="pi pi-plus" severity="success" (click)="openNew()"></button>
      </div>

      @if (loading()) {
        <div class="text-center py-20"><i class="pi pi-spin pi-spinner text-4xl text-gray-300"></i></div>
      } @else if (!schemes().length) {
        <div class="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <i class="pi pi-percentage text-gray-200" style="font-size:2.5rem"></i>
          <h3 class="text-lg font-semibold text-gray-700 mt-3">No schemes yet</h3>
          <p class="text-gray-400 text-sm mt-1">Create your first offer — e.g. 10% off a category — and it auto-applies in the cart.</p>
          <button pButton label="New Scheme" icon="pi pi-plus" class="mt-4" severity="success" (click)="openNew()"></button>
        </div>
      } @else {
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          @for (s of schemes(); track s.id) {
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="font-semibold text-gray-900 truncate">{{ s.name }}</h3>
                    <p-tag [value]="s.status" [severity]="s.status === 'active' ? 'success' : 'secondary'" styleClass="text-xs capitalize" />
                    @if (s.combinable) { <span class="text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">combinable</span> }
                  </div>
                  <p class="text-sm text-gray-500 mt-1">{{ describe(s) }}</p>
                  <p class="text-xs text-gray-400 mt-2">Priority weight: {{ s.weight }}{{ s.audience === 'specific' ? ' · targeted' : '' }}</p>
                </div>
                <span class="text-lg font-extrabold text-green-700 whitespace-nowrap">{{ badge(s) }}</span>
              </div>
              <div class="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">
                <button pButton [label]="s.status === 'active' ? 'Pause' : 'Activate'" [icon]="s.status === 'active' ? 'pi pi-pause' : 'pi pi-play'" class="p-button-text p-button-sm" (click)="toggle(s)"></button>
                <button pButton label="Edit" icon="pi pi-pencil" class="p-button-text p-button-sm" (click)="openEdit(s)"></button>
                <button pButton label="Delete" icon="pi pi-trash" class="p-button-text p-button-sm" severity="danger" (click)="remove(s)"></button>
              </div>
            </div>
          }
        </div>
      }

      <!-- Create / edit dialog -->
      <p-dialog [(visible)]="dialogOpen" [header]="form.id ? 'Edit Scheme' : 'New Scheme'" [modal]="true" [style]="{width: '540px'}" [dismissableMask]="true">
        <div class="space-y-4 py-1">
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Name *</label>
            <input pInputText [(ngModel)]="form.name" class="w-full" placeholder="e.g. Diwali 10% off Electronics" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Description</label>
            <textarea pTextarea [(ngModel)]="form.description" rows="2" class="w-full" placeholder="Shown to customers (optional)"></textarea>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Discount type</label>
              <p-select [(ngModel)]="form.discountType" [options]="discountTypes" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">{{ form.discountType === 'amount' ? 'Amount (₹) *' : 'Percent (%) *' }}</label>
              <p-inputNumber [(ngModel)]="form.discountValue" [min]="0" [max]="form.discountType === 'percent' ? 100 : 9999999" styleClass="w-full" inputStyleClass="w-full" />
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Applies to</label>
            <p-select [(ngModel)]="form.scope" [options]="scopes" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" (onChange)="form.scopeIds = []" />
          </div>
          @if (form.scope === 'category') {
            <p-multiSelect [(ngModel)]="form.scopeIds" [options]="categories()" optionLabel="name" optionValue="id" placeholder="Select categories" styleClass="w-full" appendTo="body" [filter]="true" />
          } @else if (form.scope === 'brand') {
            <p-multiSelect [(ngModel)]="form.scopeIds" [options]="brands()" optionLabel="name" optionValue="id" placeholder="Select brands" styleClass="w-full" appendTo="body" [filter]="true" />
          } @else if (form.scope === 'product') {
            <p-multiSelect [(ngModel)]="form.scopeIds" [options]="products()" optionLabel="name" optionValue="id" placeholder="Select products" styleClass="w-full" appendTo="body" [filter]="true" />
          }

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Min qty <span class="text-gray-300">(optional)</span></label>
              <p-inputNumber [(ngModel)]="form.minQty" [min]="0" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Min cart ₹ <span class="text-gray-300">(optional)</span></label>
              <p-inputNumber [(ngModel)]="form.minCartValue" [min]="0" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 items-end">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Priority weight</label>
              <p-inputNumber [(ngModel)]="form.weight" [min]="0" styleClass="w-full" inputStyleClass="w-full" />
              <p class="text-[10px] text-gray-400 mt-1">Higher wins when offers don't combine.</p>
            </div>
            <div class="flex items-center gap-2 pb-2">
              <p-toggleSwitch [(ngModel)]="form.combinable" />
              <span class="text-sm text-gray-600">Combine with other offers</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Valid from <span class="text-gray-300">(optional)</span></label>
              <input type="date" [(ngModel)]="form.validFrom" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Valid until <span class="text-gray-300">(optional)</span></label>
              <input type="date" [(ngModel)]="form.validUntil" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <ng-template pTemplate="footer">
          <button pButton label="Cancel" class="p-button-outlined" (click)="dialogOpen = false"></button>
          <button pButton [label]="saving() ? 'Saving…' : 'Save Scheme'" severity="success" [disabled]="saving() || !valid()" (click)="save()"></button>
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class SchemesComponent implements OnInit {
  private readonly svc = inject(SchemeService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  loading = signal(true);
  saving = signal(false);
  schemes = signal<Scheme[]>([]);
  categories = signal<any[]>([]);
  brands = signal<any[]>([]);
  products = signal<any[]>([]);

  dialogOpen = false;
  discountTypes = [{ label: 'Percent (%)', value: 'percent' }, { label: 'Flat amount (₹)', value: 'amount' }];
  scopes = [
    { label: 'All products', value: 'all' },
    { label: 'Specific categories', value: 'category' },
    { label: 'Specific brands', value: 'brand' },
    { label: 'Specific products', value: 'product' },
  ];

  form: any = this.blankForm();

  ngOnInit() {
    this.load();
    this.api.get<any>('/categories').subscribe({ next: (r) => this.categories.set(this.arr(r)) });
    this.api.get<any>('/brands').subscribe({ next: (r) => this.brands.set(this.arr(r)) });
    this.api.get<any>('/products', { limit: 500 } as any).subscribe({ next: (r) => this.products.set(this.arr(r).map((p: any) => ({ id: p.id, name: p.name }))) });
  }

  private arr(r: any): any[] { return Array.isArray(r) ? r : (r?.data ?? r?.items ?? []); }

  load() {
    this.loading.set(true);
    this.svc.list().subscribe({
      next: (s) => { this.schemes.set((s || []).map(this.normalize)); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  private normalize = (s: any): Scheme => ({
    ...s,
    scopeIds: s.scopeIds ?? s.scope_ids ?? [],
    conditions: typeof s.conditions === 'string' ? JSON.parse(s.conditions) : (s.conditions || {}),
    validFrom: s.validFrom ?? s.valid_from ?? null,
    validUntil: s.validUntil ?? s.valid_until ?? null,
  });

  blankForm() {
    return {
      id: '', name: '', description: '', discountType: 'percent', discountValue: 10,
      scope: 'all', scopeIds: [] as string[], minQty: null, minCartValue: null,
      weight: 0, combinable: false, validFrom: '', validUntil: '',
    };
  }

  valid(): boolean {
    return !!this.form.name?.trim() && Number(this.form.discountValue) > 0 &&
      (this.form.scope === 'all' || (this.form.scopeIds && this.form.scopeIds.length > 0));
  }

  openNew() { this.form = this.blankForm(); this.dialogOpen = true; }

  openEdit(s: Scheme) {
    this.form = {
      id: s.id, name: s.name, description: s.description || '',
      discountType: s.conditions?.discountType || 'percent',
      discountValue: s.conditions?.discountValue ?? 0,
      scope: s.scope, scopeIds: [...(s.scopeIds || [])],
      minQty: s.conditions?.minQty ?? null, minCartValue: s.conditions?.minCartValue ?? null,
      weight: s.weight ?? 0, combinable: !!s.combinable,
      validFrom: (s.validFrom || '').slice(0, 10), validUntil: (s.validUntil || '').slice(0, 10),
    };
    this.dialogOpen = true;
  }

  save() {
    const payload: Partial<Scheme> = {
      name: this.form.name.trim(), description: this.form.description?.trim() || undefined,
      type: 'instant', action: 'discount', scope: this.form.scope,
      scopeIds: this.form.scope === 'all' ? [] : this.form.scopeIds,
      conditions: {
        discountType: this.form.discountType, discountValue: Number(this.form.discountValue) || 0,
        ...(this.form.minQty ? { minQty: Number(this.form.minQty) } : {}),
        ...(this.form.minCartValue ? { minCartValue: Number(this.form.minCartValue) } : {}),
      },
      weight: Number(this.form.weight) || 0, combinable: !!this.form.combinable, audience: 'all',
      validFrom: this.form.validFrom || null, validUntil: this.form.validUntil || null,
      status: 'active',
    };
    this.saving.set(true);
    const obs = this.form.id ? this.svc.update(this.form.id, payload) : this.svc.create(payload);
    obs.subscribe({
      next: () => { this.saving.set(false); this.dialogOpen = false; this.load(); this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Scheme saved.' }); },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.message || 'Could not save scheme.' }); },
    });
  }

  toggle(s: Scheme) {
    this.svc.setStatus(s.id, s.status === 'active' ? 'paused' : 'active').subscribe({ next: () => this.load() });
  }

  remove(s: Scheme) {
    this.svc.delete(s.id).subscribe({ next: () => { this.load(); this.toast.add({ severity: 'success', summary: 'Deleted', detail: 'Scheme removed.' }); } });
  }

  badge(s: Scheme): string {
    const c = s.conditions || {};
    return c.discountType === 'amount' ? `₹${c.discountValue} OFF` : `${c.discountValue || 0}% OFF`;
  }

  describe(s: Scheme): string {
    const scopeText = s.scope === 'all' ? 'all products'
      : s.scope === 'category' ? `${(s.scopeIds || []).length} category(ies)`
      : s.scope === 'brand' ? `${(s.scopeIds || []).length} brand(s)`
      : `${(s.scopeIds || []).length} product(s)`;
    const cond = [];
    if (s.conditions?.minQty) cond.push(`min ${s.conditions.minQty} qty`);
    if (s.conditions?.minCartValue) cond.push(`min ₹${s.conditions.minCartValue} cart`);
    return `On ${scopeText}${cond.length ? ' · ' + cond.join(', ') : ''}`;
  }
}
