import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ErpService } from '../../../core/services/erp.service';
import { ApiService } from '../../../core/services/api.service';
import { PartyPickerComponent } from '../../entry/party-picker.component';
import { ProductPickerComponent, PickedProduct } from '../../entry/product-picker.component';
import { CustomerContext, SupplierContext } from '../../../core/services/entry.service';

interface Line { productId?: string; description: string; quantity: number; unitPrice: number; }

/**
 * Full-screen "New Invoice" — same two-column layout as the Order / Quote forms
 * (customer + line items on the left, details + summary on the right), using the
 * shared party-picker + product-picker so it behaves exactly like the ERP.
 */
@Component({
  selector: 'wa-erp-invoice-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    ButtonModule, InputTextModule, InputNumberModule, SelectModule, ToastModule,
    PartyPickerComponent, ProductPickerComponent,
  ],
  providers: [MessageService],
  template: `
    <div class="p-4 max-w-5xl mx-auto">
      <p-toast />

      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <button pButton icon="pi pi-arrow-left" class="p-button-text p-button-rounded" routerLink="/erp/invoices"></button>
          <div>
            <h2 class="text-2xl font-bold text-gray-900">New invoice</h2>
            <p class="text-sm text-gray-500 mt-0.5">Create an invoice for a customer</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- Main -->
        <div class="lg:col-span-2 space-y-5">
          <!-- Customer -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 class="text-base font-semibold text-gray-900">Bill to</h3>
            <wa-party-picker (selected)="onParty($event)" (cleared)="onPartyCleared()"
                             placeholder="Type customer name / phone / GSTIN…" />
          </div>

          <!-- Line items -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-base font-semibold text-gray-900">Line items</h3>
              <button pButton label="Add item" icon="pi pi-plus" class="p-button-text p-button-sm" (click)="addItem()"></button>
            </div>

            <div class="flex gap-2 items-center mb-1 px-0.5 text-[11px] font-semibold text-gray-400 uppercase">
              <span class="flex-1">Item / description</span>
              <span class="w-16 text-center">Qty</span>
              <span class="w-28 text-center">Rate</span>
              <span class="w-24 text-right">Amount</span>
              <span class="w-8"></span>
            </div>

            <div class="space-y-2">
              @for (item of items; track $index; let i = $index) {
                <div class="flex items-center gap-2">
                  <div class="flex-1 min-w-0">
                    <wa-product-picker [name]="item.description" (nameChange)="item.description = $event"
                                       [customerId]="customerId" mode="sale"
                                       (picked)="onProductPicked(i, $event)" />
                  </div>
                  <div class="w-16 shrink-0"><p-inputNumber [(ngModel)]="item.quantity" [min]="1" (onInput)="recalc()" styleClass="w-full" inputStyleClass="w-full text-center" /></div>
                  <div class="w-28 shrink-0"><p-inputNumber [(ngModel)]="item.unitPrice" [min]="0" mode="currency" [currency]="form.currency || 'INR'" locale="en-IN" (onInput)="recalc()" styleClass="w-full" inputStyleClass="w-full" /></div>
                  <span class="w-24 text-right text-sm font-semibold tabular-nums shrink-0">{{ sym() }}{{ (item.quantity * item.unitPrice) | number:'1.0-2' }}</span>
                  <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-rounded p-button-danger shrink-0" (click)="removeItem(i)" [disabled]="items.length === 1"></button>
                </div>
              }
            </div>

            <textarea [(ngModel)]="note" rows="2" class="w-full mt-4 border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Note shown on the invoice (optional)"></textarea>
          </div>
        </div>

        <!-- Right: details + summary -->
        <div class="space-y-5">
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 class="text-base font-semibold text-gray-900">Invoice details</h3>
            @if (currencies().length > 1) {
              <div>
                <label class="text-xs font-medium text-gray-500">Currency</label>
                <p-select [options]="currencies()" [(ngModel)]="form.currency" optionLabel="code" optionValue="code" styleClass="w-full" appendTo="body" />
              </div>
            }
            @if (branches().length) {
              <div>
                <label class="text-xs font-medium text-gray-500">Branch</label>
                <p-select [options]="branches()" [(ngModel)]="form.branchId" optionLabel="name" optionValue="id" [showClear]="true" styleClass="w-full" placeholder="No branch" appendTo="body" />
              </div>
            }
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-medium text-gray-500">Tax %</label>
                <p-inputNumber [(ngModel)]="form.taxRatePct" [min]="0" [max]="100" suffix="%" (onInput)="recalc()" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
              </div>
              <div>
                <label class="text-xs font-medium text-gray-500">Discount ({{ sym() }})</label>
                <p-inputNumber [(ngModel)]="form.discount" [min]="0" (onInput)="recalc()" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Due date</label>
              <input type="date" [(ngModel)]="form.dueDate" class="w-full border border-gray-300 rounded-md px-2 py-2 text-sm" />
            </div>
          </div>

          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-1.5 text-sm">
            <h3 class="text-base font-semibold text-gray-900 mb-2">Summary</h3>
            <div class="flex justify-between text-gray-600"><span>Subtotal</span><span class="tabular-nums">{{ sym() }}{{ subtotal() | number:'1.2-2' }}</span></div>
            @if (form.discount > 0) { <div class="flex justify-between text-green-700"><span>Discount</span><span class="tabular-nums">-{{ sym() }}{{ form.discount | number:'1.2-2' }}</span></div> }
            @if (taxAmount() > 0) { <div class="flex justify-between text-gray-600"><span>Tax</span><span class="tabular-nums">{{ sym() }}{{ taxAmount() | number:'1.2-2' }}</span></div> }
            <div class="flex justify-between font-bold text-base pt-1.5 border-t border-gray-100"><span>Total</span><span class="tabular-nums">{{ sym() }}{{ total() | number:'1.2-2' }}</span></div>
            <button pButton class="w-full mt-3" [label]="saving() ? 'Creating…' : 'Create invoice'"
              icon="pi pi-check" severity="success" [disabled]="!canSave() || saving()" (click)="save()"></button>
            <button pButton class="w-full" label="Cancel" icon="pi pi-times" severity="secondary" [outlined]="true" routerLink="/erp/invoices"></button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ErpInvoiceFormComponent implements OnInit {
  private readonly erp = inject(ErpService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  saving = signal(false);
  currencies = signal<any[]>([]);
  branches = signal<any[]>([]);

  customerId = '';
  note = '';
  items: Line[] = [{ description: '', quantity: 1, unitPrice: 0 }];
  form = { customerName: '', customerPhone: '', taxRatePct: 0, discount: 0, dueDate: '', currency: '', branchId: '' };

  subtotal = signal(0);
  taxAmount = computed(() => {
    const taxable = Math.max(0, this.subtotal() - (Number(this.form.discount) || 0));
    return taxable * ((Number(this.form.taxRatePct) || 0) / 100);
  });
  total = computed(() => Math.max(0, this.subtotal() - (Number(this.form.discount) || 0)) + this.taxAmount());

  ngOnInit() {
    this.erp.listCurrencies().subscribe({ next: (r) => this.currencies.set(r.data || []) });
    this.api.get<any>('/erp/branches', { limit: 200 }).subscribe({ next: (r) => this.branches.set(r?.data || []) });
  }

  sym(): string {
    const list = this.currencies();
    const cur = list.find((c) => c.code === this.form.currency) || list.find((c) => c.isBase);
    return cur?.symbol || '₹';
  }

  onParty(ctx: CustomerContext | SupplierContext) {
    this.customerId = ctx.id;
    this.form.customerName = ctx.name;
    this.form.customerPhone = (ctx as CustomerContext).phone || '';
  }
  onPartyCleared() { this.customerId = ''; this.form.customerName = ''; this.form.customerPhone = ''; }

  addItem() { this.items.push({ description: '', quantity: 1, unitPrice: 0 }); }
  removeItem(i: number) { this.items.splice(i, 1); this.recalc(); }
  onProductPicked(i: number, p: PickedProduct) {
    const item = this.items[i];
    item.productId = p.id;
    item.description = p.name;
    item.unitPrice = p.rate || item.unitPrice;
    this.recalc();
  }

  recalc() { this.subtotal.set(this.items.reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0), 0)); }

  canSave(): boolean {
    return !!this.customerId && this.items.some(i => i.description && i.quantity > 0);
  }

  save() {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    const items = this.items.filter(i => i.description && i.quantity > 0);
    this.erp.createInvoice({
      customerId: this.customerId || undefined,
      customerName: this.form.customerName || undefined,
      customerPhone: this.form.customerPhone || undefined,
      items: items.map(l => ({ productId: l.productId, description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      taxRate: (Number(this.form.taxRatePct) || 0) / 100,
      discount: Number(this.form.discount) || 0,
      currency: this.form.currency || undefined,
      branchId: this.form.branchId || undefined,
      dueDate: this.form.dueDate || undefined,
      note: this.note || undefined,
    }).subscribe({
      next: (inv) => {
        this.saving.set(false);
        this.toast.add({ severity: 'success', summary: 'Invoice created', detail: inv.invoiceNumber });
        this.router.navigate(['/erp/invoices']);
      },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Create failed', detail: e?.error?.error?.message || 'Error' }); },
    });
  }
}
