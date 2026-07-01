import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/services/api.service';

interface RelatedDoc { id: string; invoiceNumber: string; docType: string; }
interface InvoiceRow {
  id: string; order_id: string; invoice_number: string; doc_type: string;
  customer_name: string; customer_phone: string; total: number; total_tax: number;
  currency: string; issued_at: string; status?: string; payment_status?: string; related?: RelatedDoc[];
}
interface Picklist { id: string; name: string; phone?: string; price?: number; }
interface OrderPick { id: string; label: string; total: number; status: string; }
interface Line { productId: string | null; description: string; quantity: number; unitPrice: number; }

@Component({
  selector: 'wa-invoices',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, SelectModule, InputTextModule, InputNumberModule,
    TextareaModule, ToggleSwitchModule, TableModule, TagModule, ToastModule, IconFieldModule, InputIconModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-6 max-w-6xl mx-auto">
      <p-toast />

      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Invoices</h1>
          <p class="text-gray-500 text-sm">Issue GST invoices, bills of supply & delivery challans — straight to the customer.</p>
        </div>
        @if (view() === 'list') {
          <div class="flex items-center gap-2">
            <button pButton label="Create on WhatsApp" icon="pi pi-whatsapp" class="p-button-outlined" [loading]="mintingLink()" (click)="createOnWhatsApp()"></button>
            <button pButton label="New Invoice" icon="pi pi-plus" severity="success" (click)="startCreate()"></button>
          </div>
        } @else {
          <button pButton label="Back to invoices" icon="pi pi-arrow-left" class="p-button-outlined p-button-sm" (click)="view.set('list')"></button>
        }
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        @for (t of tabs; track t.value) {
          <button class="text-sm font-semibold rounded-lg py-1.5 px-4 border-0 cursor-pointer transition-all"
            [class.bg-white]="view()===t.value" [class.shadow-sm]="view()===t.value" [class.text-primary-600]="view()===t.value"
            [class.bg-transparent]="view()!==t.value" [class.text-gray-500]="view()!==t.value"
            (click)="view.set(t.value)">{{ t.label }}</button>
        }
      </div>

      <!-- ───────────────── LIST ───────────────── -->
      @if (view() === 'list') {
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ invoices().length }}</p>
            <p class="text-xs text-gray-500 mt-1">Total invoices</p>
          </div>
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ sym() }}{{ totalBilled() | number:'1.0-0' }}</p>
            <p class="text-xs text-gray-500 mt-1">Total billed</p>
          </div>
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ sym() }}{{ totalTax() | number:'1.0-0' }}</p>
            <p class="text-xs text-gray-500 mt-1">GST collected</p>
          </div>
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p class="text-2xl font-bold text-gray-900 tabular-nums leading-none">{{ taxInvoiceCount() }}</p>
            <p class="text-xs text-gray-500 mt-1">Tax invoices</p>
          </div>
        </div>

        <!-- Filters: document type + payment status -->
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <p-select [(ngModel)]="docTypeFilter" [options]="docTypeFilterOptions" optionLabel="label" optionValue="value" placeholder="All document types" styleClass="w-full sm:w-56" appendTo="body" />
          <p-select [(ngModel)]="paymentFilter" [options]="paymentFilterOptions" optionLabel="label" optionValue="value" placeholder="All payments" styleClass="w-full sm:w-48" appendTo="body" />
          @if (docTypeFilter || paymentFilter) {
            <button pButton label="Reset" icon="pi pi-filter-slash" class="p-button-text p-button-sm" (click)="resetFilters()"></button>
            <span class="text-xs text-gray-400 ml-auto">{{ filteredInvoices().length }} of {{ invoices().length }}</span>
          }
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <p-table [value]="filteredInvoices()" [loading]="loading()" dataKey="id" styleClass="text-sm"
            [scrollable]="true" scrollHeight="56vh"
            [paginator]="filteredInvoices().length > 15" [rows]="15" [rowsPerPageOptions]="[15, 30, 50]">
            <ng-template pTemplate="header">
              <tr>
                <th class="text-xs text-gray-500 font-medium">Invoice #</th>
                <th class="text-xs text-gray-500 font-medium">Type</th>
                <th class="text-xs text-gray-500 font-medium">Customer</th>
                <th class="text-xs text-gray-500 font-medium">Payment</th>
                <th class="text-xs text-gray-500 font-medium">GST</th>
                <th class="text-xs text-gray-500 font-medium">Total</th>
                <th class="text-xs text-gray-500 font-medium">Issued</th>
                <th class="text-xs text-gray-500 font-medium text-right">Actions</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-inv>
              <tr class="hover:bg-gray-50">
                <td class="font-mono font-semibold text-primary-600">{{ inv.invoice_number }}</td>
                <td>
                  <p-tag [value]="docLabel(inv.doc_type)" [severity]="inv.doc_type === 'tax_invoice' ? 'success' : 'secondary'" styleClass="text-xs" />
                  @if (inv.related?.length) {
                    <div class="flex flex-wrap gap-1 mt-1">
                      @for (rl of inv.related; track rl.id) {
                        <button class="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 rounded px-1.5 py-0.5 inline-flex items-center gap-1" (click)="downloadById(rl.id)" [title]="'Download ' + docLabel(rl.docType) + ' ' + rl.invoiceNumber">
                          <i class="pi pi-link" style="font-size:0.5rem"></i>{{ docLabel(rl.docType) }}
                        </button>
                      }
                    </div>
                  }
                </td>
                <td>
                  <p class="font-medium text-gray-900">{{ inv.customer_name || '—' }}</p>
                  <p class="text-xs text-gray-400">{{ inv.customer_phone }}</p>
                </td>
                <td><p-tag [value]="inv.payment_status || 'pending'" [severity]="paySeverity(inv.payment_status)" styleClass="text-xs capitalize" /></td>
                <td class="text-gray-600 tabular-nums">{{ sym() }}{{ inv.total_tax | number:'1.2-2' }}</td>
                <td class="font-semibold text-gray-900 tabular-nums">{{ sym() }}{{ inv.total | number:'1.2-2' }}</td>
                <td class="text-gray-500 text-xs">{{ inv.issued_at | date:'mediumDate' }}</td>
                <td class="text-right whitespace-nowrap">
                  <button pButton icon="pi pi-download" class="p-button-text p-button-sm p-button-rounded" pTooltip="Download PDF" (click)="downloadPdf(inv)"></button>
                  <button pButton icon="pi pi-eye" class="p-button-text p-button-sm p-button-rounded" pTooltip="View order" (click)="viewOrder(inv)"></button>
                </td>
              </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
              <tr><td colspan="8">
                <div class="text-center py-12">
                  <i class="pi pi-file text-gray-200" style="font-size:2.5rem"></i>
                  <p class="text-base font-semibold text-gray-700 mt-3">No invoices yet</p>
                  <p class="text-sm text-gray-400 mt-1">Create your first invoice and send it straight to the customer.</p>
                  <button pButton label="New Invoice" icon="pi pi-plus" class="mt-4" severity="success" (click)="startCreate()"></button>
                </div>
              </td></tr>
            </ng-template>
          </p-table>
        </div>
      }

      <!-- ───────────────── CREATE ───────────────── -->
      @if (view() === 'create') {
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div class="lg:col-span-2 space-y-5">

            <!-- Mode -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div class="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-1">
                <button class="text-sm font-semibold rounded-lg py-1.5 px-4 border-0 cursor-pointer transition-all"
                  [class.bg-white]="mode()==='new'" [class.shadow-sm]="mode()==='new'" [class.text-primary-600]="mode()==='new'" [class.text-gray-500]="mode()!=='new'"
                  (click)="mode.set('new')">⚡ Quick create</button>
                <button class="text-sm font-semibold rounded-lg py-1.5 px-4 border-0 cursor-pointer transition-all"
                  [class.bg-white]="mode()==='existing'" [class.shadow-sm]="mode()==='existing'" [class.text-primary-600]="mode()==='existing'" [class.text-gray-500]="mode()!=='existing'"
                  (click)="mode.set('existing')">📦 From existing order</button>
              </div>
              <p class="text-xs text-gray-400 px-1">
                {{ mode() === 'new' ? 'Build an order, set its status, and issue the invoice in one step.' : 'Issue an invoice for an order you already have.' }}
              </p>
            </div>

            @if (mode() === 'new') {
              <!-- Customer + line items -->
              <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
                <h3 class="text-base font-semibold text-gray-900">Bill to</h3>
                <p-select [(ngModel)]="customerId" [options]="customers()" optionLabel="name" optionValue="id"
                  placeholder="Select a customer" styleClass="w-full" [filter]="true" appendTo="body" />
              </div>

              <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-base font-semibold text-gray-900">Line items</h3>
                  <button pButton label="Add item" icon="pi pi-plus" class="p-button-text p-button-sm" (click)="addLine()"></button>
                </div>
                <div class="space-y-2.5">
                  @for (l of lines(); track $index; let i = $index) {
                    <div class="flex flex-wrap items-start gap-2 p-2.5 bg-gray-50 rounded-xl">
                      <div class="flex-1 min-w-[10rem]">
                        <p-select [ngModel]="l.productId" (ngModelChange)="onProduct(i, $event)" [options]="products()" optionLabel="name" optionValue="id"
                          placeholder="Pick a product (optional)" styleClass="w-full" [filter]="true" [showClear]="true" appendTo="body" />
                        <input pInputText [(ngModel)]="l.description" class="w-full mt-1.5 text-sm" placeholder="Description" />
                      </div>
                      <div class="w-16">
                        <label class="text-[10px] text-gray-400 font-medium">Qty</label>
                        <p-inputNumber [(ngModel)]="l.quantity" [min]="1" (onInput)="recalc()" styleClass="w-full" inputStyleClass="w-full text-center" />
                      </div>
                      <div class="w-28">
                        <label class="text-[10px] text-gray-400 font-medium">Unit price</label>
                        <p-inputNumber [(ngModel)]="l.unitPrice" [min]="0" mode="currency" [currency]="currency()" locale="en-IN" (onInput)="recalc()" styleClass="w-full" inputStyleClass="w-full" />
                      </div>
                      <div class="flex flex-col items-end pt-4">
                        <span class="text-sm font-semibold tabular-nums">{{ sym() }}{{ (l.quantity * l.unitPrice) | number:'1.0-2' }}</span>
                        @if (lines().length > 1) {
                          <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-rounded p-button-danger -mr-1" (click)="removeLine(i)"></button>
                        }
                      </div>
                    </div>
                  }
                </div>
                <div class="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <label class="text-xs font-medium text-gray-500">Discount ({{ sym() }})</label>
                    <p-inputNumber [(ngModel)]="discount" [min]="0" (onInput)="recalc()" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
                  </div>
                  <div>
                    <label class="text-xs font-medium text-gray-500">Delivery fee ({{ sym() }})</label>
                    <p-inputNumber [(ngModel)]="deliveryFee" [min]="0" (onInput)="recalc()" styleClass="w-full" inputStyleClass="w-full" placeholder="0" />
                  </div>
                </div>
                <textarea pTextarea [(ngModel)]="notes" rows="2" class="w-full mt-3" placeholder="Notes for this order (optional)"></textarea>
              </div>
            } @else {
              <!-- Existing order -->
              <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
                <h3 class="text-base font-semibold text-gray-900">Choose an order</h3>
                <p-select [(ngModel)]="existingOrderId" [options]="orders()" optionLabel="label" optionValue="id"
                  placeholder="Select an order to invoice" styleClass="w-full" [filter]="true" appendTo="body" />
                @if (selectedOrder(); as o) {
                  <div class="flex items-center justify-between bg-gray-50 rounded-xl p-3 text-sm">
                    <span class="text-gray-600">Order total</span>
                    <span class="font-bold text-gray-900">{{ sym() }}{{ o.total | number:'1.2-2' }}</span>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Right: document options + summary -->
          <div class="space-y-5">
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
              <h3 class="text-base font-semibold text-gray-900">Document</h3>
              <div>
                <label class="text-xs font-medium text-gray-500">Type</label>
                <p-select [(ngModel)]="docType" [options]="docTypes" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
                @if (docType === 'tax_invoice' && !hasGstin()) {
                  <p class="text-[11px] text-amber-600 mt-1.5"><i class="pi pi-exclamation-triangle mr-1"></i>Set your GSTIN in the Settings tab to issue a tax invoice.</p>
                }
              </div>
              @if (mode() === 'new') {
                <div>
                  <label class="text-xs font-medium text-gray-500">Order status</label>
                  <p-select [(ngModel)]="orderStatus" [options]="statuses" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
                </div>
              }
              <div>
                <label class="text-xs font-medium text-gray-500">Invoice number <span class="text-gray-300">(optional)</span></label>
                <input pInputText [(ngModel)]="invoiceNumber" class="w-full" placeholder="Auto" />
              </div>
              <div class="flex items-center justify-between pt-1">
                <div>
                  <p class="text-sm font-medium text-gray-900">Send to customer</p>
                  <p class="text-xs text-gray-400">Deliver the PDF on WhatsApp</p>
                </div>
                <p-toggleSwitch [(ngModel)]="sendToCustomer" />
              </div>
            </div>

            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-1.5 text-sm">
              <h3 class="text-base font-semibold text-gray-900 mb-2">Summary</h3>
              @if (mode() === 'new') {
                <div class="flex justify-between text-gray-600"><span>Subtotal</span><span class="tabular-nums">{{ sym() }}{{ subtotal() | number:'1.2-2' }}</span></div>
                @if (discount > 0) { <div class="flex justify-between text-green-700"><span>Discount</span><span class="tabular-nums">-{{ sym() }}{{ discount | number:'1.2-2' }}</span></div> }
                @if (deliveryFee > 0) { <div class="flex justify-between text-gray-600"><span>Delivery</span><span class="tabular-nums">{{ sym() }}{{ deliveryFee | number:'1.2-2' }}</span></div> }
                <div class="flex justify-between font-bold text-base pt-1.5 border-t border-gray-100"><span>Total</span><span class="tabular-nums">{{ sym() }}{{ grandTotal() | number:'1.2-2' }}</span></div>
                <p class="text-[11px] text-gray-400 pt-1">GST is calculated automatically on the invoice from each product's tax rate.</p>
              } @else if (selectedOrder(); as o) {
                <div class="flex justify-between font-bold text-base"><span>Order total</span><span class="tabular-nums">{{ sym() }}{{ o.total | number:'1.2-2' }}</span></div>
              }
              <button pButton class="w-full mt-3" [label]="submitting() ? 'Working…' : (sendToCustomer ? 'Create & send invoice' : 'Create invoice')"
                icon="pi pi-check" severity="success" [disabled]="!canSubmit() || submitting()" (click)="submit()"></button>
            </div>
          </div>
        </div>
      }

      <!-- ───────────────── SETTINGS ───────────────── -->
      @if (view() === 'settings') {
        <div class="max-w-2xl space-y-5">
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h3 class="text-base font-semibold text-gray-900">🧾 Business identity</h3>
            <div>
              <label class="text-xs font-medium text-gray-500">Legal / business name</label>
              <input pInputText [(ngModel)]="cfg.legalName" class="w-full" placeholder="As it appears on invoices" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-medium text-gray-500">GSTIN</label>
                <input pInputText [(ngModel)]="cfg.gstin" class="w-full font-mono" placeholder="27ABCDE1234F1Z5" />
              </div>
              <div>
                <label class="text-xs font-medium text-gray-500">State code</label>
                <input pInputText [(ngModel)]="cfg.stateCode" class="w-full" placeholder="27" />
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Registered address</label>
              <textarea pTextarea [(ngModel)]="cfg.address" rows="2" class="w-full" placeholder="Registered place of business"></textarea>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">State (place of supply)</label>
              <input pInputText [(ngModel)]="cfg.state" class="w-full" placeholder="e.g. Maharashtra" />
            </div>
          </div>

          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h3 class="text-base font-semibold text-gray-900">Numbering & defaults</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-medium text-gray-500">Invoice prefix</label>
                <input pInputText [(ngModel)]="cfg.prefix" class="w-full" placeholder="INV" />
              </div>
              <div>
                <label class="text-xs font-medium text-gray-500">Next number <span class="text-gray-300">(optional)</span></label>
                <input pInputText [(ngModel)]="cfg.nextNumber" class="w-full" placeholder="Auto" />
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Number format</label>
              <input pInputText [(ngModel)]="cfg.numberFormat" class="w-full font-mono text-sm" placeholder="{prefix}/{code}/{year}/{seq}" />
              <p class="text-[11px] text-gray-400 mt-1">Placeholders: {{ '{prefix} {code} {year} {fy} {seq}' }}</p>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Default document type</label>
              <p-select [(ngModel)]="cfg.defaultDocType" [options]="docTypes" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
            </div>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-900">Prices include GST</p>
                <p class="text-xs text-gray-400">Tax is back-calculated from the listed price.</p>
              </div>
              <p-toggleSwitch [(ngModel)]="cfg.priceIncludesGst" />
            </div>
          </div>

          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h3 class="text-base font-semibold text-gray-900">Footer & terms</h3>
            <div>
              <label class="text-xs font-medium text-gray-500">Terms & conditions</label>
              <textarea pTextarea [(ngModel)]="cfg.terms" rows="2" class="w-full" placeholder="Shown on the invoice PDF"></textarea>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Footer note</label>
              <input pInputText [(ngModel)]="cfg.footer" class="w-full" placeholder="Thank you for your business!" />
            </div>
          </div>

          <div class="flex justify-end">
            <button pButton label="Save invoice settings" icon="pi pi-check" severity="success" [loading]="savingCfg()" (click)="saveConfig()"></button>
          </div>
        </div>
      }
    </div>
  `,
})
export class InvoicesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  view = signal<'list' | 'create' | 'settings'>('list');
  mode = signal<'new' | 'existing'>('new');
  loading = signal(false);
  submitting = signal(false);
  savingCfg = signal(false);
  mintingLink = signal(false);

  tabs = [
    { label: 'All invoices', value: 'list' as const },
    { label: 'Create invoice', value: 'create' as const },
    { label: 'Settings', value: 'settings' as const },
  ];
  docTypes = [
    { label: 'Tax Invoice', value: 'tax_invoice' },
    { label: 'Bill of Supply', value: 'bill_of_supply' },
    { label: 'Delivery Challan', value: 'delivery_challan' },
  ];
  statuses = [
    { label: 'Pending', value: 'pending' },
    { label: 'Confirmed', value: 'confirmed' },
    { label: 'Processing', value: 'processing' },
    { label: 'Out for delivery', value: 'out_for_delivery' },
    { label: 'Delivered', value: 'delivered' },
  ];

  invoices = signal<InvoiceRow[]>([]);
  customers = signal<Picklist[]>([]);
  products = signal<Picklist[]>([]);
  orders = signal<OrderPick[]>([]);

  // create form
  customerId = '';
  lines = signal<Line[]>([{ productId: null, description: '', quantity: 1, unitPrice: 0 }]);
  discount = 0;
  deliveryFee = 0;
  notes = '';
  docType = 'tax_invoice';
  orderStatus = 'confirmed';
  invoiceNumber = '';
  sendToCustomer = true;
  existingOrderId = '';

  // settings
  cfg = {
    legalName: '', gstin: '', stateCode: '', address: '', state: '',
    prefix: 'INV', nextNumber: '', numberFormat: '{prefix}/{code}/{year}/{seq}',
    defaultDocType: 'tax_invoice', priceIncludesGst: true, terms: '', footer: '',
  };
  private _currency = signal('INR');

  subtotal = computed(() => this.lines().reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0));
  grandTotal = computed(() => Math.max(0, this.subtotal() - (Number(this.discount) || 0) + (Number(this.deliveryFee) || 0)));
  totalBilled = computed(() => this.invoices().reduce((s, i) => s + Number(i.total || 0), 0));
  totalTax = computed(() => this.invoices().reduce((s, i) => s + Number(i.total_tax || 0), 0));
  taxInvoiceCount = computed(() => this.invoices().filter(i => i.doc_type === 'tax_invoice').length);
  currency = computed(() => this._currency());
  hasGstin = computed(() => !!this.cfg.gstin?.trim());
  selectedOrder = computed(() => this.orders().find(o => o.id === this.existingOrderId) || null);

  sym(): string { const c = this._currency(); return c === 'USD' ? '$' : c === 'EUR' ? '€' : '₹'; }

  // ── List filters (document type + payment status) ──────────────────────────
  docTypeFilter = '';
  paymentFilter = '';
  docTypeFilterOptions = [
    { label: 'All document types', value: '' },
    { label: 'Tax Invoice', value: 'tax_invoice' },
    { label: 'Bill of Supply', value: 'bill_of_supply' },
    { label: 'Delivery Challan', value: 'delivery_challan' },
  ];
  paymentFilterOptions = [
    { label: 'All payments', value: '' },
    { label: 'Paid', value: 'paid' },
    { label: 'Pending', value: 'pending' },
    { label: 'Failed', value: 'failed' },
    { label: 'Refunded', value: 'refunded' },
  ];
  /** Re-runs each change-detection cycle so the table reflects the live filters. */
  filteredInvoices(): InvoiceRow[] {
    const dt = this.docTypeFilter, ps = this.paymentFilter;
    if (!dt && !ps) return this.invoices();
    return this.invoices().filter(i =>
      (!dt || i.doc_type === dt) && (!ps || (i.payment_status || 'pending') === ps));
  }
  resetFilters() { this.docTypeFilter = ''; this.paymentFilter = ''; }
  paySeverity(s?: string): 'success' | 'warn' | 'danger' | 'secondary' {
    const map: Record<string, 'success' | 'warn' | 'danger' | 'secondary'> = { paid: 'success', pending: 'warn', failed: 'danger', refunded: 'secondary' };
    return map[s || 'pending'] ?? 'secondary';
  }
  docLabel(t: string): string { return this.docTypes.find(d => d.value === t)?.label || t; }
  private arr(r: any): any[] { return Array.isArray(r) ? r : (r?.data ?? r?.items ?? []); }

  ngOnInit(): void {
    this.loadInvoices();
    this.loadPicklists();
    this.loadConfig();
  }

  loadInvoices() {
    this.loading.set(true);
    this.api.get<any>('/invoices').subscribe({
      next: (r) => {
        // API returns camelCase; the table reads snake_case — normalise both.
        this.invoices.set(this.arr(r).map((i: any) => ({
          id: i.id,
          order_id: i.order_id ?? i.orderId,
          invoice_number: i.invoice_number ?? i.invoiceNumber,
          doc_type: i.doc_type ?? i.docType,
          customer_name: i.customer_name ?? i.customerName,
          customer_phone: i.customer_phone ?? i.customerPhone,
          total: Number(i.total ?? 0),
          total_tax: Number(i.total_tax ?? i.totalTax ?? 0),
          currency: i.currency || 'INR',
          issued_at: i.issued_at ?? i.issuedAt,
          status: i.status,
          payment_status: i.payment_status ?? i.paymentStatus ?? 'pending',
          related: (i.related ?? []).map((rl: any) => ({ id: rl.id, invoiceNumber: rl.invoiceNumber ?? rl.invoice_number, docType: rl.docType ?? rl.doc_type })),
        })));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private loadPicklists() {
    this.api.get<any>('/customers', { limit: 500 } as any).subscribe({
      next: (r) => this.customers.set(this.arr(r).map((c: any) => ({
        id: c.id,
        name: `${c.displayName || c.whatsappName || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.whatsappPhone || 'Customer'}${c.whatsappPhone ? ' · ' + c.whatsappPhone : ''}`,
        phone: c.whatsappPhone,
      }))),
    });
    this.api.get<any>('/products', { limit: 500 } as any).subscribe({
      next: (r) => this.products.set(this.arr(r).map((p: any) => ({ id: p.id, name: p.name, price: Number(p.price) || 0 }))),
    });
    this.api.get<any>('/orders', { limit: 50 } as any).subscribe({
      next: (r) => this.orders.set(this.arr(r).map((o: any) => ({
        id: o.id,
        label: `${o.orderNumber || o.order_number} · ${o.customer?.firstName || o.customer || ''} · ₹${Number(o.totalAmount ?? o.total ?? 0).toLocaleString('en-IN')}`,
        total: Number(o.totalAmount ?? o.total ?? 0),
        status: o.status,
      }))),
    });
  }

  private loadConfig() {
    this.api.get<any>('/settings').subscribe({
      next: (s) => {
        const g = (k: string, d: any = '') => s?.[k] ?? d;
        this.cfg = {
          legalName: g('invoiceLegalName'), gstin: g('invoiceGstin'), stateCode: g('invoiceStateCode'),
          address: g('invoiceAddress'), state: g('invoiceState'), prefix: g('invoicePrefix', 'INV'),
          nextNumber: g('invoiceNextNumber'), numberFormat: g('invoiceNumberFormat', '{prefix}/{code}/{year}/{seq}'),
          defaultDocType: g('invoiceDefaultDocType', 'tax_invoice'), priceIncludesGst: g('invoicePriceIncludesGst', true) !== false,
          terms: g('invoiceTerms'), footer: g('invoiceFooter'),
        };
        this.docType = this.cfg.defaultDocType || 'tax_invoice';
        if (s?.businessCurrency) this._currency.set(s.businessCurrency);
      },
    });
  }

  startCreate() { this.mode.set('new'); this.view.set('create'); }

  /** Mint a token-secured invoice webview and open it (admin bills a customer from WhatsApp). */
  createOnWhatsApp() {
    if (this.mintingLink()) return;
    this.mintingLink.set(true);
    this.api.post<any>('/invoices/webview-session', {}).subscribe({
      next: (r) => {
        this.mintingLink.set(false);
        const url = r?.url || (r?.token ? `/m/invoice-builder?token=${r.token}` : null);
        if (url) window.open(url, '_blank');
        else this.toast.add({ severity: 'error', summary: 'Could not create link' });
      },
      error: (e) => { this.mintingLink.set(false); this.toast.add({ severity: 'error', summary: 'Could not create link', detail: e?.error?.message }); },
    });
  }

  addLine() { this.lines.update(l => [...l, { productId: null, description: '', quantity: 1, unitPrice: 0 }]); }
  removeLine(i: number) { this.lines.update(l => l.filter((_, idx) => idx !== i)); }
  onProduct(i: number, productId: string | null) {
    this.lines.update(lines => lines.map((l, idx) => {
      if (idx !== i) return l;
      const p = this.products().find(x => x.id === productId);
      return { ...l, productId, description: p?.name || l.description, unitPrice: p ? (p.price || 0) : l.unitPrice };
    }));
  }
  recalc() { this.lines.update(l => [...l]); } // nudge computed

  canSubmit(): boolean {
    if (this.mode() === 'new') return !!this.customerId && this.lines().some(l => l.description?.trim() && l.quantity > 0);
    return !!this.existingOrderId;
  }

  submit() {
    if (!this.canSubmit() || this.submitting()) return;
    this.submitting.set(true);

    if (this.mode() === 'new') {
      const body = {
        customerId: this.customerId,
        items: this.lines().filter(l => l.description?.trim()).map(l => ({
          productId: l.productId || undefined, productName: l.description, quantity: l.quantity, unitPrice: l.unitPrice,
        })),
        discount: Number(this.discount) || 0,
        deliveryFee: Number(this.deliveryFee) || 0,
        notes: this.notes || undefined,
        status: this.orderStatus,
        docType: this.docType,
        invoiceNumber: this.invoiceNumber?.trim() || undefined,
        send: this.sendToCustomer,
      };
      this.api.post<any>('/invoices/direct', body).subscribe({
        next: (r) => this.afterCreate(r),
        error: (e) => this.fail(e),
      });
    } else {
      const body = { docType: this.docType, invoiceNumber: this.invoiceNumber?.trim() || undefined };
      this.api.post<any>(`/orders/${this.existingOrderId}/invoice`, body).subscribe({
        next: (r) => this.afterCreate(r?.ok === false ? { reason: r.reason } : { invoiceNumber: r?.invoiceNumber, sent: true }),
        error: (e) => this.fail(e),
      });
    }
  }

  private afterCreate(r: any) {
    this.submitting.set(false);
    if (r?.reason) {
      this.toast.add({ severity: 'warn', summary: 'Invoice not issued', detail: r.reason, life: 6000 });
      return;
    }
    this.toast.add({
      severity: 'success', summary: r?.invoiceNumber ? `Invoice ${r.invoiceNumber}` : 'Invoice created',
      detail: r?.sent ? 'Sent to the customer on WhatsApp.' : 'Saved.',
    });
    this.resetForm();
    this.loadInvoices();
    this.loadPicklists();
    this.view.set('list');
  }
  private fail(e: any) {
    this.submitting.set(false);
    this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.message || 'Could not create the invoice.' });
  }
  private resetForm() {
    this.customerId = ''; this.lines.set([{ productId: null, description: '', quantity: 1, unitPrice: 0 }]);
    this.discount = 0; this.deliveryFee = 0; this.notes = ''; this.invoiceNumber = ''; this.existingOrderId = '';
  }

  // Desktop downloads inline; inside the WhatsApp webview it's sent to the chat.
  downloadPdf(inv: InvoiceRow) { this.deliverInvoice(inv.id, `invoice-${inv.invoice_number || inv.id}.pdf`); }
  downloadById(id: string) { this.deliverInvoice(id, `invoice-${id}.pdf`); }
  private deliverInvoice(id: string, filename: string) {
    this.api.deliverPdf({
      downloadPath: `/invoices/${id}/pdf`, filename,
      sendPath: `/m/doc-delivery/portal/invoice/${id}`,
      onSent: () => this.toast.add({ severity: 'success', summary: '📄 Sent to your WhatsApp', detail: 'Check your chat for the PDF' }),
      onError: (e: any) => this.toast.add({ severity: 'error', summary: 'Could not send', detail: e?.error?.message || 'Please try again' }),
    });
  }
  viewOrder(inv: InvoiceRow) { if (inv.order_id) window.open(`/orders/${inv.order_id}`, '_blank'); }

  saveConfig() {
    this.savingCfg.set(true);
    const body: Record<string, any> = {
      invoice_legal_name: this.cfg.legalName, invoice_gstin: this.cfg.gstin, invoice_state_code: this.cfg.stateCode,
      invoice_address: this.cfg.address, invoice_state: this.cfg.state, invoice_prefix: this.cfg.prefix,
      invoice_next_number: this.cfg.nextNumber ? Number(this.cfg.nextNumber) : null,
      invoice_number_format: this.cfg.numberFormat, invoice_default_doc_type: this.cfg.defaultDocType,
      invoice_price_includes_gst: this.cfg.priceIncludesGst, invoice_terms: this.cfg.terms, invoice_footer: this.cfg.footer,
    };
    this.api.put('/settings', body).subscribe({
      next: () => { this.savingCfg.set(false); this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Invoice settings updated.' }); },
      error: () => { this.savingCfg.set(false); this.toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save settings.' }); },
    });
  }
}
