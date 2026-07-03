import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../../core/services/accounting.service';

@Component({
  selector: 'wa-vouchers',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="p-4 md:p-6">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Vouchers</h1>
        <div class="flex gap-2 flex-wrap">
          <a routerLink="/entry/sales"
             class="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-500">
            Sales Invoice <span class="opacity-70">(F8)</span>
          </a>
          <a routerLink="/entry/purchase"
             class="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-500">
            Purchase <span class="opacity-70">(F9)</span>
          </a>
          <a routerLink="/entry/receipt"
             class="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-500">
            Receipt <span class="opacity-70">(F6)</span>
          </a>
          <a routerLink="/entry/payment"
             class="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-500">
            Payment <span class="opacity-70">(F5)</span>
          </a>
          <a routerLink="/entry/quote"
             class="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-500">
            Quotation
          </a>
          <a routerLink="/entry/order"
             class="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-500">
            Sales Order
          </a>
          <a routerLink="/gateway"
             class="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-700">
            Gateway <span class="opacity-70">(F1)</span>
          </a>
          <a routerLink="/entry/returns"
             class="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-500">
            Returns
          </a>
          <a routerLink="/entry/stock"
             class="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-500">
            Stock Journal
          </a>
          <a routerLink="/entry/masters"
             class="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-500">
            Price & Credit Masters
          </a>
          <a routerLink="/accounting/reports/ageing"
             class="px-3 py-1.5 rounded-md bg-slate-700 text-white text-sm hover:bg-slate-600">
            Ageing
          </a>
          @for (t of types; track t.type) {
            <a [routerLink]="['/accounting/vouchers/new']" [queryParams]="{ type: t.type }"
               class="px-3 py-1.5 rounded-md bg-slate-800 text-white text-sm hover:bg-slate-700">
              {{ t.label }} <span class="opacity-60">({{ t.key }})</span>
            </a>
          }
        </div>
      </div>

      @if (loading()) {
        <p class="text-slate-500">Loading…</p>
      } @else if (vouchers().length === 0) {
        <p class="text-slate-500">No vouchers yet. Create one above (or press F2 for Sales).</p>
      } @else {
        <div class="overflow-x-auto border rounded-lg">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-600">
              <tr>
                <th class="text-left p-2">Date</th>
                <th class="text-left p-2">Type</th>
                <th class="text-left p-2">Number</th>
                <th class="text-left p-2">Party</th>
                <th class="text-left p-2">Narration</th>
                <th class="text-right p-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              @for (v of vouchers(); track v.id) {
                <tr class="border-t cursor-pointer hover:bg-slate-50" (click)="toggle(v.id)">
                  <td class="p-2">{{ v.date }}</td>
                  <td class="p-2 capitalize">{{ v.voucherType }}</td>
                  <td class="p-2 font-mono">{{ v.number }}</td>
                  <td class="p-2">{{ v.partyName || '—' }}</td>
                  <td class="p-2 text-slate-500">{{ v.narration || '' }}</td>
                  <td class="p-2 text-right font-medium">{{ fmt(v.amount) }} <span class="text-slate-300">{{ expanded() === v.id ? '▾' : '▸' }}</span></td>
                </tr>
                @if (expanded() === v.id) {
                  <tr class="border-t bg-slate-50">
                    <td colspan="6" class="p-2">
                      @if (entries(); as es) {
                        <table class="w-full text-xs max-w-xl ml-6">
                          <thead class="text-slate-500"><tr>
                            <th class="text-left py-1">Ledger</th><th class="text-right py-1 w-28">Debit</th><th class="text-right py-1 w-28">Credit</th>
                          </tr></thead>
                          <tbody>
                            @for (e of es; track $index) {
                              <tr><td class="py-0.5">{{ e.ledgerName }}</td>
                                <td class="py-0.5 text-right">{{ +e.debit ? fmt(e.debit) : '' }}</td>
                                <td class="py-0.5 text-right">{{ +e.credit ? fmt(e.credit) : '' }}</td></tr>
                            }
                          </tbody>
                        </table>
                      } @else { <span class="text-xs text-slate-400 ml-6">Loading entries…</span> }
                      <button (click)="cancelVoucher(v.id); $event.stopPropagation()"
                              class="ml-6 mt-1 text-xs px-2 py-0.5 rounded border border-red-300 text-red-600 hover:bg-red-50">
                        Cancel voucher
                      </button>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class VouchersComponent {
  private readonly acc = inject(AccountingService);
  readonly vouchers = signal<any[]>([]);
  readonly loading = signal(true);
  readonly types = [
    // F6/F8/F9 grids are the emerald buttons above; these are bare ledger vouchers.
    { type: 'sales', label: 'Sales', key: 'ledger' },
    { type: 'purchase', label: 'Purchase', key: 'ledger' },
    { type: 'receipt', label: 'Receipt', key: 'ledger' },
    { type: 'payment', label: 'Payment', key: 'ledger' },
    { type: 'contra', label: 'Contra', key: 'F4' },
    { type: 'journal', label: 'Journal', key: 'F7' },
  ];

  readonly expanded = signal<string | null>(null);
  readonly entries = signal<any[] | null>(null);

  constructor() {
    this.acc.vouchers().subscribe({
      next: (v) => { this.vouchers.set(v || []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  cancelVoucher(id: string): void {
    if (!confirm('Cancel this voucher? It will be excluded from all reports.')) return;
    this.acc.cancelVoucher(id).subscribe(() => {
      this.expanded.set(null);
      this.acc.vouchers().subscribe((rows) => this.vouchers.set(rows || []));
    });
  }

  /** Drill down: expand a voucher to its debit/credit entries (Tally day-book style). */
  toggle(id: string): void {
    if (this.expanded() === id) { this.expanded.set(null); return; }
    this.expanded.set(id);
    this.entries.set(null);
    this.acc.voucher(id).subscribe((v) => this.entries.set(v?.entries || []));
  }

  fmt(n: unknown): string {
    return Number(n || 0).toFixed(2);
  }
}
