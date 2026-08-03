import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AccountingService, Ledger } from '../../core/services/accounting.service';
import { EntryService } from '../../core/services/entry.service';
import { PdfExportService } from '../../core/services/pdf-export.service';

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
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <h1 class="text-xl font-semibold">{{ title() }}</h1>
        <button (click)="downloadPdf()" [disabled]="!data()"
          class="text-sm px-3 py-1.5 rounded bg-slate-800 text-white disabled:opacity-40">⬇ Download PDF</button>
      </div>

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
            <div class="flex items-end gap-3 mb-3 flex-wrap">
              <label class="text-sm">Date
                <input type="date" [ngModel]="dayBookDate()" (ngModelChange)="dayBookDate.set($event); reloadDayBook()"
                       class="block mt-1 border rounded px-2 py-1.5 text-sm" />
              </label>
              <label class="text-sm flex-1 max-w-xs">Party name
                <input type="text" [ngModel]="dayBookParty()" (ngModelChange)="dayBookParty.set($event)"
                       placeholder="Filter by party…" class="block mt-1 w-full border rounded px-2 py-1.5 text-sm" />
              </label>
            </div>
            <div class="border rounded-lg overflow-auto max-h-[65vh]">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-600 sticky top-0"><tr>
                  <th class="text-left p-2">Type</th><th class="text-left p-2">Number</th><th class="text-left p-2">Party</th><th class="text-right p-2">Amount</th>
                </tr></thead>
                <tbody>
                  @for (v of dayBookRows(); track v.id) {
                    <tr class="border-t"><td class="p-2 capitalize">{{ v.voucherType }}</td><td class="p-2 font-mono">{{ v.number }}</td>
                      <td class="p-2">{{ v.partyName || '—' }}</td><td class="p-2 text-right">{{ fmt(v.amount) }}</td></tr>
                  } @empty { <tr><td colspan="4" class="p-3 text-slate-500">No vouchers{{ dayBookParty() ? ' matching “' + dayBookParty() + '”' : '' }} for {{ data().date }}.</td></tr> }
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
            <div class="flex flex-wrap items-center gap-2 mb-4">
              <label class="text-sm font-medium">Ledger</label>
              <input type="text" [ngModel]="ledgerSearch()" (ngModelChange)="ledgerSearch.set($event)"
                     placeholder="Search customer / ledger…" class="border rounded px-2 py-1.5 text-sm min-w-56" />
              <select [ngModel]="ledgerId()" (ngModelChange)="pickLedger($event)" class="border rounded px-2 py-1.5 text-sm min-w-64">
                <option value="">— select a ledger —</option>
                @for (l of filteredLedgers(); track l.id) { <option [value]="l.id">{{ l.name }} ({{ l.groupName }})</option> }
              </select>
              @if (ledgerSearch() && !filteredLedgers().length) { <span class="text-xs text-slate-400">No match</span> }
              @if (statement()) {
                <div class="ml-auto flex gap-2">
                  <button (click)="shareLedger()" class="text-[13px] font-semibold text-green-700 border border-green-300 rounded-lg px-3 py-1.5 flex items-center gap-1.5"><i class="pi pi-whatsapp text-[12px]"></i> Share</button>
                  <button (click)="downloadPdf()" class="text-[13px] font-semibold text-indigo-600 border border-indigo-300 rounded-lg px-3 py-1.5 flex items-center gap-1.5"><i class="pi pi-print text-[12px]"></i> Print / PDF</button>
                </div>
              }
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
  private readonly pdf = inject(PdfExportService);

  readonly report = signal('trial-balance');
  readonly data = signal<any>(null);
  readonly loading = signal(true);

  // Ledger-statement state
  readonly ledgers = signal<Ledger[]>([]);
  readonly ledgerId = signal('');
  readonly statement = signal<any>(null);
  readonly intRate = signal(18);
  readonly ledgerSearch = signal('');
  /** Ledgers filtered by the search box (name or group). */
  readonly filteredLedgers = computed(() => {
    const q = this.ledgerSearch().trim().toLowerCase();
    const all = this.ledgers();
    if (!q) return all;
    return all.filter((l) => (l.name || '').toLowerCase().includes(q) || (l.groupName || '').toLowerCase().includes(q));
  });
  /** Share the current ledger statement summary on WhatsApp. */
  shareLedger(): void {
    const st = this.statement();
    if (!st) return;
    const name = this.ledgers().find((l) => l.id === this.ledgerId())?.name || 'Ledger';
    const lines = (st.lines || []).length;
    const text = `*Ledger — ${name}*\nOpening: ${this.fmt(st.opening)}\nEntries: ${lines}\nClosing balance: *${this.fmt(st.closing)}*`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  // Day Book filters
  readonly dayBookDate = signal<string>(new Date().toISOString().slice(0, 10));
  readonly dayBookParty = signal<string>('');
  /** Day Book vouchers after applying the party-name filter (date filters server-side). */
  dayBookRows(): any[] {
    const rows = (this.data()?.vouchers || []) as any[];
    const q = this.dayBookParty().trim().toLowerCase();
    return q ? rows.filter((v) => (v.partyName || '').toLowerCase().includes(q)) : rows;
  }
  reloadDayBook(): void {
    this.loading.set(true);
    this.acc.dayBook(this.dayBookDate() || undefined).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  title(): string { return TITLES[this.report()] || 'Report'; }
  fmt(n: unknown): string { return Number(n || 0).toFixed(2); }
  abs(n: number): number { return Math.abs(n); }
  /** Interest on overdue: bucket midpoints (15/45/75/105 days) × rate p.a. */
  interestOf(r: any): number {
    const rate = (Number(this.intRate()) || 0) / 100 / 365;
    return (Number(r.d030) || 0) * 15 * rate + (Number(r.d3160) || 0) * 45 * rate
      + (Number(r.d6190) || 0) * 75 * rate + (Number(r.d90Plus) || 0) * 105 * rate;
  }

  /** Export the current report as a PDF (columns/rows per report type). */
  async downloadPdf(): Promise<void> {
    const d = this.data();
    if (!d) return;
    const M = (v: any) => this.pdf.money(v);
    const title = this.title();
    const today = new Date().toLocaleDateString('en-IN');
    const rep = this.report();

    if (rep === 'trial-balance') {
      await this.pdf.exportTable({
        title: 'Trial Balance', subtitle: `as on ${today}`, tally: true,
        columns: [{ header: 'Particulars', key: 'name' }, { header: 'Debit', key: 'debit', align: 'right', fmt: M }, { header: 'Credit', key: 'credit', align: 'right', fmt: M }],
        rows: [...(d.rows || []), { name: 'Total', debit: d.totalDebit, credit: d.totalCredit }],
      });
    } else if (rep === 'pnl') {
      // Tally Profit & Loss A/c — two-sided: Expenditure (Dr) | Income (Cr).
      // Net Profit sits on the expenditure side, Net Loss on the income side, so
      // both columns total to the same figure (as in Tally).
      const np = Number(d.netProfit) || 0;
      const left = (d.expense || []).map((r: any) => ({ name: r.name, amount: Number(r.amount) || 0 }));
      if (np >= 0) left.push({ name: 'Net Profit', amount: np });
      const right = (d.income || []).map((r: any) => ({ name: r.name, amount: Number(r.amount) || 0 }));
      if (np < 0) right.push({ name: 'Net Loss', amount: -np });
      await this.pdf.exportTallyStatement({
        title: 'Profit & Loss A/c', period: `for the period ending ${today}`,
        left: { heading: 'Expenditure', rows: left, totalLabel: 'Total' },
        right: { heading: 'Income', rows: right, totalLabel: 'Total' },
      });
    } else if (rep === 'balance-sheet') {
      // Tally Balance Sheet — Liabilities | Assets. Net Profit adds to the
      // liabilities (capital) side so both sides balance.
      const liab = (d.liabilities || []).map((r: any) => ({ name: r.name, amount: Number(r.amount) || 0 }));
      liab.push({ name: 'Net Profit (to Capital)', amount: Number(d.netProfit) || 0 });
      const assets = (d.assets || []).map((r: any) => ({ name: r.name, amount: Number(r.amount) || 0 }));
      await this.pdf.exportTallyStatement({
        title: 'Balance Sheet', period: `as at ${today}`,
        left: { heading: 'Liabilities', rows: liab, totalLabel: 'Total' },
        right: { heading: 'Assets', rows: assets, totalLabel: 'Total' },
      });
    } else if (rep === 'day-book') {
      await this.pdf.exportTable({
        title: 'Day Book', subtitle: `${d.date || today}`, tally: true,
        columns: [{ header: 'Date', key: '_date' }, { header: 'Particulars', key: 'partyName' }, { header: 'Vch Type', key: 'voucherType' }, { header: 'Vch No', key: 'number' }, { header: 'Amount', key: 'amount', align: 'right', fmt: M }],
        rows: (d.vouchers || []).map((v: any) => ({ ...v, _date: d.date || today, partyName: v.partyName || '—' })),
      });
    } else if (rep === 'stock-summary') {
      const rows = (d as any[]) || [];
      await this.pdf.exportTable({
        title: 'Stock Summary', subtitle: `as on ${today}`, tally: true,
        columns: [{ header: 'Particulars', key: 'name' }, { header: 'Unit', key: 'uom' }, { header: 'Quantity', key: 'stock', align: 'right' }, { header: 'Rate', key: 'rate', align: 'right', fmt: M }, { header: 'Value', key: 'stockValue', align: 'right', fmt: M }],
        rows: [...rows.map((r: any) => ({ ...r, rate: r.salePrice ?? r.basePrice })), { name: 'Grand Total', uom: '', stock: '', rate: '', stockValue: this.stockTotal() }],
      });
    } else if (rep === 'ledger') {
      const st = this.statement();
      if (!st) return;
      const name = this.ledgers().find((l) => l.id === this.ledgerId())?.name || 'Ledger';
      await this.pdf.exportTable({
        title: `Ledger: ${name}`, subtitle: `Opening ${M(st.opening)}  ·  Closing ${M(st.closing)}`, tally: true,
        columns: [{ header: 'Date', key: 'date' }, { header: 'Particulars', key: 'voucherType' }, { header: 'Vch No', key: 'number' }, { header: 'Debit', key: 'debit', align: 'right', fmt: M }, { header: 'Credit', key: 'credit', align: 'right', fmt: M }, { header: 'Balance', key: 'balance', align: 'right', fmt: M }],
        rows: [
          { date: '', voucherType: 'Opening Balance', number: '', debit: '', credit: '', balance: M(st.opening) },
          ...(st.lines || []),
          { date: '', voucherType: 'Closing Balance', number: '', debit: '', credit: '', balance: M(st.closing) },
        ],
      });
    } else if (rep === 'ageing') {
      await this.pdf.exportTable({
        title: 'Bills Outstanding — Receivables', subtitle: `as on ${today}`, orientation: 'landscape', tally: true,
        columns: [{ header: 'Particulars', key: 'party' }, { header: '0–30d', key: 'd030', align: 'right', fmt: M }, { header: '31–60d', key: 'd3160', align: 'right', fmt: M }, { header: '61–90d', key: 'd6190', align: 'right', fmt: M }, { header: '90d+', key: 'd90Plus', align: 'right', fmt: M }, { header: 'Total', key: 'total', align: 'right', fmt: M }, { header: 'Bills', key: 'bills', align: 'right' }, { header: 'Interest', key: '_int', align: 'right', fmt: M }],
        rows: (d.receivables || []).map((r: any) => ({ ...r, _int: this.interestOf(r) })),
        summary: [{ label: 'Total receivable', value: M(d.totals?.receivable) }, { label: 'Total payable', value: M(d.totals?.payable) }],
      });
    }
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
      case 'day-book': this.acc.dayBook(this.dayBookDate() || undefined).subscribe(done); break;
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
