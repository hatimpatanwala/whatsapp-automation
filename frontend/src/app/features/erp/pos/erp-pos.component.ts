import { Component, OnInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../../core/services/api.service';
import { ErpService } from '../../../core/services/erp.service';
import { ErpCurrencyService } from '../../../core/services/erp-currency.service';

interface CartLine { productId?: string; description: string; quantity: number; unitPrice: number; }

@Component({
  selector: 'wa-erp-pos', standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, InputNumberModule, SelectModule, ToastModule],
  providers: [MessageService],
  template: `
    <div class="p-4 max-w-7xl mx-auto">
      <p-toast />
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Point of Sale</h2>
          <p class="text-sm text-gray-500 mt-1">Scan a barcode or search, build the cart, and charge — creates an invoice instantly</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <!-- Search + results -->
        <div class="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-4">
          <div class="flex gap-2 mb-3">
            <input #searchBox pInputText [(ngModel)]="query" (keyup.enter)="onEnter()" (input)="onSearch()"
              placeholder="Scan barcode or type product name / SKU…" class="w-full" autofocus />
            <p-button icon="pi pi-search" (onClick)="search()" />
          </div>
          <div class="divide-y divide-gray-50 max-h-[58vh] overflow-y-auto">
            @for (p of results(); track p.id) {
              <button class="w-full flex items-center justify-between py-2.5 px-2 hover:bg-gray-50 text-left rounded" (click)="addToCart(p)">
                <span>
                  <span class="font-medium text-gray-800">{{ p.name }}</span>
                  <span class="text-xs text-gray-400 ml-2">{{ p.sku || p.barcode || '' }}</span>
                </span>
                <span class="font-semibold tabular-nums">{{ cur.symbol() }}{{ fmt(p.salePrice ?? p.basePrice) }}</span>
              </button>
            } @empty {
              <p class="text-center text-gray-400 py-10"><i class="pi pi-qrcode text-3xl block mb-2"></i>{{ query ? 'No products found' : 'Scan or search to add items' }}</p>
            }
          </div>
        </div>

        <!-- Cart -->
        <div class="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
          <h3 class="font-semibold text-gray-800 mb-3">Cart ({{ cart().length }})</h3>
          <div class="flex-1 overflow-y-auto divide-y divide-gray-50 min-h-[20vh]">
            @for (line of cart(); track $index) {
              <div class="flex items-center gap-2 py-2">
                <span class="flex-1 text-sm">{{ line.description }}</span>
                <p-inputNumber [(ngModel)]="line.quantity" [min]="1" [showButtons]="true" buttonLayout="horizontal" inputStyleClass="w-12 text-center" (ngModelChange)="recompute()" decrementButtonClass="p-button-sm" incrementButtonClass="p-button-sm" />
                <span class="w-20 text-right text-sm font-medium tabular-nums">{{ cur.symbol() }}{{ fmt(line.quantity * line.unitPrice) }}</span>
                <button pButton icon="pi pi-times" class="p-button-text p-button-sm p-button-danger" (click)="removeLine($index)"></button>
              </div>
            } @empty { <p class="text-gray-400 text-sm text-center py-8">Cart is empty</p> }
          </div>

          <div class="border-t border-gray-100 pt-3 mt-2 space-y-2">
            <div class="grid grid-cols-2 gap-2">
              <input pInputText [(ngModel)]="customerName" placeholder="Customer (optional)" class="w-full" />
              <input pInputText [(ngModel)]="customerPhone" placeholder="Phone (optional)" class="w-full" />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="flex items-center gap-2"><span class="text-xs text-gray-500">Tax %</span><p-inputNumber [(ngModel)]="taxPct" [min]="0" [max]="100" (ngModelChange)="recompute()" inputStyleClass="w-full" /></div>
              <div class="flex items-center gap-2"><span class="text-xs text-gray-500">Disc {{ cur.symbol() }}</span><p-inputNumber [(ngModel)]="discount" [min]="0" (ngModelChange)="recompute()" inputStyleClass="w-full" /></div>
            </div>
            <p-select [options]="paymentModes()" [(ngModel)]="paymentModeId" optionLabel="name" optionValue="id" [showClear]="true" styleClass="w-full" placeholder="Payment mode" />

            <div class="bg-gray-50 rounded-lg p-3 text-sm">
              <div class="flex justify-between"><span class="text-gray-500">Subtotal</span><span class="tabular-nums">{{ cur.symbol() }}{{ fmt(totals().subtotal) }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Tax</span><span class="tabular-nums">{{ cur.symbol() }}{{ fmt(totals().tax) }}</span></div>
              <div class="flex justify-between text-lg font-bold border-t border-gray-200 mt-1 pt-1"><span>Total</span><span class="tabular-nums">{{ cur.symbol() }}{{ fmt(totals().total) }}</span></div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <p-button label="Save Unpaid" icon="pi pi-save" [outlined]="true" styleClass="w-full" [disabled]="!cart().length || saving()" (onClick)="checkout(false)" />
              <p-button label="Charge & Print" icon="pi pi-check" styleClass="w-full" [loading]="saving()" [disabled]="!cart().length" (onClick)="checkout(true)" />
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ErpPosComponent implements OnInit {
  @ViewChild('searchBox') searchBox?: ElementRef<HTMLInputElement>;
  private readonly api = inject(ApiService);
  private readonly erp = inject(ErpService);
  readonly cur = inject(ErpCurrencyService);
  private readonly toast = inject(MessageService);

  query = '';
  results = signal<any[]>([]);
  cart = signal<CartLine[]>([]);
  paymentModes = signal<any[]>([]);
  customerName = ''; customerPhone = '';
  taxPct = 0; discount = 0; paymentModeId: string | null = null;
  saving = signal(false);
  private searchTimer: any;

  totals = computed(() => {
    const subtotal = this.cart().reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
    const taxable = Math.max(0, subtotal - (Number(this.discount) || 0));
    const tax = taxable * ((Number(this.taxPct) || 0) / 100);
    return { subtotal, tax, total: taxable + tax };
  });

  ngOnInit() {
    this.cur.load();
    this.erp.listPaymentModes().subscribe({ next: (r) => this.paymentModes.set(r.data || []) });
  }

  onSearch() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.search(), 250); }
  onEnter() {
    // Barcode scanners type the code + Enter. If exactly one result, add it instantly.
    this.search(() => {
      const r = this.results();
      if (r.length === 1) { this.addToCart(r[0]); }
    });
  }
  search(after?: () => void) {
    const q = this.query.trim();
    if (!q) { this.results.set([]); return; }
    this.api.get<any>('/erp/pos/products', { q }).subscribe({
      next: (res) => { this.results.set(res?.data || []); after?.(); },
    });
  }

  addToCart(p: any) {
    const price = Number(p.salePrice ?? p.basePrice) || 0;
    const existing = this.cart().find((l) => l.productId === p.id);
    if (existing) { existing.quantity++; this.cart.set([...this.cart()]); }
    else this.cart.set([...this.cart(), { productId: p.id, description: p.name, quantity: 1, unitPrice: price }]);
    // Default the tax rate from the first scanned product if not set.
    if (!this.taxPct && Number(p.gstRate)) this.taxPct = Number(p.gstRate);
    this.query = ''; this.results.set([]);
    this.searchBox?.nativeElement.focus();
  }
  removeLine(i: number) { const c = [...this.cart()]; c.splice(i, 1); this.cart.set(c); }
  recompute() { this.cart.set([...this.cart()]); }

  checkout(paid: boolean) {
    if (!this.cart().length) return;
    this.saving.set(true);
    this.api.post<any>('/erp/pos/checkout', {
      items: this.cart().map((l) => ({ productId: l.productId, description: l.description, quantity: +l.quantity, unitPrice: +l.unitPrice })),
      customerName: this.customerName || undefined, customerPhone: this.customerPhone || undefined,
      taxRate: (+this.taxPct || 0) / 100, discount: +this.discount || 0,
      paymentModeId: this.paymentModeId || undefined, paid,
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        const inv = res.invoice;
        this.toast.add({ severity: 'success', summary: `Sale ${inv.invoiceNumber}`, detail: paid ? 'Paid' : 'Saved unpaid' });
        if (paid) this.api.downloadFile(`/erp/invoices/${inv.id}/pdf`, `invoice-${inv.invoiceNumber || inv.id}.pdf`, () => this.toast.add({ severity: 'error', summary: 'Download failed' }));
        this.reset();
      },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Checkout failed', detail: e?.error?.error?.message || 'Error' }); },
    });
  }
  private reset() {
    this.cart.set([]); this.customerName = ''; this.customerPhone = ''; this.discount = 0; this.paymentModeId = null;
    this.searchBox?.nativeElement.focus();
  }
  fmt(v: any): string { return (parseFloat(v ?? 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
}
