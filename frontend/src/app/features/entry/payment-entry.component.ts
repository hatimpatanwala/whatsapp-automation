import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { EntryService, SupplierHit, SupplierContext, OpenPurchaseBill } from '../../core/services/entry.service';
import { EntryLookupComponent } from './entry-lookup.component';

interface BillRow extends OpenPurchaseBill {
  allocate: number | null;
}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Payment — supplier bill-wise allocation (F5), Tally/Miracle style.
 *
 * Pick the supplier → their open purchase bills appear oldest-first with age. Type the
 * amount paid → FIFO auto-allocation (editable). Cash/Bank toggle decides the credit
 * ledger. Ctrl+A records a payment against every allocated bill; each auto-posts a
 * Payment voucher (Dr Supplier, Cr Cash/Bank) and reconciles the purchase balance.
 */
@Component({
  selector: 'wa-payment-entry',
  standalone: true,
  imports: [FormsModule, DatePipe, EntryLookupComponent],
  template: `
    <div class="p-3 md:p-5 max-w-5xl select-none">
      <span class="hidden">{{ tick() }}</span>

      <div class="flex items-center gap-4 mb-3 border-b pb-2">
        <h1 class="text-lg font-semibold">Payment <span class="text-slate-400 text-sm">(F6)</span></h1>
        <span class="text-sm text-slate-500">{{ today | date: 'dd-MM-yyyy' }}</span>
        <label class="ml-auto flex items-center gap-2 text-sm">
          Paid from
          <select [(ngModel)]="method" class="border rounded px-2 py-1">
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        @if (savedCount()) {
          <span class="text-sm px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✓ {{ savedCount() }} bill(s) paid & posted to books
          </span>
        }
      </div>

      <div class="flex flex-wrap items-center gap-3 mb-4">
        <label class="text-sm font-medium">Party A/c</label>
        <div class="relative flex-1 min-w-64 max-w-md">
          <input data-cell="party" [(ngModel)]="supplierQuery" (ngModelChange)="onSupplierQuery($event)"
                 (keydown)="onPartyKey($event)"
                 class="w-full border rounded px-2 py-1.5 text-sm focus:bg-amber-50 focus:outline-none focus:border-amber-400"
                 placeholder="Type supplier name / GSTIN…" autocomplete="off" />
          @if (supplierHits().length) {
            <div class="absolute top-full left-0 z-50 w-full bg-white border rounded-b shadow-lg max-h-64 overflow-auto">
              @for (hit of supplierHits(); track hit.id; let i = $index) {
                <div (mousedown)="pickSupplier(hit)"
                     class="px-2 py-1.5 text-sm cursor-pointer flex justify-between"
                     [class.bg-amber-100]="i === supplierHitIdx()">
                  <span>{{ hit.name }}</span><span class="text-slate-400">{{ hit.gstin || hit.phone }}</span>
                </div>
              }
            </div>
          }
        </div>
        <label class="text-sm">Amount paid
          <input data-cell="amount" type="number" [(ngModel)]="amountPaid" (ngModelChange)="autoAllocate()"
                 (keydown)="onAmountKey($event)"
                 class="ml-1 border rounded px-2 py-1.5 w-36 text-right focus:bg-amber-50 focus:outline-none" />
        </label>
        @if (supplier(); as s) {
          <span class="text-sm" [class.text-red-600]="s.outstanding > 0">Payable ₹{{ fmt(s.outstanding) }} · {{ s.openOrders }} open</span>
        }
      </div>

      @if (bills().length) {
        <table class="w-full text-sm border border-slate-300 max-w-4xl" style="border-collapse: collapse">
          <thead>
            <tr class="bg-slate-100 text-slate-600">
              <th class="border border-slate-300 px-2 text-left w-36">Bill</th>
              <th class="border border-slate-300 px-2 w-24">Date</th>
              <th class="border border-slate-300 px-2 w-20 text-right">Age (d)</th>
              <th class="border border-slate-300 px-2 w-28 text-right">Total</th>
              <th class="border border-slate-300 px-2 w-28 text-right">Balance</th>
              <th class="border border-slate-300 px-2 w-32 text-right">Allocate</th>
            </tr>
          </thead>
          <tbody>
            @for (b of bills(); track b.id; let r = $index) {
              <tr>
                <td class="border border-slate-300 px-2 font-mono">{{ b.supplierInvoiceNo || b.orderNumber }}</td>
                <td class="border border-slate-300 px-2">{{ b.issuedAt | date: 'dd-MM-yy' }}</td>
                <td class="border border-slate-300 px-2 text-right"
                    [class.text-red-600]="b.ageDays > 30" [class.font-semibold]="b.ageDays > 90">{{ b.ageDays }}</td>
                <td class="border border-slate-300 px-2 text-right">{{ fmt(b.total) }}</td>
                <td class="border border-slate-300 px-2 text-right">{{ fmt(b.balanceDue) }}</td>
                <td class="border border-slate-300 p-0">
                  <input [attr.data-cell]="r + ':allocate'" type="number" [(ngModel)]="b.allocate"
                         (keydown)="onAllocKey($event, r)"
                         class="w-full px-2 py-1 text-right focus:bg-amber-50 focus:outline-none" />
                </td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr class="bg-slate-50 font-medium">
              <td colspan="4" class="border border-slate-300 px-2 py-1 text-right text-slate-500">Allocated / Paid</td>
              <td class="border border-slate-300 px-2 text-right" [class.text-red-600]="overAllocated()">{{ fmt(allocated()) }}</td>
              <td class="border border-slate-300 px-2 text-right">{{ fmt(amountPaid || 0) }}</td>
            </tr>
          </tfoot>
        </table>

        <div class="flex items-center gap-3 mt-3 max-w-4xl">
          <label class="text-sm flex-1">Narration
            <input data-cell="note" [(ngModel)]="note" (keydown)="onNoteKey($event)"
                   class="mt-1 w-full border rounded px-2 py-1.5 focus:bg-amber-50 focus:outline-none" autocomplete="off" />
          </label>
          <div class="w-64">
            @if (error()) { <p class="text-red-600 text-xs mb-1">{{ error() }}</p> }
            @if (overAllocated()) { <p class="text-amber-600 text-xs mb-1">Allocation exceeds a bill balance or the amount paid.</p> }
            <button (click)="save()" [disabled]="saving() || !canSave()"
                    class="w-full px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50">
              {{ saving() ? 'Saving…' : 'Record Payment (Ctrl+A)' }}
            </button>
          </div>
        </div>
      } @else if (supplier()) {
        <p class="text-slate-500 text-sm">No open purchase bills — this supplier is fully paid. 🎉</p>
      } @else {
        <p class="text-slate-400 text-sm">Select a supplier to see their open bills, oldest first, with ageing.</p>
      }
      <wa-entry-lookup [kind]="'supplier'" [party]="supplier()" [rows]="[]" />
    </div>
  `,
})
export class PaymentEntryComponent {
  private readonly entry = inject(EntryService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly today = new Date();
  readonly tick = signal(0);

  supplierQuery = '';
  readonly supplierHits = signal<SupplierHit[]>([]);
  readonly supplierHitIdx = signal(0);
  readonly supplier = signal<SupplierContext | null>(null);
  readonly bills = signal<BillRow[]>([]);

  amountPaid: number | null = null;
  method: 'cash' | 'bank' = 'bank';
  note = '';
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedCount = signal(0);

  private debounce?: ReturnType<typeof setTimeout>;

  onSupplierQuery(q: string): void {
    this.supplier.set(null);
    this.bills.set([]);
    clearTimeout(this.debounce);
    if (!q || q.length < 2) { this.supplierHits.set([]); return; }
    this.debounce = setTimeout(() => {
      this.entry.suppliers(q).subscribe((hits) => { this.supplierHits.set(hits || []); this.supplierHitIdx.set(0); });
    }, 200);
  }

  onPartyKey(e: KeyboardEvent): void {
    const hits = this.supplierHits();
    if (hits.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.supplierHitIdx.set(Math.min(this.supplierHitIdx() + 1, hits.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.supplierHitIdx.set(Math.max(this.supplierHitIdx() - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.pickSupplier(hits[this.supplierHitIdx()]); return; }
      if (e.key === 'Escape') { e.stopPropagation(); this.supplierHits.set([]); return; }
    }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.focus('amount'); }
  }

  pickSupplier(hit: SupplierHit): void {
    this.supplierQuery = hit.name;
    this.supplierHits.set([]);
    this.entry.supplierContext(hit.id).subscribe((ctx) => this.supplier.set(ctx));
    this.entry.openPurchaseBills(hit.id).subscribe((bills) => {
      this.bills.set((bills || []).map((b) => ({ ...b, allocate: null })));
    });
    setTimeout(() => this.focus('amount'));
  }

  autoAllocate(): void {
    let remaining = money(Number(this.amountPaid) || 0);
    const rows = this.bills();
    for (const b of rows) {
      const due = money(Number(b.balanceDue) || 0);
      const take = Math.min(due, remaining);
      b.allocate = take > 0 ? take : null;
      remaining = money(remaining - take);
    }
    this.bills.set([...rows]);
  }

  onAmountKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.focusAlloc(0); }
  }
  onAllocKey(e: KeyboardEvent, r: number): void {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) { r > 0 ? this.focusAlloc(r - 1) : this.focus('amount'); return; }
      r + 1 < this.bills().length ? this.focusAlloc(r + 1) : this.focus('note');
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (r + 1 < this.bills().length) this.focusAlloc(r + 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (r > 0) this.focusAlloc(r - 1); return; }
  }
  onNoteKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') { e.preventDefault(); this.save(); }
  }

  private focusAlloc(r: number): void {
    const el = this.host.nativeElement.querySelector(`[data-cell="${r}:allocate"]`) as HTMLInputElement | null;
    el?.focus(); el?.select();
  }
  private focus(cell: string): void {
    (this.host.nativeElement.querySelector(`[data-cell="${cell}"]`) as HTMLInputElement | null)?.focus();
  }

  @HostListener('document:keydown.control.a', ['$event'])
  onSaveKey(e: Event): void { e.preventDefault(); this.save(); }

  allocated(): number { return money(this.bills().reduce((s, b) => s + (Number(b.allocate) || 0), 0)); }
  overAllocated(): boolean {
    const paid = money(Number(this.amountPaid) || 0);
    if (paid > 0 && this.allocated() > paid) return true;
    return this.bills().some((b) => (Number(b.allocate) || 0) > money(Number(b.balanceDue) || 0) + 0.005);
  }
  canSave(): boolean { return this.allocated() > 0 && !this.overAllocated(); }
  fmt(n: unknown): string { return (Number(n) || 0).toFixed(2); }

  async save(): Promise<void> {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const toPay = this.bills().filter((b) => (Number(b.allocate) || 0) > 0);
    let done = 0;
    try {
      for (const b of toPay) {
        await firstValueFrom(this.entry.paySupplierOrder(b.id, money(Number(b.allocate)), this.method, this.note || undefined));
        done++;
      }
      this.savedCount.set(done);
      const s = this.supplier();
      if (s) {
        this.entry.openPurchaseBills(s.id).subscribe((bills) => this.bills.set((bills || []).map((x) => ({ ...x, allocate: null }))));
        this.entry.supplierContext(s.id).subscribe((ctx) => this.supplier.set(ctx));
      }
      this.amountPaid = null;
      this.note = '';
      this.tick.update((t) => t + 1);
      setTimeout(() => this.focus('party'));
    } catch (err: any) {
      this.error.set(err?.error?.message || `Failed after paying ${done} bill(s)`);
    } finally {
      this.saving.set(false);
    }
  }
}
