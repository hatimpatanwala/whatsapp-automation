import { Component, OnInit, inject, signal, computed } from '@angular/core';
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
import { MessageService } from 'primeng/api';
import { ErpService, ErpInvoice, PaymentMode } from '../../../core/services/erp.service';
import { ApiService } from '../../../core/services/api.service';
import { ErpAccessService } from '../../../core/services/erp-access.service';

interface LineForm { description: string; quantity: number; unitPrice: number; }

@Component({
  selector: 'wa-erp-invoice-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonModule, TableModule, TagModule, SelectModule, InputTextModule, InputNumberModule,
    IconFieldModule, InputIconModule, ToastModule, TooltipModule, DialogModule,
  ],
  providers: [MessageService],
  template: `
    <div class="p-4 max-w-7xl mx-auto">
      <p-toast />

      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Invoices</h2>
          <p class="text-sm text-gray-500 mt-1">Create invoices, record payments and track receivables</p>
        </div>
        <div class="flex gap-2">
          @if (!access.readOnly()) {
            <p-button label="New Invoice" icon="pi pi-plus" (onClick)="openCreate()" />
          }
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        @for (s of statsCards(); track s.label) {
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div [class]="'flex items-center justify-center w-10 h-10 rounded-xl shrink-0 ' + s.iconBg">
              <i [class]="'pi ' + s.icon" style="font-size:1rem"></i>
            </div>
            <div class="min-w-0">
              <p class="text-xl font-bold text-gray-900 tabular-nums leading-none">{{ s.value }}</p>
              <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-1 truncate">{{ s.label }}</p>
            </div>
          </div>
        }
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div class="flex flex-wrap gap-3 items-center">
          <p-iconfield class="min-w-64">
            <p-inputicon styleClass="pi pi-search" />
            <input pInputText type="text" placeholder="Search invoices..." [(ngModel)]="searchTerm" class="w-full" />
          </p-iconfield>
          <p-select [options]="paymentStatusOptions" [(ngModel)]="selectedPaymentStatus" placeholder="All Payment Statuses"
            [showClear]="true" (onChange)="load()" styleClass="w-56" />
        </div>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p-table [value]="filtered()" [scrollable]="true" scrollHeight="56vh" [rows]="15" [paginator]="true"
          [rowsPerPageOptions]="[10, 15, 25, 50]" [loading]="loading()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th>Invoice #</th>
              <th>Customer</th>
              <th class="text-right">Total</th>
              <th class="text-right">Paid</th>
              <th class="text-right">Balance</th>
              <th>Status</th>
              <th>Issued</th>
              <th class="text-right">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-inv>
            <tr class="cursor-pointer hover:bg-gray-50" (click)="openDetail(inv)">
              <td class="font-mono text-sm font-semibold text-primary-600">{{ inv.invoiceNumber }}</td>
              <td>
                <div class="text-sm font-medium">{{ inv.customerName || 'N/A' }}</div>
                <div class="text-xs text-gray-400">{{ inv.customerPhone }}</div>
              </td>
              <td class="text-right font-semibold">{{ sym(inv.currency) }}{{ fmt(inv.total) }}</td>
              <td class="text-right text-green-600">{{ sym(inv.currency) }}{{ fmt(inv.amountPaid) }}</td>
              <td class="text-right" [class.text-red-600]="num(inv.balanceDue) > 0">{{ sym(inv.currency) }}{{ fmt(inv.balanceDue) }}</td>
              <td><p-tag [value]="inv.paymentStatus | titlecase" [severity]="statusSeverity(inv.paymentStatus)" /></td>
              <td class="text-sm text-gray-500">{{ (inv.issuedAt || inv.createdAt) | date:'mediumDate' }}</td>
              <td class="text-right" (click)="$event.stopPropagation()">
                <div class="flex gap-1 justify-end">
                  @if (inv.paymentStatus !== 'paid' && !access.readOnly()) {
                    <button pButton icon="pi pi-wallet" class="p-button-text p-button-sm p-button-success" pTooltip="Record Payment" (click)="openPayment(inv)"></button>
                    <button pButton icon="pi pi-bell" class="p-button-text p-button-sm p-button-warning" pTooltip="WhatsApp Reminder" (click)="remind(inv)"></button>
                  }
                  <button pButton icon="pi pi-eye" class="p-button-text p-button-sm" pTooltip="View" (click)="openDetail(inv)"></button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="8" class="text-center py-10 text-gray-400">
                <i class="pi pi-file text-4xl mb-3 block"></i>
                <p class="text-lg font-medium">No invoices yet</p>
                <p class="text-sm">Create your first invoice to get started</p>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>

      <!-- ─── Create Invoice dialog ─────────────────────────────────────── -->
      <p-dialog header="New Invoice" [(visible)]="showCreate" [modal]="true" [style]="{ width: '720px' }" [draggable]="false">
        <div class="flex flex-col gap-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Customer Name</label>
              <input pInputText [(ngModel)]="form.customerName" class="w-full" placeholder="e.g. Acme Corp" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Customer Phone</label>
              <input pInputText [(ngModel)]="form.customerPhone" class="w-full" placeholder="+9198..." />
            </div>
          </div>
          @if (branches().length) {
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Branch</label>
              <p-select [options]="branches()" [(ngModel)]="form.branchId" optionLabel="name" optionValue="id" [showClear]="true" styleClass="w-full" placeholder="No branch" />
            </div>
          }

          <!-- Line items -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Line Items</label>
              <button pButton icon="pi pi-plus" label="Add line" class="p-button-text p-button-sm" (click)="addLine()"></button>
            </div>
            <div class="flex flex-col gap-2">
              @for (line of form.items; track $index) {
                <div class="flex gap-2 items-center">
                  <input pInputText [(ngModel)]="line.description" placeholder="Description" class="flex-1" />
                  <p-inputNumber [(ngModel)]="line.quantity" [min]="1" placeholder="Qty" inputStyleClass="w-20" />
                  <p-inputNumber [(ngModel)]="line.unitPrice" mode="currency" currency="INR" locale="en-IN" placeholder="Price" inputStyleClass="w-28" />
                  <span class="w-24 text-right text-sm font-medium tabular-nums">{{ sym(form.currency) }}{{ fmt(line.quantity * line.unitPrice) }}</span>
                  <button pButton icon="pi pi-trash" class="p-button-text p-button-sm p-button-danger" (click)="removeLine($index)" [disabled]="form.items.length === 1"></button>
                </div>
              }
            </div>
          </div>

          <div class="grid grid-cols-4 gap-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Currency</label>
              <p-select [options]="currencies()" [(ngModel)]="form.currency" optionLabel="code" optionValue="code" styleClass="w-full" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Tax %</label>
              <p-inputNumber [(ngModel)]="form.taxRatePct" [min]="0" [max]="100" suffix="%" inputStyleClass="w-full" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Discount</label>
              <p-inputNumber [(ngModel)]="form.discount" [min]="0" inputStyleClass="w-full" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Due Date</label>
              <input type="date" [(ngModel)]="form.dueDate" class="w-full border border-gray-300 rounded-md px-2 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Note</label>
            <textarea [(ngModel)]="form.note" rows="2" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Optional note shown on the invoice"></textarea>
          </div>

          <!-- Totals preview -->
          <div class="bg-gray-50 rounded-lg p-3 text-sm">
            <div class="flex justify-between"><span class="text-gray-500">Subtotal</span><span class="font-medium tabular-nums">{{ sym(form.currency) }}{{ fmt(preview().subtotal) }}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Discount</span><span class="font-medium tabular-nums">− {{ sym(form.currency) }}{{ fmt(preview().discount) }}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Tax</span><span class="font-medium tabular-nums">{{ sym(form.currency) }}{{ fmt(preview().tax) }}</span></div>
            <div class="flex justify-between mt-1 pt-1 border-t border-gray-200 text-base font-bold"><span>Total</span><span class="tabular-nums">{{ sym(form.currency) }}{{ fmt(preview().total) }}</span></div>
          </div>
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" [text]="true" (onClick)="showCreate.set(false)" />
          <p-button label="Create Invoice" icon="pi pi-check" [loading]="saving()" (onClick)="submitCreate()" />
        </ng-template>
      </p-dialog>

      <!-- ─── Record Payment dialog ─────────────────────────────────────── -->
      <p-dialog header="Record Payment" [(visible)]="showPayment" [modal]="true" [style]="{ width: '440px' }" [draggable]="false">
        @if (activeInvoice(); as inv) {
          <div class="flex flex-col gap-3">
            <div class="bg-gray-50 rounded-lg p-3 text-sm flex justify-between">
              <span class="font-mono font-semibold">{{ inv.invoiceNumber }}</span>
              <span>Balance: <b class="text-red-600">{{ sym(inv.currency) }}{{ fmt(inv.balanceDue) }}</b></span>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Amount</label>
              <p-inputNumber [(ngModel)]="payForm.amount" [min]="0" [max]="num(inv.balanceDue)" mode="currency" currency="INR" locale="en-IN" inputStyleClass="w-full" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Payment Mode</label>
              <p-select [options]="paymentModeOptions()" [(ngModel)]="payForm.paymentModeId" optionLabel="name" optionValue="id" placeholder="Select mode" [showClear]="true" styleClass="w-full" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Reference</label>
              <input pInputText [(ngModel)]="payForm.ref" class="w-full" placeholder="Txn / cheque no. (optional)" />
            </div>
          </div>
        }
        <ng-template pTemplate="footer">
          <p-button label="Cancel" [text]="true" (onClick)="showPayment.set(false)" />
          <p-button label="Record" icon="pi pi-check" [loading]="saving()" (onClick)="submitPayment()" />
        </ng-template>
      </p-dialog>

      <!-- ─── Detail dialog ─────────────────────────────────────────────── -->
      <p-dialog header="Invoice" [(visible)]="showDetail" [modal]="true" [style]="{ width: '640px' }" [draggable]="false">
        @if (detail(); as inv) {
          <div class="flex flex-col gap-4">
            <div class="flex items-start justify-between">
              <div>
                <p class="font-mono text-lg font-bold text-primary-600">{{ inv.invoiceNumber }}</p>
                <p class="text-sm text-gray-600">{{ inv.customerName }} <span class="text-gray-400">{{ inv.customerPhone }}</span></p>
              </div>
              <p-tag [value]="inv.paymentStatus | titlecase" [severity]="statusSeverity(inv.paymentStatus)" />
            </div>

            <table class="w-full text-sm">
              <thead><tr class="text-gray-400 text-xs uppercase">
                <th class="text-left py-1">Item</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Total</th>
              </tr></thead>
              <tbody>
                @for (l of inv.items || []; track $index) {
                  <tr class="border-t border-gray-100">
                    <td class="py-1">{{ l.description }}</td>
                    <td class="text-right">{{ l.quantity }}</td>
                    <td class="text-right tabular-nums">{{ sym(inv.currency) }}{{ fmt(l.unitPrice) }}</td>
                    <td class="text-right tabular-nums">{{ sym(inv.currency) }}{{ fmt(l.lineTotal ?? (l.quantity * l.unitPrice)) }}</td>
                  </tr>
                }
              </tbody>
            </table>

            <div class="bg-gray-50 rounded-lg p-3 text-sm ml-auto w-64">
              <div class="flex justify-between"><span class="text-gray-500">Subtotal</span><span class="tabular-nums">{{ sym(inv.currency) }}{{ fmt(inv.subtotal) }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Discount</span><span class="tabular-nums">− {{ sym(inv.currency) }}{{ fmt(inv.discount) }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Tax</span><span class="tabular-nums">{{ sym(inv.currency) }}{{ fmt(inv.totalTax) }}</span></div>
              <div class="flex justify-between font-bold border-t border-gray-200 mt-1 pt-1"><span>Total</span><span class="tabular-nums">{{ sym(inv.currency) }}{{ fmt(inv.total) }}</span></div>
              <div class="flex justify-between text-green-600 mt-1"><span>Paid</span><span class="tabular-nums">{{ sym(inv.currency) }}{{ fmt(inv.amountPaid) }}</span></div>
              <div class="flex justify-between text-red-600"><span>Balance</span><span class="tabular-nums">{{ sym(inv.currency) }}{{ fmt(inv.balanceDue) }}</span></div>
            </div>

            @if ((inv.payments || []).length) {
              <div>
                <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Payments</p>
                @for (p of inv.payments || []; track p.id) {
                  <div class="flex justify-between items-center text-sm py-1 border-t border-gray-100">
                    <span>{{ p.createdAt | date:'medium' }} <span class="text-gray-400">{{ p.ref }}</span></span>
                    <span class="flex items-center gap-2">
                      <span class="font-medium tabular-nums">{{ sym(detail()?.currency) }}{{ fmt(p.amount) }}</span>
                      <button pButton icon="pi pi-file-pdf" class="p-button-text p-button-sm" pTooltip="Receipt PDF" (click)="downloadReceipt(p)"></button>
                    </span>
                  </div>
                }
              </div>
            }
          </div>
        }
        <ng-template pTemplate="footer">
          @if (detail(); as inv) {
            <p-button label="Download PDF" icon="pi pi-file-pdf" [text]="true" (onClick)="downloadPdf(inv)" />
            @if (inv.paymentStatus !== 'paid' && !access.readOnly()) {
              <p-button label="Record Payment" icon="pi pi-wallet" [outlined]="true" (onClick)="openPayment(inv); showDetail.set(false)" />
            }
          }
          <p-button label="Close" [text]="true" (onClick)="showDetail.set(false)" />
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class ErpInvoiceListComponent implements OnInit {
  private readonly erp = inject(ErpService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  readonly access = inject(ErpAccessService);

  loading = signal(true);
  saving = signal(false);
  invoices = signal<ErpInvoice[]>([]);
  paymentModes = signal<PaymentMode[]>([]);
  searchTerm = '';
  selectedPaymentStatus: string | null = null;

  showCreate = signal(false);
  showPayment = signal(false);
  showDetail = signal(false);
  activeInvoice = signal<ErpInvoice | null>(null);
  detail = signal<ErpInvoice | null>(null);

  paymentStatusOptions = [
    { label: 'Unpaid', value: 'unpaid' },
    { label: 'Partial', value: 'partial' },
    { label: 'Paid', value: 'paid' },
  ];

  form = this.blankForm();
  payForm: { amount: number | null; paymentModeId: string | null; ref: string } = { amount: null, paymentModeId: null, ref: '' };

  paymentModeOptions = computed(() => this.paymentModes());

  filtered = computed(() => {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) return this.invoices();
    return this.invoices().filter(i =>
      i.invoiceNumber?.toLowerCase().includes(term) ||
      (i.customerName || '').toLowerCase().includes(term) ||
      (i.customerPhone || '').includes(term),
    );
  });

  statsCards = computed(() => {
    const list = this.invoices();
    // Outstanding is aggregated in the BASE currency (each balance × its exchange rate).
    const outstanding = list.reduce((s, i) => s + this.num(i.balanceDue) * (this.num(i.exchangeRate) || 1), 0);
    const by = (st: string) => list.filter(i => i.paymentStatus === st).length;
    return [
      { label: 'Total', value: list.length, icon: 'pi-file', iconBg: 'bg-slate-100 text-slate-600' },
      { label: 'Unpaid', value: by('unpaid'), icon: 'pi-clock', iconBg: 'bg-red-50 text-red-600' },
      { label: 'Partial', value: by('partial'), icon: 'pi-hourglass', iconBg: 'bg-amber-50 text-amber-600' },
      { label: 'Paid', value: by('paid'), icon: 'pi-check-circle', iconBg: 'bg-green-50 text-green-600' },
      { label: 'Outstanding', value: this.baseSym() + this.fmt(outstanding), icon: 'pi-wallet', iconBg: 'bg-purple-50 text-purple-600' },
    ];
  });

  /** code → symbol map from the loaded currencies (fallback: ₹ for INR, else the code). */
  private symMap = computed(() => {
    const m: Record<string, string> = {};
    for (const c of this.currencies()) m[c.code] = c.symbol || c.code;
    return m;
  });
  sym(code?: string): string {
    if (!code) return this.baseSym();
    return this.symMap()[code] || (code === 'INR' ? '₹' : code + ' ');
  }
  baseSym = computed(() => this.currencies().find((c) => c.isBase)?.symbol || '₹');

  preview = computed(() => {
    const subtotal = this.form.items.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
    const discount = Number(this.form.discount) || 0;
    const taxable = Math.max(0, subtotal - discount);
    const tax = taxable * ((Number(this.form.taxRatePct) || 0) / 100);
    return { subtotal, discount, tax, total: taxable + tax };
  });

  currencies = signal<any[]>([]);
  branches = signal<any[]>([]);

  ngOnInit() {
    this.load();
    this.erp.listPaymentModes().subscribe({ next: (r) => this.paymentModes.set(r.data || []) });
    this.erp.listCurrencies().subscribe({ next: (r) => this.currencies.set(r.data || []) });
    this.api.get<any>('/erp/branches', { limit: 200 }).subscribe({ next: (r) => this.branches.set(r?.data || []) });
  }

  load() {
    this.loading.set(true);
    const params: any = {};
    if (this.selectedPaymentStatus) params.paymentStatus = this.selectedPaymentStatus;
    this.erp.listInvoices(params).subscribe({
      next: (r) => { this.invoices.set(r.data || []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.add({ severity: 'error', summary: 'Failed to load invoices' }); },
    });
  }

  // ─── create ──────────────────────────────────────────────────────────────
  openCreate() { if (this.access.readOnly()) return; this.form = this.blankForm(); this.showCreate.set(true); }
  addLine() { this.form.items.push({ description: '', quantity: 1, unitPrice: 0 }); }
  removeLine(i: number) { this.form.items.splice(i, 1); }

  submitCreate() {
    const items = this.form.items.filter(l => l.description && l.quantity > 0);
    if (!items.length) { this.toast.add({ severity: 'warn', summary: 'Add at least one line item' }); return; }
    this.saving.set(true);
    this.erp.createInvoice({
      customerName: this.form.customerName || undefined,
      customerPhone: this.form.customerPhone || undefined,
      items: items.map(l => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      taxRate: (Number(this.form.taxRatePct) || 0) / 100,
      discount: Number(this.form.discount) || 0,
      currency: this.form.currency || undefined,
      branchId: this.form.branchId || undefined,
      dueDate: this.form.dueDate || undefined,
      note: this.form.note || undefined,
    }).subscribe({
      next: (inv) => {
        this.saving.set(false);
        this.showCreate.set(false);
        this.toast.add({ severity: 'success', summary: 'Invoice created', detail: inv.invoiceNumber });
        this.load();
      },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Create failed', detail: e?.error?.error?.message || 'Error' }); },
    });
  }

  // ─── payment ─────────────────────────────────────────────────────────────
  openPayment(inv: ErpInvoice) {
    if (this.access.readOnly()) return;
    this.activeInvoice.set(inv);
    const def = this.paymentModes().find(m => m.isDefault);
    this.payForm = { amount: this.num(inv.balanceDue), paymentModeId: def?.id ?? null, ref: '' };
    this.showPayment.set(true);
  }

  submitPayment() {
    const inv = this.activeInvoice();
    if (!inv || !this.payForm.amount || this.payForm.amount <= 0) { this.toast.add({ severity: 'warn', summary: 'Enter an amount' }); return; }
    this.saving.set(true);
    this.erp.recordPayment(inv.id, {
      amount: Number(this.payForm.amount),
      paymentModeId: this.payForm.paymentModeId || undefined,
      ref: this.payForm.ref || undefined,
    }).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.showPayment.set(false);
        this.toast.add({ severity: 'success', summary: 'Payment recorded', detail: `${r.invoice.invoiceNumber} → ${r.invoice.paymentStatus}` });
        this.load();
      },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Payment failed', detail: e?.error?.error?.message || 'Error' }); },
    });
  }

  // ─── detail ──────────────────────────────────────────────────────────────
  openDetail(inv: ErpInvoice) {
    this.detail.set(inv);
    this.showDetail.set(true);
    this.erp.getInvoice(inv.id).subscribe({ next: (full) => this.detail.set(full) });
  }

  downloadPdf(inv: ErpInvoice) {
    // Blob-download (not window.open) so it works inside the WhatsApp webview.
    this.api.downloadFile(`/erp/invoices/${inv.id}/pdf`, `invoice-${inv.invoiceNumber || inv.id}.pdf`,
      () => this.toast.add({ severity: 'error', summary: 'Download failed', detail: 'Could not fetch the PDF' }));
  }

  downloadReceipt(p: any) {
    this.api.downloadFile(`/erp/invoices/payments/${p.id}/receipt`, `receipt-${p.id}.pdf`,
      () => this.toast.add({ severity: 'error', summary: 'Download failed', detail: 'Could not fetch the receipt' }));
  }

  remind(inv: ErpInvoice) {
    this.erp.remindInvoice(inv.id).subscribe({
      next: (r) => r.sent
        ? this.toast.add({ severity: 'success', summary: 'Reminder sent', detail: inv.invoiceNumber })
        : this.toast.add({ severity: 'warn', summary: 'Not sent', detail: r.reason || 'No WhatsApp number' }),
      error: (e) => this.toast.add({ severity: 'error', summary: 'Failed', detail: e?.error?.error?.message || 'Error' }),
    });
  }

  // ─── helpers ─────────────────────────────────────────────────────────────
  num(v: any): number { return parseFloat(v ?? 0) || 0; }
  fmt(v: any): string { return this.num(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  statusSeverity(s: string): 'success' | 'warn' | 'danger' | 'secondary' {
    return s === 'paid' ? 'success' : s === 'partial' ? 'warn' : 'danger';
  }
  private blankForm() {
    return {
      customerName: '', customerPhone: '',
      items: [{ description: '', quantity: 1, unitPrice: 0 }] as LineForm[],
      taxRatePct: 0, discount: 0, dueDate: '', note: '', currency: '', branchId: '',
    };
  }
}
