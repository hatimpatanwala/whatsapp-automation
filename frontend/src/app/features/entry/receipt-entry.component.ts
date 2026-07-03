import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { EntryService, CustomerHit, CustomerContext, OpenBill } from '../../core/services/entry.service';
import { EntryLookupComponent } from './entry-lookup.component';

interface BillRow extends OpenBill {
  allocate: number | null;
}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Receipt — bill-wise allocation (F6), Tally/Miracle style.
 *
 * Pick the party → their open bills appear oldest-first with age. Type the amount
 * received → it auto-allocates FIFO across bills (editable per bill). Ctrl+A records
 * a payment against every allocated bill; each payment auto-posts a Receipt voucher
 * (Dr Cash/Bank, Cr Party) and reconciles the invoice's balance/status.
 */
@Component({
  selector: 'wa-receipt-entry',
  standalone: true,
  imports: [FormsModule, DatePipe, EntryLookupComponent],
  template: `
    <div class="p-3 md:p-5 max-w-5xl select-none">
      <span class="hidden">{{ tick() }}</span>

      <div class="flex items-center gap-4 mb-3 border-b pb-2">
        <h1 class="text-lg font-semibold">Receipt <span class="text-slate-400 text-sm">(F5)</span></h1>
        <span class="text-sm text-slate-500">{{ today | date: 'dd-MM-yyyy' }}</span>
        @if (savedCount()) {
          <span class="text-sm px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✓ {{ savedCount() }} bill(s) settled & posted to books
          </span>
        }
      </div>

      <!-- Party + amount -->
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <label class="text-sm font-medium">Party A/c</label>
        <div class="relative flex-1 min-w-64 max-w-md">
          <input data-cell="party" [(ngModel)]="customerQuery" (ngModelChange)="onCustomerQuery($event)"
                 (keydown)="onPartyKey($event)"
                 class="w-full border rounded px-2 py-1.5 text-sm focus:bg-amber-50 focus:outline-none focus:border-amber-400"
                 placeholder="Type customer name / phone…" autocomplete="off" />
          @if (customerHits().length) {
            <div class="absolute top-full left-0 z-50 w-full bg-white border rounded-b shadow-lg max-h-64 overflow-auto">
              @for (hit of customerHits(); track hit.id; let i = $index) {
                <div (mousedown)="pickCustomer(hit)"
                     class="px-2 py-1.5 text-sm cursor-pointer flex justify-between"
                     [class.bg-amber-100]="i === customerHitIdx()">
                  <span>{{ hit.name }}</span><span class="text-slate-400">{{ hit.phone }}</span>
                </div>
              }
            </div>
          }
        </div>
        <label class="text-sm">Amount received
          <input data-cell="amount" type="number" [(ngModel)]="amountReceived" (ngModelChange)="autoAllocate()"
                 (keydown)="onAmountKey($event)"
                 class="ml-1 border rounded px-2 py-1.5 w-36 text-right focus:bg-amber-50 focus:outline-none" />
        </label>
        @if (customer(); as c) {
          <span class="text-sm" [class.text-red-600]="c.outstanding > 0">
            Outstanding ₹{{ fmt(c.outstanding) }} · {{ c.openInvoices }} open
          </span>
        }
      </div>

      <!-- Open bills grid -->
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
                <td class="border border-slate-300 px-2 font-mono">{{ b.invoiceNumber }}</td>
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
              <td colspan="4" class="border border-slate-300 px-2 py-1 text-right text-slate-500">Allocated / Received</td>
              <td class="border border-slate-300 px-2 text-right" [class.text-red-600]="overAllocated()">{{ fmt(allocated()) }}</td>
              <td class="border border-slate-300 px-2 text-right">{{ fmt(amountReceived || 0) }}</td>
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
            @if (overAllocated()) { <p class="text-amber-600 text-xs mb-1">Allocation exceeds a bill balance or the amount received.</p> }
            <button (click)="save()" [disabled]="saving() || !canSave()"
                    class="w-full px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50">
              {{ saving() ? 'Saving…' : 'Record Receipt (Ctrl+A)' }}
            </button>
          </div>
        </div>
      } @else if (customer()) {
        <p class="text-slate-500 text-sm">No open bills — this party is fully settled. 🎉</p>
      } @else {
        <p class="text-slate-400 text-sm">Select a party to see their open bills, oldest first, with ageing.</p>
      }
      <wa-entry-lookup [kind]="'customer'" [party]="customer()" [rows]="[]" />
    </div>
  `,
})
export class ReceiptEntryComponent {
  private readonly entry = inject(EntryService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly today = new Date();
  readonly tick = signal(0);

  customerQuery = '';
  readonly customerHits = signal<CustomerHit[]>([]);
  readonly customerHitIdx = signal(0);
  readonly customer = signal<CustomerContext | null>(null);
  readonly bills = signal<BillRow[]>([]);

  amountReceived: number | null = null;
  note = '';
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedCount = signal(0);

  private debounce?: ReturnType<typeof setTimeout>;

  onCustomerQuery(q: string): void {
    this.customer.set(null);
    this.bills.set([]);
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
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.focus('amount'); }
  }

