import { Component, ElementRef, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { EntryDraftService } from '../../core/services/entry-draft.service';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { EntryService, CustomerHit, CustomerContext, ProductHit } from '../../core/services/entry.service';
import { EntryLookupComponent } from './entry-lookup.component';
import { QuickCreateComponent, QuickCreated, QuickKind } from './quick-create.component';

interface Row {
  productId?: string;
  name: string;
  qty: number | null;
  free: number | null;
  rate: number | null;
  d1: number | null;
  d2: number | null;
  gstRate: number | null;
  stock?: number;
  lastToCustomer?: { price: number; at: string } | null;
  levelPrice?: { price: number; levelName: string } | null;
}

const COLS = ['name', 'qty', 'free', 'rate', 'd1', 'd2', 'gstRate'] as const;
type Col = (typeof COLS)[number];
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Sales Order — keyboard grid creating a pending order (fulfil later: confirm, deliver,
 * invoice from the web portal / WhatsApp flow). Same billing intelligence as the sales
 * invoice: stock, price-level rate, party rate memory, credit warning.
 */
@Component({
  selector: 'wa-order-entry',
  standalone: true,
  imports: [FormsModule, DatePipe, QuickCreateComponent, EntryLookupComponent],
  template: `
    <div class="p-3 md:p-5 max-w-6xl select-none">
      <span class="hidden">{{ tick() }}</span>

      <div class="flex items-center gap-4 mb-3 border-b pb-2">
        <h1 class="text-lg font-semibold">Sales Order</h1>
        <span class="text-sm text-slate-500">{{ today | date: 'dd-MM-yyyy' }}</span>
        @if (savedNumber()) {
          <span class="text-sm px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✓ Saved {{ savedNumber() }} (pending) — confirm & fulfil from Orders
          </span>
        }
      </div>

      <!-- Party -->
      <div class="flex items-center gap-2 mb-2">
        <label class="text-sm font-medium w-24">Party A/c</label>
        <div class="relative flex-1 max-w-md">
          <input data-cell="party" [(ngModel)]="customerQuery" (ngModelChange)="onCustomerQuery($event)"
                 (keydown)="onPartyKey($event)"
                 class="w-full border rounded px-2 py-1.5 text-sm focus:bg-amber-50 focus:outline-none focus:border-amber-400"
                 placeholder="Type name / phone / GSTIN…" autocomplete="off" />
          @if (customerQuery.length >= 2 && !customerHits().length && !customer()) {
            <div class="absolute top-full left-0 z-50 w-full bg-white border rounded-b shadow-lg">
              <div (mousedown)="openQuickCreate('customer', customerQuery)"
                   class="px-2 py-1.5 text-sm cursor-pointer bg-amber-50 hover:bg-amber-100">
                ➕ Create customer “{{ customerQuery }}” <span class="text-slate-400">(Enter)</span>
              </div>
            </div>
          }
          @if (customerHits().length) {
            <div class="absolute top-full left-0 z-50 w-full bg-white border rounded-b shadow-lg max-h-64 overflow-auto">
              @for (hit of customerHits(); track hit.id; let i = $index) {
                <div (mousedown)="pickCustomer(hit)"
                     class="px-2 py-1.5 text-sm cursor-pointer flex justify-between"
                     [class.bg-amber-100]="i === customerHitIdx()">
                  <span>{{ hit.name }}</span><span class="text-slate-400">{{ hit.gstin || hit.phone }}</span>
                </div>
              }
            </div>
          }
        </div>
        @if (customer(); as c) {
          <span class="text-sm" [class.text-red-600]="c.outstanding > 0">Outstanding ₹{{ fmt(c.outstanding) }}</span>
          @if (c.priceLevelName) {
            <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{{ c.priceLevelName }} rates</span>
          }
        }
      </div>

      @if (creditExceeded()) {
        <div class="mb-3 px-3 py-2 rounded border border-red-300 bg-red-50 text-red-700 text-sm">
          ⚠ <b>Credit limit exceeded:</b> limit ₹{{ fmt(customer()!.creditLimit) }} — outstanding
          ₹{{ fmt(customer()!.outstanding) }} + this order ₹{{ fmt(grandTotal()) }}.
        </div>
      }

      <!-- Grid -->
      <table class="w-full text-sm border border-slate-300" style="border-collapse: collapse">
        <thead>
          <tr class="bg-slate-100 text-slate-600">
            <th class="border border-slate-300 px-1 w-8">#</th>
            <th class="border border-slate-300 px-2 text-left">Item</th>
            <th class="border border-slate-300 px-2 w-16 text-right">Stock</th>
            <th class="border border-slate-300 px-2 w-16 text-right">Qty</th>
            <th class="border border-slate-300 px-2 w-14 text-right">Free</th>
            <th class="border border-slate-300 px-2 w-20 text-right">Rate</th>
            <th class="border border-slate-300 px-2 w-14 text-right">D1%</th>
            <th class="border border-slate-300 px-2 w-14 text-right">D2%</th>
            <th class="border border-slate-300 px-2 w-14 text-right">GST%</th>
            <th class="border border-slate-300 px-2 w-24 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows; track $index; let r = $index) {
            <tr>
              <td class="border border-slate-300 text-center text-slate-400">{{ r + 1 }}</td>
              <td class="border border-slate-300 relative p-0">
                <input [attr.data-cell]="r + ':name'" [(ngModel)]="row.name" (ngModelChange)="onProductQuery(r, $event)"
                       (keydown)="onCellKey($event, r, 'name')"
                       class="w-full px-2 py-1 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
                @if (searchRow() === r && !productHits().length && row.name.length >= 2 && !row.productId) {
                  <div class="absolute top-full left-0 z-50 w-96 bg-white border rounded-b shadow-lg">
                    <div (mousedown)="openQuickCreate('product', row.name, r)"
                         class="px-2 py-1.5 cursor-pointer bg-amber-50 hover:bg-amber-100">
                      ➕ Create item “{{ row.name }}” <span class="text-slate-400">(Enter)</span>
                    </div>
                  </div>
                }
                @if (searchRow() === r && productHits().length) {
                  <div class="absolute top-full left-0 z-50 w-96 bg-white border rounded-b shadow-lg max-h-64 overflow-auto">
                    @for (hit of productHits(); track hit.id; let i = $index) {
                      <div (mousedown)="pickProduct(r, hit)"
                           class="px-2 py-1.5 cursor-pointer flex justify-between gap-2"
                           [class.bg-amber-100]="i === productHitIdx()">
                        <span class="truncate">{{ hit.name }}</span>
                        <span class="text-slate-400 whitespace-nowrap">₹{{ fmt(hit.salePrice ?? hit.basePrice) }} · stk {{ hit.stock ?? 0 }}</span>
                      </div>
                    }
                  </div>
                }
              </td>
              <td class="border border-slate-300 px-2 text-right"
                  [class.text-red-600]="row.stock !== undefined && row.qty !== null && row.qty > row.stock">{{ row.stock ?? '' }}</td>
              <td class="border border-slate-300 p-0">
                <input [attr.data-cell]="r + ':qty'" type="number" [(ngModel)]="row.qty" (keydown)="onCellKey($event, r, 'qty')"
                       class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
              </td>
              <td class="border border-slate-300 p-0">
                <input [attr.data-cell]="r + ':free'" type="number" [(ngModel)]="row.free" (keydown)="onCellKey($event, r, 'free')"
                       class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
              </td>
              <td class="border border-slate-300 p-0">
                <input [attr.data-cell]="r + ':rate'" type="number" [(ngModel)]="row.rate" (keydown)="onCellKey($event, r, 'rate')"
                       class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
              </td>
              <td class="border border-slate-300 p-0">
                <input [attr.data-cell]="r + ':d1'" type="number" [(ngModel)]="row.d1" (keydown)="onCellKey($event, r, 'd1')"
                       class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
              </td>
              <td class="border border-slate-300 p-0">
                <input [attr.data-cell]="r + ':d2'" type="number" [(ngModel)]="row.d2" (keydown)="onCellKey($event, r, 'd2')"
                       class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
              </td>
              <td class="border border-slate-300 p-0">
                <input [attr.data-cell]="r + ':gstRate'" type="number" [(ngModel)]="row.gstRate" (keydown)="onCellKey($event, r, 'gstRate')"
                       class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
              </td>
              <td class="border border-slate-300 px-2 text-right font-medium">{{ fmt(lineAmount(row)) }}</td>
            </tr>
            @if (row.productId && (row.levelPrice || row.lastToCustomer)) {
              <tr><td></td>
                <td colspan="9" class="px-2 pb-1 pt-0 text-xs text-slate-500 border-x border-slate-300">
                  @if (row.levelPrice) { List ({{ row.levelPrice.levelName }}): <b class="text-emerald-700">₹{{ fmt(row.levelPrice.price) }}</b> }
                  @if (row.lastToCustomer) {
                    · Last to {{ customer()?.name || 'party' }}: <b class="text-indigo-600">₹{{ fmt(row.lastToCustomer.price) }}</b>
                    on {{ row.lastToCustomer.at | date: 'dd-MM-yy' }}
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>

      <div class="flex gap-4 mt-3 items-start">
        <label class="text-sm flex-1">Notes
          <input data-cell="note" [(ngModel)]="notes" (keydown)="onNoteKey($event)"
                 class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
        </label>
        <div class="text-sm w-64 space-y-1">
          <div class="flex justify-between"><span class="text-slate-500">Taxable</span><span>{{ fmt(taxable()) }}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">GST</span><span>{{ fmt(totalTax()) }}</span></div>
          <div class="flex justify-between items-center"><span class="text-slate-500">Delivery fee</span>
            <input type="number" [(ngModel)]="deliveryFee" class="w-24 border rounded px-2 py-0.5 text-right focus:bg-amber-50 focus:outline-none" />
          </div>
          <div class="flex justify-between font-semibold text-base border-t pt-1"><span>Total</span><span>₹{{ fmt(grandTotal()) }}</span></div>
          @if (error()) { <p class="text-red-600 text-xs">{{ error() }}</p> }
          <button (click)="save()" [disabled]="saving() || !canSave()"
                  class="w-full mt-1 px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50">
            {{ saving() ? 'Saving…' : 'Save Order (Ctrl+A)' }}
          </button>
        </div>
      </div>

      <wa-entry-lookup [kind]="'customer'" [party]="customer()" [rows]="rows" (applyRate)="onApplyRate($event)" />

      @if (qc(); as q) {
        <wa-quick-create [kind]="q.kind" [prefillName]="q.name"
                         (created)="onQuickCreated($event)" (cancel)="qc.set(null)" />
      }
    </div>
  `,
})
export class OrderEntryComponent implements OnInit, OnDestroy {
  private readonly entry = inject(EntryService);
  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly drafts = inject(EntryDraftService);

  // ─── Draft retention: navigating away mid-entry keeps everything typed ──────
  ngOnInit(): void {
    const d = this.drafts.load<any>('order');
    if (!d) return;
    this.customerQuery = d.customerQuery ?? ''; this.customer.set(d.customer ?? null);
    if (Array.isArray(d.rows) && d.rows.length) this.rows = d.rows;
    this.deliveryFee = d.deliveryFee ?? null; this.notes = d.notes ?? '';
    this.tick.update((t) => t + 1);
    this.drafts.note('✎ Draft restored — Alt+X to start fresh');
  }

  ngOnDestroy(): void {
    if (!this.entryDirty()) { this.drafts.clear('order'); return; }
    this.drafts.save('order', {
      customerQuery: this.customerQuery, customer: this.customer(), rows: this.rows,
      deliveryFee: this.deliveryFee, notes: this.notes,
    });
    this.drafts.note('✎ Draft kept — it will be waiting when you return');
  }

  private entryDirty(): boolean {
    return !!(this.customerQuery.trim() || this.customer() || this.notes || this.rows.some((r) => r.name || r.qty || r.rate));
  }

  /** Alt+X — wipe the entry and its draft (start fresh). */
  @HostListener('document:wa-clear-entry')
  clearEntry(): void {
    this.drafts.clear('order');
    this.customerQuery = ''; this.customer.set(null); this.customerHits.set([]);
    this.rows = [this.blankRow(), this.blankRow()];
    this.deliveryFee = null; this.notes = '';
    this.error.set(null);
    this.tick.update((t) => t + 1);
    this.drafts.note('✕ Entry cleared');
    setTimeout(() => (this.host.nativeElement.querySelector('[data-cell="party"], input') as HTMLInputElement | null)?.focus());
  }


  readonly today = new Date();
  readonly tick = signal(0);

  customerQuery = '';
  readonly customerHits = signal<CustomerHit[]>([]);
  readonly customerHitIdx = signal(0);
  readonly customer = signal<CustomerContext | null>(null);

  rows: Row[] = [this.blankRow(), this.blankRow()];
  readonly productHits = signal<ProductHit[]>([]);
  readonly productHitIdx = signal(0);
  readonly searchRow = signal<number | null>(null);

  deliveryFee: number | null = null;
  notes = '';
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedNumber = signal<string | null>(null);
  readonly qc = signal<{ kind: QuickKind; name: string; row?: number } | null>(null);

  private debounce?: ReturnType<typeof setTimeout>;

  private blankRow(): Row {
    return { name: '', qty: null, free: null, rate: null, d1: null, d2: null, gstRate: null };
  }

  onCustomerQuery(q: string): void {
    this.customer.set(null);
    clearTimeout(this.debounce);
    if (!q || q.length < 2) { this.customerHits.set([]); return; }
    this.debounce = setTimeout(() => {
      this.entry.customers(q).subscribe((hits) => { this.customerHits.set(hits || []); this.customerHitIdx.set(0); });
    }, 200);
  }

  onPartyKey(e: KeyboardEvent): void {
    const hits = this.customerHits();
    if (hits.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.customerHitIdx.set(Math.min(this.customerHitIdx() + 1, hits.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.customerHitIdx.set(Math.max(this.customerHitIdx() - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.pickCustomer(hits[this.customerHitIdx()]); return; }
      if (e.key === 'Escape') { e.stopPropagation(); this.customerHits.set([]); return; }
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (!this.customer() && this.customerQuery.length >= 2) { this.openQuickCreate('customer', this.customerQuery); return; }
      this.focusCell(0, 'name');
    }
  }

  pickCustomer(hit: CustomerHit): void {
    this.customerQuery = hit.name;
    this.customerHits.set([]);
    this.entry.customerContext(hit.id).subscribe((ctx) => {
      this.customer.set(ctx);
      for (let r = 0; r < this.rows.length; r++) if (this.rows[r].productId) this.loadItemContext(r);
    });
    setTimeout(() => this.focusCell(0, 'name'));
  }

  onProductQuery(r: number, q: string): void {
    const row = this.rows[r];
    row.productId = undefined; row.stock = undefined; row.lastToCustomer = null; row.levelPrice = null;
    clearTimeout(this.debounce);
    if (!q || q.length < 2) { this.productHits.set([]); this.searchRow.set(null); return; }
    this.debounce = setTimeout(() => {
      this.entry.products(q).subscribe((hits) => {
        this.productHits.set(hits || []); this.productHitIdx.set(0); this.searchRow.set(r);
      });
    }, 200);
  }

  pickProduct(r: number, hit: ProductHit): void {
    const row = this.rows[r];
    row.productId = hit.id;
    row.name = hit.name;
    row.gstRate = Number(hit.gstRate) || 0;
    row.rate = Number(hit.salePrice ?? hit.basePrice) || null;
    row.stock = Number(hit.stock) || 0;
    this.productHits.set([]); this.searchRow.set(null);
    this.loadItemContext(r, true);
    setTimeout(() => this.focusCell(r, 'qty'));
  }

  private loadItemContext(r: number, prefillRate = false): void {
    const row = this.rows[r];
    if (!row.productId) return;
    const stdRate = row.rate;
    this.entry.itemContext(row.productId, this.customer()?.id).subscribe((ctx) => {
      row.stock = Number(ctx.stock) || 0;
      row.lastToCustomer = ctx.lastToCustomer || null;
      row.levelPrice = ctx.levelPrice || null;
      if (prefillRate && row.rate === stdRate) {
        if (ctx.levelPrice) row.rate = money(ctx.levelPrice.price);
        else if (ctx.lastToCustomer) row.rate = money(ctx.lastToCustomer.price);
      }
      this.tick.update((t) => t + 1);
    });
  }

  onCellKey(e: KeyboardEvent, r: number, col: Col): void {
    const hits = this.productHits();
    if (col === 'name' && this.searchRow() === r && hits.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.productHitIdx.set(Math.min(this.productHitIdx() + 1, hits.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.productHitIdx.set(Math.max(this.productHitIdx() - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.pickProduct(r, hits[this.productHitIdx()]); return; }
      if (e.key === 'Escape') { e.stopPropagation(); this.productHits.set([]); this.searchRow.set(null); return; }
    }
    switch (e.key) {
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) { this.focusPrev(r, col); return; }
        if (col === 'name' && !this.rows[r].name) { this.focus('note'); return; }
        if (col === 'name' && !this.rows[r].productId && this.rows[r].name.length >= 2 && !hits.length) {
          this.openQuickCreate('product', this.rows[r].name, r);
          return;
        }
        this.focusNext(r, col);
        return;
      case 'Insert':
        e.preventDefault();
        this.rows.splice(r + 1, 0, this.blankRow());
        setTimeout(() => this.focusCell(r + 1, 'name'));
        return;
      case 'Delete':
        if (!e.ctrlKey) return;
        e.preventDefault();
        if (this.rows.length > 1) { this.rows.splice(r, 1); setTimeout(() => this.focusCell(Math.min(r, this.rows.length - 1), 'name')); }
        return;
      case 'ArrowDown':
        e.preventDefault();
        if (r + 1 >= this.rows.length) this.rows.push(this.blankRow());
        setTimeout(() => this.focusCell(r + 1, col));
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (r > 0) this.focusCell(r - 1, col);
        return;
    }
  }

  onNoteKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') { e.preventDefault(); this.save(); }
  }

  private focusNext(r: number, col: Col): void {
    const i = COLS.indexOf(col);
    if (i < COLS.length - 1) { this.focusCell(r, COLS[i + 1]); return; }
    if (r + 1 >= this.rows.length) this.rows.push(this.blankRow());
    setTimeout(() => this.focusCell(r + 1, 'name'));
  }
  private focusPrev(r: number, col: Col): void {
    const i = COLS.indexOf(col);
    if (i > 0) this.focusCell(r, COLS[i - 1]);
    else if (r > 0) this.focusCell(r - 1, COLS[COLS.length - 1]);
    else this.focus('party');
  }
  private focusCell(r: number, col: string): void {
    const el = this.host.nativeElement.querySelector(`[data-cell="${r}:${col}"]`) as HTMLInputElement | null;
    el?.focus(); el?.select();
  }
  private focus(cell: string): void {
    (this.host.nativeElement.querySelector(`[data-cell="${cell}"]`) as HTMLInputElement | null)?.focus();
  }

  openQuickCreate(kind: QuickKind, name: string, row?: number): void {
    this.customerHits.set([]);
    this.productHits.set([]);
    this.searchRow.set(null);
    this.qc.set({ kind, name, row });
  }

  onQuickCreated(created: QuickCreated): void {
    const ctx = this.qc();
    this.qc.set(null);
    if (created.kind === 'customer') {
      this.pickCustomer({ id: created.id, name: created.name, phone: created.phone || '' });
    } else if (created.kind === 'product' && ctx?.row !== undefined) {
      this.pickProduct(ctx.row, {
        id: created.id, name: created.name,
        gstRate: created.gstRate, salePrice: created.rate, basePrice: created.rate, stock: 0,
      });
    }
  }

  /** Miracle: Ctrl+Enter accepts/saves the voucher from anywhere (alias of Ctrl+A). */

  @HostListener('document:keydown.control.enter', ['$event'])

  onCtrlEnterSave(e: Event): void { this.onSaveKey(e as any); }


  @HostListener('document:keydown.control.a', ['$event'])
  onSaveKey(e: Event): void { e.preventDefault(); this.save(); }

  /** Miracle cascading trade discounts: gross × (1−D1) × (1−D2). Free qty rides at ₹0. */
  lineAmount(row: Row): number {
    const gross = (Number(row.qty) || 0) * (Number(row.rate) || 0);
    return money(gross * (1 - (Number(row.d1) || 0) / 100) * (1 - (Number(row.d2) || 0) / 100));
  }
  private liveRows(): Row[] { return this.rows.filter((r) => r.name && (Number(r.qty) || 0) > 0); }
  taxable(): number { return money(this.liveRows().reduce((s, r) => s + this.lineAmount(r), 0)); }
  totalTax(): number { return money(this.liveRows().reduce((s, r) => s + this.lineAmount(r) * ((Number(r.gstRate) || 0) / 100), 0)); }
  grandTotal(): number { return money(this.taxable() + this.totalTax() + (Number(this.deliveryFee) || 0)); }
  canSave(): boolean { return !!this.customer() && this.liveRows().length > 0 && this.grandTotal() > 0; }

  /** Alt+L rate pick: write the chosen historical rate back into the grid line. */
  onApplyRate(e: { row: number; rate: number }): void {
    const row = this.rows[e.row];
    if (!row) return;
    row.rate = e.rate;
    this.tick.update((t) => t + 1);
  }

  fmt(n: unknown): string { return (Number(n) || 0).toFixed(2); }

  creditExceeded(): boolean {
    const c = this.customer();
    if (!c || !c.creditLimit || Number(c.creditLimit) <= 0) return false;
    return Number(c.outstanding) + this.grandTotal() > Number(c.creditLimit);
  }

  save(): void {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.entry
      .createOrder({
        customerId: this.customer()!.id,
        items: this.liveRows().flatMap((r) => {
          const lines: Array<{ productId?: string; productName?: string; quantity: number; unitPrice: number }> = [{
            productId: r.productId,
            productName: r.name,
            quantity: Number(r.qty),
            // D1×D2 cascade folded into the unit price, matching the grid math exactly
            unitPrice: money((Number(r.rate) || 0) * (1 - (Number(r.d1) || 0) / 100) * (1 - (Number(r.d2) || 0) / 100)),
          }];
          // Miracle scheme: free quantity as a ₹0 ride-along line.
          if (Number(r.free) > 0) {
            lines.push({ productId: r.productId, productName: `${r.name} (FREE)`, quantity: Number(r.free), unitPrice: 0 });
          }
          return lines;
        }),
        taxAmount: this.totalTax(),
        deliveryFee: Number(this.deliveryFee) || 0,
        notes: this.notes || undefined,
      })
      .subscribe({
        next: (order) => {
          this.saving.set(false);
          this.savedNumber.set(order?.orderNumber || 'order');
          this.drafts.clear('order');
          this.rows = [this.blankRow(), this.blankRow()];
          this.notes = '';
          this.deliveryFee = null;
          this.customerQuery = '';
          this.customer.set(null);
          this.tick.update((t) => t + 1);
          setTimeout(() => this.focus('party'));
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.message || 'Failed to save order');
        },
      });
  }
}
