import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Observable } from 'rxjs';
import { EntryService, CustomerHit, SupplierHit, ProductHit } from '../../core/services/entry.service';

interface Row {
  name: string;
  qty: number | null;
  rate: number | null;
}

type Mode = 'credit' | 'debit';
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Returns — credit note (sales return, from a customer) or debit note (purchase return,
 * to a supplier), toggled at the top. Same keyboard grid; a single GST% applies to the
 * note. Both auto-post: CN → Dr Sales Returns + Output Tax, Cr Customer;
 * DN → Dr Supplier, Cr Purchase Returns + Input Tax.
 */
@Component({
  selector: 'wa-returns-entry',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="p-3 md:p-5 max-w-5xl select-none">
      <span class="hidden">{{ tick() }}</span>

      <div class="flex items-center gap-4 mb-3 border-b pb-2">
        <h1 class="text-lg font-semibold">Returns</h1>
        <div class="flex rounded overflow-hidden border">
          <button (click)="setMode('credit')" class="px-3 py-1 text-sm"
                  [class.bg-slate-800]="mode() === 'credit'" [class.text-white]="mode() === 'credit'">
            Credit Note (sales return)
          </button>
          <button (click)="setMode('debit')" class="px-3 py-1 text-sm"
                  [class.bg-slate-800]="mode() === 'debit'" [class.text-white]="mode() === 'debit'">
            Debit Note (purchase return)
          </button>
        </div>
        <span class="text-sm text-slate-500">{{ today | date: 'dd-MM-yyyy' }}</span>
        @if (savedNumber()) {
          <span class="text-sm px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✓ Saved {{ savedNumber() }} & posted to books
          </span>
        }
      </div>

      <!-- Party -->
      <div class="flex items-center gap-2 mb-3">
        <label class="text-sm font-medium w-24">{{ mode() === 'credit' ? 'Customer' : 'Supplier' }}</label>
        <div class="relative flex-1 max-w-md">
          <input data-cell="party" [(ngModel)]="partyQuery" (ngModelChange)="onPartyQuery($event)"
                 (keydown)="onPartyKey($event)"
                 class="w-full border rounded px-2 py-1.5 text-sm focus:bg-amber-50 focus:outline-none focus:border-amber-400"
                 [placeholder]="mode() === 'credit' ? 'Type customer…' : 'Type supplier…'" autocomplete="off" />
          @if (partyHits().length) {
            <div class="absolute top-full left-0 z-50 w-full bg-white border rounded-b shadow-lg max-h-64 overflow-auto">
              @for (hit of partyHits(); track hit.id; let i = $index) {
                <div (mousedown)="pickParty(hit)"
                     class="px-2 py-1.5 text-sm cursor-pointer flex justify-between"
                     [class.bg-amber-100]="i === partyHitIdx()">
                  <span>{{ hit.name }}</span>
                </div>
              }
            </div>
          }
        </div>
        <label class="text-sm">GST %
          <input type="number" [(ngModel)]="gstPct" class="ml-1 border rounded px-2 py-1.5 w-20 text-right focus:bg-amber-50 focus:outline-none" />
        </label>
      </div>

      <!-- Grid -->
      <table class="w-full text-sm border border-slate-300 max-w-3xl" style="border-collapse: collapse">
        <thead>
          <tr class="bg-slate-100 text-slate-600">
            <th class="border border-slate-300 px-1 w-8">#</th>
            <th class="border border-slate-300 px-2 text-left">Item / description</th>
            <th class="border border-slate-300 px-2 w-24 text-right">Qty</th>
            <th class="border border-slate-300 px-2 w-28 text-right">Rate</th>
            <th class="border border-slate-300 px-2 w-28 text-right">Amount</th>
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
                @if (searchRow() === r && productHits().length) {
                  <div class="absolute top-full left-0 z-50 w-80 bg-white border rounded-b shadow-lg max-h-64 overflow-auto">
                    @for (hit of productHits(); track hit.id; let i = $index) {
                      <div (mousedown)="pickProduct(r, hit)"
                           class="px-2 py-1.5 cursor-pointer flex justify-between gap-2"
                           [class.bg-amber-100]="i === productHitIdx()">
                        <span class="truncate">{{ hit.name }}</span>
                        <span class="text-slate-400">₹{{ fmt(hit.salePrice ?? hit.basePrice) }}</span>
                      </div>
                    }
                  </div>
                }
              </td>
              <td class="border border-slate-300 p-0">
                <input [attr.data-cell]="r + ':qty'" type="number" [(ngModel)]="row.qty" (keydown)="onCellKey($event, r, 'qty')"
                       class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
              </td>
              <td class="border border-slate-300 p-0">
                <input [attr.data-cell]="r + ':rate'" type="number" [(ngModel)]="row.rate" (keydown)="onCellKey($event, r, 'rate')"
                       class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
              </td>
              <td class="border border-slate-300 px-2 text-right font-medium">{{ fmt(lineAmount(row)) }}</td>
            </tr>
          }
        </tbody>
      </table>

      <div class="flex gap-4 mt-3 items-start max-w-3xl">
        <label class="text-sm flex-1">Reason
          <input data-cell="note" [(ngModel)]="reason" (keydown)="onNoteKey($event)"
                 class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
        </label>
        <div class="text-sm w-64 space-y-1">
          <div class="flex justify-between"><span class="text-slate-500">Taxable</span><span>{{ fmt(taxable()) }}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">GST</span><span>{{ fmt(totalTax()) }}</span></div>
          <div class="flex justify-between font-semibold text-base border-t pt-1"><span>Total</span><span>₹{{ fmt(grandTotal()) }}</span></div>
          @if (error()) { <p class="text-red-600 text-xs">{{ error() }}</p> }
          <button (click)="save()" [disabled]="saving() || !canSave()"
                  class="w-full mt-1 px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50">
            {{ saving() ? 'Saving…' : 'Save Note (Ctrl+A)' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ReturnsEntryComponent {
  private readonly entry = inject(EntryService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly today = new Date();
  readonly tick = signal(0);
  readonly mode = signal<Mode>('credit');

  partyQuery = '';
  readonly partyHits = signal<Array<CustomerHit | SupplierHit>>([]);
  readonly partyHitIdx = signal(0);
  readonly party = signal<{ id: string; name: string } | null>(null);

  rows: Row[] = [this.blankRow(), this.blankRow()];
  readonly productHits = signal<ProductHit[]>([]);
  readonly productHitIdx = signal(0);
  readonly searchRow = signal<number | null>(null);

  gstPct: number | null = null;
  reason = '';
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedNumber = signal<string | null>(null);

  private debounce?: ReturnType<typeof setTimeout>;

  private blankRow(): Row {
    return { name: '', qty: null, rate: null };
  }

  setMode(m: Mode): void {
    this.mode.set(m);
    this.party.set(null);
    this.partyQuery = '';
    this.partyHits.set([]);
    this.savedNumber.set(null);
  }

  onPartyQuery(q: string): void {
    this.party.set(null);
    clearTimeout(this.debounce);
    if (!q || q.length < 2) { this.partyHits.set([]); return; }
    this.debounce = setTimeout(() => {
      const src: Observable<Array<CustomerHit | SupplierHit>> =
        this.mode() === 'credit' ? this.entry.customers(q) : this.entry.suppliers(q);
      src.subscribe((hits) => { this.partyHits.set(hits || []); this.partyHitIdx.set(0); });
    }, 200);
  }

  onPartyKey(e: KeyboardEvent): void {
    const hits = this.partyHits();
    if (hits.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.partyHitIdx.set(Math.min(this.partyHitIdx() + 1, hits.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.partyHitIdx.set(Math.max(this.partyHitIdx() - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.pickParty(hits[this.partyHitIdx()]); return; }
      if (e.key === 'Escape') { e.stopPropagation(); this.partyHits.set([]); return; }
    }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.focusCell(0, 'name'); }
  }

  pickParty(hit: { id: string; name: string }): void {
    this.partyQuery = hit.name;
    this.party.set({ id: hit.id, name: hit.name });
    this.partyHits.set([]);
    setTimeout(() => this.focusCell(0, 'name'));
  }

  onProductQuery(r: number, q: string): void {
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
    row.name = hit.name;
    row.rate = Number(hit.salePrice ?? hit.basePrice) || null;
    if (this.gstPct === null && Number(hit.gstRate) > 0) this.gstPct = Number(hit.gstRate);
    this.productHits.set([]); this.searchRow.set(null);
    setTimeout(() => this.focusCell(r, 'qty'));
  }

  onCellKey(e: KeyboardEvent, r: number, col: 'name' | 'qty' | 'rate'): void {
    const hits = this.productHits();
    if (col === 'name' && this.searchRow() === r && hits.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.productHitIdx.set(Math.min(this.productHitIdx() + 1, hits.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.productHitIdx.set(Math.max(this.productHitIdx() - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.pickProduct(r, hits[this.productHitIdx()]); return; }
      if (e.key === 'Escape') { e.stopPropagation(); this.productHits.set([]); this.searchRow.set(null); return; }
    }
    const cols: Array<'name' | 'qty' | 'rate'> = ['name', 'qty', 'rate'];
    switch (e.key) {
      case 'Enter':
      case 'Tab': {
        e.preventDefault();
        const i = cols.indexOf(col);
        if (e.shiftKey) {
          if (i > 0) this.focusCell(r, cols[i - 1]);
          else if (r > 0) this.focusCell(r - 1, 'rate');
          else this.focus('party');
          return;
        }
        if (col === 'name' && !this.rows[r].name) { this.focus('note'); return; }
        if (i < cols.length - 1) { this.focusCell(r, cols[i + 1]); return; }
        if (r + 1 >= this.rows.length) this.rows.push(this.blankRow());
        setTimeout(() => this.focusCell(r + 1, 'name'));
        return;
      }
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

  private focusCell(r: number, col: string): void {
    const el = this.host.nativeElement.querySelector(`[data-cell="${r}:${col}"]`) as HTMLInputElement | null;
    el?.focus(); el?.select();
  }
  private focus(cell: string): void {
    (this.host.nativeElement.querySelector(`[data-cell="${cell}"]`) as HTMLInputElement | null)?.focus();
  }

  /** Miracle: Ctrl+Enter accepts/saves the voucher from anywhere (alias of Ctrl+A). */

  @HostListener('document:keydown.control.enter', ['$event'])

  onCtrlEnterSave(e: Event): void { this.onSaveKey(e as any); }


  @HostListener('document:keydown.control.a', ['$event'])
  onSaveKey(e: Event): void { e.preventDefault(); this.save(); }

  lineAmount(row: Row): number { return money((Number(row.qty) || 0) * (Number(row.rate) || 0)); }
  private liveRows(): Row[] { return this.rows.filter((r) => r.name && (Number(r.qty) || 0) > 0); }
  taxable(): number { return money(this.liveRows().reduce((s, r) => s + this.lineAmount(r), 0)); }
  totalTax(): number { return money(this.taxable() * ((Number(this.gstPct) || 0) / 100)); }
  grandTotal(): number { return money(this.taxable() + this.totalTax()); }
  canSave(): boolean { return !!this.party() && this.liveRows().length > 0 && this.grandTotal() > 0; }
  fmt(n: unknown): string { return (Number(n) || 0).toFixed(2); }

  save(): void {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const items = this.liveRows().map((r) => ({
      description: r.name,
      quantity: Number(r.qty),
      unitPrice: Number(r.rate) || 0,
    }));
    const taxRate = (Number(this.gstPct) || 0) / 100; // return notes take a fraction
    const done = {
      next: (note: any) => {
        this.saving.set(false);
        this.savedNumber.set(note?.noteNumber || 'note');
        this.rows = [this.blankRow(), this.blankRow()];
        this.reason = '';
        this.partyQuery = '';
        this.party.set(null);
        this.tick.update((t) => t + 1);
        setTimeout(() => this.focus('party'));
      },
      error: (err: any) => {
        this.saving.set(false);
        this.error.set(err?.error?.message || 'Failed to save note');
      },
    };
    if (this.mode() === 'credit') {
      this.entry.createCreditNote({ customerId: this.party()!.id, customerName: this.party()!.name, items, taxRate, reason: this.reason || undefined }).subscribe(done);
    } else {
      this.entry.createDebitNote({ supplierId: this.party()!.id, items, taxRate, reason: this.reason || undefined }).subscribe(done);
    }
  }
}