  pickCustomer(hit: CustomerHit): void {
    this.customerQuery = hit.name;
    this.customerHits.set([]);
    this.entry.customerContext(hit.id).subscribe((ctx) => this.customer.set(ctx));
    this.entry.openBills(hit.id).subscribe((bills) => {
      this.bills.set((bills || []).map((b) => ({ ...b, allocate: null })));
    });
    setTimeout(() => this.focus('amount'));
  }

  /** FIFO auto-allocation across bills, oldest first (editable afterwards). */
  autoAllocate(): void {
    let remaining = money(Number(this.amountReceived) || 0);
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

  /** Miracle: Ctrl+Enter accepts/saves the voucher from anywhere (alias of Ctrl+A). */

  @HostListener('document:keydown.control.enter', ['$event'])

  onCtrlEnterSave(e: Event): void { this.onSaveKey(e as any); }


  @HostListener('document:keydown.control.a', ['$event'])
  onSaveKey(e: Event): void { e.preventDefault(); this.save(); }

  allocated(): number {
    return money(this.bills().reduce((s, b) => s + (Number(b.allocate) || 0), 0));
  }
  overAllocated(): boolean {
    const received = money(Number(this.amountReceived) || 0);
    if (received > 0 && this.allocated() > received) return true;
    return this.bills().some((b) => (Number(b.allocate) || 0) > money(Number(b.balanceDue) || 0) + 0.005);
  }
  canSave(): boolean { return this.allocated() > 0 && !this.overAllocated(); }
  fmt(n: unknown): string { return (Number(n) || 0).toFixed(2); }

  /** Record a payment per allocated bill, sequentially (each auto-posts a Receipt voucher). */
  async save(): Promise<void> {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const toSettle = this.bills().filter((b) => (Number(b.allocate) || 0) > 0);
    let done = 0;
    try {
      for (const b of toSettle) {
        await firstValueFrom(this.entry.recordPayment(b.id, money(Number(b.allocate)), this.note || undefined));
        done++;
      }
      this.savedCount.set(done);
      // Reload bills to show the new balances.
      const c = this.customer();
      if (c) {
        this.entry.openBills(c.id).subscribe((bills) => this.bills.set((bills || []).map((x) => ({ ...x, allocate: null }))));
        this.entry.customerContext(c.id).subscribe((ctx) => this.customer.set(ctx));
      }
      this.amountReceived = null;
      this.note = '';
      this.tick.update((t) => t + 1);
      setTimeout(() => this.focus('party'));
    } catch (err: any) {
      this.error.set(err?.error?.message || `Failed after settling ${done} bill(s)`);
    } finally {
      this.saving.set(false);
    }
  }
}
