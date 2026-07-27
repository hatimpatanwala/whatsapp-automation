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
import { PartyPickerComponent } from '../../entry/party-picker.component';
import { CustomerContext, SupplierContext } from '../../../core/services/entry.service';

interface CartLine { productId?: string; description: string; quantity: number; unitPrice: number; }

@Component({
  selector: 'wa-erp-pos', standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, InputNumberModule, SelectModule, ToastModule, PartyPickerComponent],
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

      @if (lastSale(); as s) {
        <div class="mb-4 flex flex-wrap items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
          <i class="pi pi-check-circle text-emerald-600"></i>
          <span class="text-sm font-semibold text-emerald-800">Sale {{ s.invoiceNumber }} · {{ cur.symbol() }}{{ fmt(s.total) }}</span>
          @if (s.phone) {
            <button (click)="shareLastSaleWhatsApp()" class="ml-auto text-sm font-semibold bg-green-600 text-white rounded-lg px-3 py-1.5 flex items-center gap-1.5">
              <i class="pi pi-whatsapp"></i> Share on WhatsApp
            </button>
          } @else {
            <span class="ml-auto text-[12px] text-emerald-600">Add a phone next time to share on WhatsApp</span>
          }
          <button (click)="lastSale.set(null)" class="text-emerald-600 text-sm"><i class="pi pi-times"></i></button>
        </div>
      }

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <!-- Search + results -->
        <div class="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-4">
          <div class="flex gap-2 mb-3">
            <input #searchBox pInputText [(ngModel)]="query" (keydown)="onSearchKey($event)" (input)="onSearch()"
              placeholder="Scan barcode or type product name / SKU… (↑↓ to pick, Enter to add)" class="w-full" autofocus />
            <p-button icon="pi pi-search" (onClick)="search()" />
          </div>
          <div class="divide-y divide-gray-50 max-h-[58vh] overflow-y-auto">
            @for (p of results(); track p.id; let i = $index) {
              <button class="w-full flex items-center justify-between py-2.5 px-2 hover:bg-gray-50 text-left rounded"
                [class.bg-indigo-50]="i === highlightIdx()" [attr.data-res]="i" (click)="addToCart(p)">
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
          <!-- Party card first, then the item cart -->
          <div class="space-y-2 mb-3 pb-3 border-b border-gray-100">
            <wa-party-picker (selected)="onParty($event)" (cleared)="onPartyCleared()"
                             placeholder="Search a party — or leave blank for walk-in…" />
            <div class="grid grid-cols-2 gap-2">
              <input pInputText [(ngModel)]="customerName" placeholder="Customer (optional)" class="w-full" />
              <input pInputText [(ngModel)]="customerPhone" placeholder="Phone (optional)" class="w-full" />
            </div>
          </div>
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
              <div class="flex items-center gap-2"><span class="text-xs text-gray-500">Tax %</span><p-inputNumber [(ngModel)]="taxPct" [min]="0" [max]="100" (ngModelChange)="recompute()" inputStyleClass="w-full" /></div>
              <div class="flex items-center gap-2"><span class="text-xs text-gray-500">Disc %</span><p-inputNumber [(ngModel)]="discountPct" [min]="0" [max]="100" (ngModelChange)="recompute()" inputStyleClass="w-full" /></div>
            </div>
            <div class="grid gap-2" [class.grid-cols-2]="paymentModes().length" [class.grid-cols-1]="!paymentModes().length">
              <p-select [options]="payMethods" [(ngModel)]="paymentMethod" optionLabel="label" optionValue="value" [showClear]="true" styleClass="w-full" placeholder="How paid? (Cash/UPI/Bank)" />
              @if (paymentModes().length) {
                <p-select [options]="paymentModes()" [(ngModel)]="paymentModeId" optionLabel="name" optionValue="id" [showClear]="true" styleClass="w-full" placeholder="Account (optional)" />
              }
            </div>

            <div class="bg-gray-50 rounded-lg p-3 text-sm">
              <div class="flex justify-between"><span class="text-gray-500">Subtotal</span><span class="tabular-nums">{{ cur.symbol() }}{{ fmt(totals().subtotal) }}</span></div>
              @if (totals().discountAmt > 0) {
                <div class="flex justify-between text-emerald-700"><span>Discount ({{ discountPct }}%)</span><span class="tabular-nums">− {{ cur.symbol() }}{{ fmt(totals().discountAmt) }}</span></div>
              }
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
  readonly highlightIdx = signal(-1);
  cart = signal<CartLine[]>([]);
  paymentModes = signal<any[]>([]);
  customerName = ''; customerPhone = '';
  taxPct = 0; discountPct = 0; paymentModeId: string | null = null;
  paymentMethod: string | null = null;
  readonly payMethods = [
    { label: 'Cash', value: 'cash' },
    { label: 'UPI', value: 'upi' },
    { label: 'Bank', value: 'bank' },
    { label: 'Card', value: 'card' },
    { label: 'Online', value: 'online' },
  ];
  saving = signal(false);
  readonly lastSale = signal<{ id: string; invoiceNumber: string; total: number; phone: string } | null>(null);
  private searchTimer: any;
  /** The selected party's agreed discount % — applied to the bill. */
  private partyDiscountPct = 0;

  totals = computed(() => {
    const subtotal = this.cart().reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
    const discountAmt = Math.round(subtotal * ((Number(this.discountPct) || 0) / 100) * 100) / 100;
    const taxable = Math.max(0, subtotal - discountAmt);
    const tax = taxable * ((Number(this.taxPct) || 0) / 100);
    return { subtotal, discountAmt, tax, total: taxable + tax };
  });

  ngOnInit() {
    this.cur.load();
    this.erp.listPaymentModes().subscribe({ next: (r) => this.paymentModes.set(r.data || []) });
  }

  onSearch() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.search(), 250); }

  /** Keyboard-drive the result list: ↑/↓ to move, Enter to add the highlighted row
   *  (falls back to the barcode single-add when nothing is highlighted). */
  onSearchKey(e: KeyboardEvent) {
    const r = this.results();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (r.length) { this.highlightIdx.set(Math.min(this.highlightIdx() + 1, r.length - 1)); this.scrollHighlight(); }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (r.length) { this.highlightIdx.set(Math.max(this.highlightIdx() - 1, 0)); this.scrollHighlight(); }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const idx = this.highlightIdx();
      if (idx >= 0 && r[idx]) { this.addToCart(r[idx]); return; }
      this.onEnter();
    }
  }
  private scrollHighlight() {
    setTimeout(() => document.querySelector(`[data-res="${this.highlightIdx()}"]`)?.scrollIntoView({ block: 'nearest' }));
  }

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
      next: (res) => { this.results.set(res?.data || []); this.highlightIdx.set(-1); after?.(); },
    });
  }

  addToCart(p: any) {
    const price = Number(p.salePrice ?? p.basePrice) || 0;
    const existing = this.cart().find((l) => l.productId === p.id);
    if (existing) { existing.quantity++; this.cart.set([...this.cart()]); }
    else this.cart.set([...this.cart(), { productId: p.id, description: p.name, quantity: 1, unitPrice: price }]);
    // Default the tax rate from the first scanned product if not set.
    if (!this.taxPct && Number(p.gstRate)) this.taxPct = Number(p.gstRate);
    this.applyPartyDiscount();
    this.query = ''; this.results.set([]);
    this.searchBox?.nativeElement.focus();
  }
  removeLine(i: number) { const c = [...this.cart()]; c.splice(i, 1); this.cart.set(c); this.applyPartyDiscount(); }
  recompute() { this.cart.set([...this.cart()]); this.applyPartyDiscount(); }

  /** Party picked → fill the walk-in name/phone and apply the party's agreed discount. */
  onParty(ctx: CustomerContext | SupplierContext) {
    this.customerName = ctx.name || '';
    this.customerPhone = (ctx as CustomerContext).phone || '';
    this.partyDiscountPct = Number((ctx as CustomerContext).defaultDiscountPct) || 0;
    this.applyPartyDiscount();
  }
  onPartyCleared() {
    this.customerName = ''; this.customerPhone = '';
    this.partyDiscountPct = 0; this.discountPct = 0;
  }
  /** Apply the party's agreed discount % to the bill. */
  private applyPartyDiscount() {
    if (this.partyDiscountPct > 0) this.discountPct = this.partyDiscountPct;
  }

  checkout(paid: boolean) {
    if (!this.cart().length) return;
    this.saving.set(true);
    this.api.post<any>('/erp/pos/checkout', {
      items: this.cart().map((l) => ({ productId: l.productId, description: l.description, quantity: +l.quantity, unitPrice: +l.unitPrice })),
      customerName: this.customerName || undefined, customerPhone: this.customerPhone || undefined,
      taxRate: (+this.taxPct || 0) / 100, discount: this.totals().discountAmt,
      paymentModeId: this.paymentModeId || undefined, paymentMethod: this.paymentMethod || undefined, paid,
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        const inv = res.invoice;
        this.toast.add({ severity: 'success', summary: `Sale ${inv.invoiceNumber}`, detail: paid ? 'Paid' : 'Saved unpaid' });
        // Capture the sale so the cashier can share it on WhatsApp after the reset.
        this.lastSale.set({ id: inv.id, invoiceNumber: inv.invoiceNumber, total: Number(inv.total) || this.totals().total, phone: this.customerPhone || '' });
        if (paid) this.api.downloadFile(`/erp/invoices/${inv.id}/pdf`, `invoice-${inv.invoiceNumber || inv.id}.pdf`, () => this.toast.add({ severity: 'error', summary: 'Download failed' }));
        this.reset();
      },
      error: (e) => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'Checkout failed', detail: e?.error?.error?.message || 'Error' }); },
    });
  }
  private reset() {
    this.cart.set([]); this.customerName = ''; this.customerPhone = ''; this.discountPct = 0; this.paymentModeId = null;
    this.paymentMethod = null; this.partyDiscountPct = 0;
    this.searchBox?.nativeElement.focus();
  }
  /** Share the last sale with the customer over WhatsApp (click-to-chat with the
   *  invoice details prefilled). The PDF is already downloaded on a paid checkout. */
  shareLastSaleWhatsApp(): void {
    const s = this.lastSale();
    if (!s?.phone) return;
    const phone = s.phone.replace(/\D/g, '');
    const msg = `Hi, here is your invoice ${s.invoiceNumber} for ${this.cur.symbol()}${this.fmt(s.total)}. Thank you for your purchase!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  fmt(v: any): string { return (parseFloat(v ?? 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
}
