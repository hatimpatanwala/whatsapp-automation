import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AccountingService, Ledger } from '../../core/services/accounting.service';
import { EntryService } from '../../core/services/entry.service';

const TITLES: Record<string, string> = {
  'trial-balance': 'Trial Balance',
  pnl: 'Profit & Loss',
  'balance-sheet': 'Balance Sheet',
  'day-book': 'Day Book',
  ageing: 'Bills Outstanding (Ageing)',
  'stock-summary': 'Stock Summary',
  ledger: 'Ledger Statement',
};

@Component({
  selector: 'wa-acc-reports',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="p-4 md:p-6">
      <h1 class="text-xl font-semibold mb-4">{{ title() }}</h1>

      @if (loading()) {
        <p class="text-slate-500">Loading…</p>
      } @else if (!data()) {
        <p class="text-slate-500">No data.</p>
      } @else {
        @switch (report()) {
          @case ('trial-balance') {
            <div class="border rounded-lg overflow-x-auto max-w-3xl">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-600"><tr>
                  <th class="text-left p-2">Ledger</th><th class="text-right p-2">Debit</th><th class="text-right p-2">Credit</th>
                </tr></thead>
                <tbody>
                  @for (r of data().rows; track r.name) {
                    <tr class="border-t"><td class="p-2">{{ r.name }}</td>
                      <td class="p-2 text-right">{{ r.debit ? fmt(r.debit) : '' }}</td>
                      <td class="p-2 text-right">{{ r.credit ? fmt(r.credit) : '' }}</td></tr>
                  }
                </tbody>
                <tfoot class="bg-slate-50 font-semibold"><tr class="border-t">
                  <td class="p-2 text-right">Total</td>
                  <td class="p-2 text-right">{{ fmt(data().totalDebit) }}</td>
                  <td class="p-2 text-right">{{ fmt(data().totalCredit) }}</td>
                </tr></tfoot>
              </table>
            </div>
            <p class="mt-2 text-sm" [class.text-green-600]="data().balanced" [class.text-red-600]="!data().balanced">
              {{ data().balanced ? '✓ Balanced' : '✗ Not balanced' }}
            </p>
          }
          @case ('pnl') {
            <div class="grid md:grid-cols-2 gap-6 max-w-4xl">
              <div class="border rounded-lg overflow-hidden">
                <div class="bg-slate-50 p-2 font-semibold">Expenses</div>
                <table class="w-full text-sm">
                  <tbody>
                    @for (r of data().expense; track r.name) { <tr class="border-t"><td class="p-2">{{ r.name }}</td><td class="p-2 text-right">{{ fmt(r.amount) }}</td></tr> }
                  </tbody>
                  <tfoot class="font-semibold bg-slate-50"><tr class="border-t"><td class="p-2">Total Expense</td><td class="p-2 text-right">{{ fmt(data().totalExpense) }}</td></tr></tfoot>
                </table>
              </div>
              <div class="border rounded-lg overflow-hidden">
                <div class="bg-slate-50 p-2 font-semibold">Income</div>
                <table class="w-full text-sm">
                  <tbody>
                    @for (r of data().income; track r.name) { <tr class="border-t"><td class="p-2">{{ r.name }}</td><td class="p-2 text-right">{{ fmt(r.amount) }}</td></tr> }
                  </tbody>
                  <tfoot class="font-semibold bg-slate-50"><tr class="border-t"><td class="p-2">Total Income</td><td class="p-2 text-right">{{ fmt(data().totalIncome) }}</td></tr></tfoot>
                </table>
              </div>
            </div>
            <p class="mt-3 text-lg font-semibold" [class.text-green-600]="data().netProfit >= 0" [class.text-red-600]="data().netProfit < 0">
              Net {{ data().netProfit >= 0 ? 'Profit' : 'Loss' }}: {{ fmt(abs(data().netProfit)) }}
            </p>
          }
          @case ('balance-sheet') {
            <div class="grid md:grid-cols-2 gap-6 max-w-4xl">
              <div class="border rounded-lg overflow-hidden">
                <div class="bg-slate-50 p-2 font-semibold">Liabilities</div>
                <table class="w-full text-sm">
                  <tbody>
                    @for (r of data().liabilities; track r.name) { <tr class="border-t"><td class="p-2">{{ r.name }}</td><td class="p-2 text-right">{{ fmt(r.amount) }}</td></tr> }
                    <tr class="border-t"><td class="p-2 italic">Net Profit</td><td class="p-2 text-right">{{ fmt(data().netProfit) }}</td></tr>
                  </tbody>
                  <tfoot class="font-semibold bg-slate-50"><tr class="border-t"><td class="p-2">Total</td><td class="p-2 text-right">{{ fmt(data().totalLiabilities) }}</td></tr></tfoot>
                </table>
              </div>
              <div class="border rounded-lg overflow-hidden">
                <div class="bg-slate-50 p-2 font-semibold">Assets</div>
                <table class="w-full text-sm">
                  <tbody>
                    @for (r of data().assets; track r.name) { <tr class="border-t"><td class="p-2">{{ r.name }}</td><td class="p-2 text-right">{{ fmt(r.amount) }}</td></tr> }
                  </tbody>
                  <tfoot class="font-semibold bg-slate-50"><tr class="border-t"><td class="p-2">Total</td><td class="p-2 text-right">{{ fmt(data().totalAssets) }}</td></tr></tfoot>
                </table>
              </div>
            </div>
          }
          @case ('day-book') {
            <div class="border rounded-lg overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-600"><tr>
                  <th class="text-left p-2">Type</th><th class="text-left p-2">Number</th><th class="text-left p-2">Party</th><th class="text-right p-2">Amount</th>
                </tr></thead>
                <tbody>
                  @for (v of data().vouchers; track v.id) {
                    <tr class="border-t"><td class="p-2 capitalize">{{ v.voucherType }}</td><td class="p-2 font-mono">{{ v.number }}</td>
                      <td class="p-2">{{ v.partyName || '—' }}</td><td class="p-2 text-right">{{ fmt(v.amount) }}</td></tr>
                  } @empty { <tr><td colspan="4" class="p-3 text-slate-500">No vouchers for {{ data().date }}.</td></tr> }
                </tbody>
              </table>
            </div>
          }
          @case ('stock-summary') {
            <div class="border rounded-lg overflow-x-auto max-w-4xl">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-600"><tr>
                  <th class="text-left p-2">Item</th><th class="text-left p-2">UoM</th>
                  <th class="text-right p-2">Stock</th><th class="text-right p-2">Rate</th><th class="text-right p-2">Value</th>
                </tr></thead>
                <tbody>
                  @for (r of data(); track r.id) {
                    <tr class="border-t">
                      <td class="p-2">{{ r.name }}</td><td class="p-2 text-slate-500">{{ r.uom }}</td>
                      <td class="p-2 text-right" [class.text-red-600]="+r.stock <= 0">{{ r.stock }}</td>
                      <td class="p-2 text-right">{{ fmt(r.salePrice ?? r.basePrice) }}</td>
                      <td class="p-2 text-right font-medium">{{ fmt(r.stockValue) }}</td>
                    </tr>
                  } @empty { <tr><td colspan="5" class="p-3 text-slate-500">No products.</td></tr> }
                </tbody>
                <tfoot class="bg-slate-50 font-semibold"><tr class="border-t">
                  <td colspan="4" class="p-2 text-right">Total stock value</td>
                  <td class="p-2 text-right">{{ fmt(stockTotal()) }}</td>
                </tr></tfoot>
              </table>
            </div>
          }
          @case ('ledger') {
            <div class="flex items-center gap-2 mb-4">
              <label class="text-sm font-medium">Ledger</label>
              <select [ngModel]="ledgerId()" (ngModelChange)="pickLedger($event)" class="border rounded px-2 py-1.5 text-sm min-w-64">
                <option value="">— select a ledger —</option>
                @for (l of ledgers(); track l.id) { <option [value]="l.id">{{ l.name }} ({{ l.groupName }})</option> }
              </select>
            </div>
            @if (statement(); as st) {
              <div class="border rounded-lg overflow-x-auto max-w-4xl">
                <table class="w-full text-sm">
                  <thead class="bg-slate-50 text-slate-600"><tr>
                    <th class="text-left p-2">Date</th><th class="text-left p-2">Voucher</th><th class="text-left p-2">Type</th>
                    <th class="text-right p-2">Debit</th><th class="text-right p-2">Credit</th><th class="text-right p-2">Balance</th>
                  </tr></thead>
                  <tbody>
                    <tr class="border-t bg-slate-50"><td colspan="5" class="p-2 italic text-slate-500">Opening balance</td>
                      <td class="p-2 text-right">{{ fmt(st.opening) }}</td></tr>
                    @for (line of st.lines; track $index) {
                      <tr class="border-t">
                        <td class="p-2">{{ line.date }}</td><td class="p-2 font-mono">{{ line.number }}</td>
                        <td class="p-2 capitalize text-slate-500">{{ line.voucherType }}</td>
                        <td class="p-2 text-right">{{ +line.debit ? fmt(line.debit) : '' }}</td>
                        <td class="p-2 text-right">{{ +line.credit ? fmt(line.credit) : '' }}</td>
                        <td class="p-2 text-right font-medium">{{ fmt(line.balance) }}</td>
                      </tr>
                    } @empty { <tr><td colspan="6" class="p-3 text-slate-500">No entries for this ledger.</td></tr> }
                  </tbody>
                  <tfoot class="bg-slate-50 font-semibold"><tr class="border-t">
                    <td colspan="5" class="p-2 text-right">Closing balance</td>
                    <td class="p-2 text-right" [class.text-red-600]="st.closing < 0">{{ fmt(st.closing) }}</td>
                  </tr></tfoot>
                </table>
              </div>
            } @else if (ledgerId()) { <p class="text-slate-500">Loading statement…</p> }
          }
          @case ('ageing') {
            <div class="grid grid-cols-2 gap-3 mb-5 max-w-xl">
              <div class="border rounded-lg p-3"><div class="text-slate-500 text-xs">Total receivable</div>
                <div class="text-lg font-semibold text-red-600">₹{{ fmt(data().totals.receivable) }}</div></div>
              <div class="border rounded-lg p-3"><div class="text-slate-500 text-xs">Total payable</div>
                <div class="text-lg font-semibold text-amber-600">₹{{ fmt(data().totals.payable) }}</div></div>
            </div>
            <label class="text-sm mb-2 inline-block">Interest on overdue @
              <input type="number" [ngModel]="intRate()" (ngModelChange)="intRate.set($event)"
                     class="w-16 border rounded px-1.5 py-0.5 text-right" /> % p.a.
            </label>
            <h2 class="font-semibold mb-2">Receivables (customers owe you)</h2>
            <div class="border rounded-lg overflow-x-auto mb-6">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-600"><tr>
                  <th class="text-left p-2">Party</th><th class="text-right p-2">0–30d</th><th class="text-right p-2">31–60d</th>
                  <th class="text-right p-2">61–90d</th><th class="text-right p-2">90d+</th><th class="text-right p-2">Total</th><th class="text-right p-2">Bills</th><th class="text-right p-2">Interest</th>
                </tr></thead>
                <tbody>
                  @for (r of data().receivables; track r.party) {
                    <tr class="border-t"><td class="p-2">{{ r.party }}</td>
                      <td class="p-2 text-right">{{ fmt(r.d030) }}</td><td class="p-2 text-right">{{ fmt(r.d3160) }}</td>
                      <td class="p-2 text-right">{{ fmt(r.d6190) }}</td>
                      <td class="p-2 text-right" [class.text-red-600]="+r.d90Plus > 0">{{ fmt(r.d90Plus) }}</td>
                      <td class="p-2 text-right font-medium">{{ fmt(r.total) }}</td><td class="p-2 text-right">{{ r.bills }}</td>
                      <td class="p-2 text-right text-red-600">{{ fmt(interestOf(r)) }}</td></tr>
                  } @empty { <tr><td colspan="8" class="p-3 text-slate-500">Nothing outstanding.</td></tr> }
                </tbody>
              </table>
            </div>
            <h2 class="font-semibold mb-2">Payables (you owe suppliers)</h2>
            <div class="border rounded-lg overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-600"><tr>
                  <th class="text-left p-2">Party</th><th class="text-right p-2">0–30d</th><th class="text-right p-2">31–60d</th>
                  <th class="text-right p-2">61–90d</th><th class="text-right p-2">90d+</th><th class="text-right p-2">Total</th><th class="text-right p-2">Bills</th>
                </tr></thead>
                <tbody>
                  @for (r of data().payables; track r.party) {
                    <tr class="border-t"><td class="p-2">{{ r.party }}</td>
                      <td class="p-2 text-right">{{ fmt(r.d030) }}</td><td class="p-2 text-right">{{ fmt(r.d3160) }}</td>
                      <td class="p-2 text-right">{{ fmt(r.d6190) }}</td>
                      <td class="p-2 text-right" [class.text-red-600]="+r.d90Plus > 0">{{ fmt(r.d90Plus) }}</td>
                      <td class="p-2 text-right font-medium">{{ fmt(r.total) }}</td><td class="p-2 text-right">{{ r.bills }}</td></tr>
                  } @empty { <tr><td colspan="7" class="p-3 text-slate-500">Nothing outstanding.</td></tr> }
                </tbody>
              </table>
            </div>
          }
        }
      }
    </div>
  `,
})
export class ReportsComponent {
  private readonly acc = inject(AccountingService);
  private readonly entry = inject(EntryService);
  private readonly route = inject(ActivatedRoute);

  readonly report = signal('trial-balance');
  readonly data = signal<any>(null);
  readonly loading = signal(true);

  // Ledger-statement state
  readonly ledgers = signal<Ledger[]>([]);
  readonly ledgerId = signal('');
  readonly statement = signal<any>(null);
  readonly intRate = signal(18);

  title(): string { return TITLES[this.report()] || 'Report'; }
  fmt(n: unknown): string { return Number(n || 0).toFixed(2); }
  abs(n: number): number { return Math.abs(n); }
  /** Interest on overdue: bucket midpoints (15/45/75/105 days) × rate p.a. */
  interestOf(r: any): number {
    const rate = (Number(this.intRate()) || 0) / 100 / 365;
    return (Number(r.d030) || 0) * 15 * rate + (Number(r.d3160) || 0) * 45 * rate
      + (Number(r.d6190) || 0) * 75 * rate + (Number(r.d90Plus) || 0) * 105 * rate;
  }

  stockTotal(): number {
    const rows = (this.data() as any[]) || [];
    return rows.reduce((s, r) => s + (Number(r.stockValue) || 0), 0);
  }

  constructor() {
    this.route.paramMap.subscribe((p) => {
      this.report.set(p.get('report') || 'trial-balance');
      this.load();
    });
  }

  pickLedger(id: string): void {
    this.ledgerId.set(id);
    this.statement.set(null);
    if (id) this.acc.ledgerStatement(id).subscribe((st) => this.statement.set(st));
  }

  private load(): void {
    this.loading.set(true);
    const done = { next: (d: any) => { this.data.set(d); this.loading.set(false); }, error: () => this.loading.set(false) };
    switch (this.report()) {
      case 'pnl': this.acc.pnl().subscribe(done); break;
      case 'balance-sheet': this.acc.balanceSheet().subscribe(done); break;
      case 'day-book': this.acc.dayBook().subscribe(done); break;
      case 'ageing': this.acc.ageing().subscribe(done); break;
      case 'stock-summary': this.entry.stockSummary().subscribe(done); break;
      case 'ledger':
        // The picker drives the statement; just load the ledger list.
        this.acc.ledgers().subscribe((l) => { this.ledgers.set(l || []); this.data.set(l || []); this.loading.set(false); });
        break;
      default: this.acc.trialBalance().subscribe(done);
    }
  }
}
