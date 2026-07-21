import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { ApiService } from '../../../core/services/api.service';
import { ErpCurrencyService } from '../../../core/services/erp-currency.service';

/**
 * Reports & Analytics — chart-first: every report leads with a visual; the
 * backing table sits behind a "details" toggle for the few who need the rows
 * (GST filing, reconciliation). Minimum reading, maximum signal.
 */
@Component({
  selector: 'wa-erp-reports', standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, ChartModule],
  template: `
    <div class="p-4 max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Reports & Analytics</h2>
          <p class="text-sm text-gray-500 mt-1">Sales, expenses, tax and receivables — base currency</p>
        </div>
        <div class="flex items-end gap-2">
          <div><label class="block text-[11px] font-semibold text-gray-400">From</label><input type="date" [(ngModel)]="from" class="border border-gray-300 rounded-md px-2 py-1.5 text-sm" /></div>
          <div><label class="block text-[11px] font-semibold text-gray-400">To</label><input type="date" [(ngModel)]="to" class="border border-gray-300 rounded-md px-2 py-1.5 text-sm" /></div>
          <p-button label="Run" icon="pi pi-refresh" (onClick)="load()" />
        </div>
      </div>

      <!-- Sales -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <h3 class="text-sm font-bold text-gray-700 mb-3">Sales</h3>
        <div class="grid grid-cols-3 gap-4 mb-4">
          <div><p class="text-[10px] font-semibold text-gray-400 uppercase">Invoiced</p><p class="text-xl font-bold tabular-nums">{{ cur.symbol() }}{{ fmt(sales()?.totals?.sales) }}</p><p class="text-[11px] text-gray-400">{{ sales()?.totals?.count || 0 }} invoices</p></div>
          <div><p class="text-[10px] font-semibold text-gray-400 uppercase">Collected</p><p class="text-xl font-bold text-green-600 tabular-nums">{{ cur.symbol() }}{{ fmt(sales()?.totals?.collected) }}</p></div>
          <div><p class="text-[10px] font-semibold text-gray-400 uppercase">Outstanding</p><p class="text-xl font-bold text-red-600 tabular-nums">{{ cur.symbol() }}{{ fmt(sales()?.totals?.outstanding) }}</p></div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div class="lg:col-span-2">
            @if (salesDayChart()) { <p-chart type="line" [data]="salesDayChart()" [options]="lineOptions" height="220px" /> }
            @else { <p class="text-gray-400 text-sm py-16 text-center">No sales in this period</p> }
          </div>
          <div>
            @if (statusChart()) { <p-chart type="doughnut" [data]="statusChart()" [options]="doughnutOptions" height="220px" /> }
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <!-- Expenses -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-gray-700">Expenses — {{ cur.symbol() }}{{ fmt(expenses()?.total?.amount) }}</h3>
            @if (expenses()?.byCategory?.length) { <button (click)="showExpTable.set(!showExpTable())" class="text-[12px] font-semibold text-indigo-600">{{ showExpTable() ? 'Hide details' : 'Details' }}</button> }
          </div>
          @if (expensesChart()) { <p-chart type="doughnut" [data]="expensesChart()" [options]="doughnutOptions" height="220px" /> }
          @else { <p class="text-gray-400 text-sm py-16 text-center">No expenses</p> }
          @if (showExpTable()) {
            <table class="w-full text-sm mt-4"><thead><tr class="text-gray-400 text-xs uppercase text-left"><th class="py-1">Category</th><th class="text-right">Count</th><th class="text-right">Amount</th></tr></thead>
            <tbody>@for (r of expenses()?.byCategory || []; track r.category) {<tr class="border-t border-gray-50"><td class="py-1">{{ r.category }}</td><td class="text-right">{{ r.count }}</td><td class="text-right tabular-nums">{{ cur.symbol() }}{{ fmt(r.amount) }}</td></tr>}</tbody></table>
          }
        </div>

        <!-- Receivables aging -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-gray-700">Receivables aging</h3>
            @if (aging().length) { <button (click)="showAgingTable.set(!showAgingTable())" class="text-[12px] font-semibold text-indigo-600">{{ showAgingTable() ? 'Hide details' : 'Details' }}</button> }
          </div>
          @if (agingChart()) { <p-chart type="bar" [data]="agingChart()" [options]="moneyBarOptions" height="220px" /> }
          @else { <p class="text-gray-400 text-sm py-16 text-center">Nothing outstanding 🎉</p> }
          @if (showAgingTable()) {
            <table class="w-full text-sm mt-4"><thead><tr class="text-gray-400 text-xs uppercase text-left"><th class="py-1">Age (days)</th><th class="text-right">Invoices</th><th class="text-right">Outstanding</th></tr></thead>
            <tbody>@for (r of aging(); track r.bucket) {<tr class="border-t border-gray-50"><td class="py-1">{{ r.bucket }}</td><td class="text-right">{{ r.count }}</td><td class="text-right tabular-nums" [class.text-red-600]="r.bucket === '90+'">{{ cur.symbol() }}{{ fmt(r.amount) }}</td></tr>}</tbody></table>
          }
        </div>
      </div>

      <!-- Profit & Loss + Tax -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 class="text-sm font-bold text-gray-700 mb-3">Profit &amp; Loss</h3>
          @if (plChart()) { <p-chart type="bar" [data]="plChart()" [options]="moneyBarOptions" height="200px" /> }
          <p class="text-center mt-2 text-sm">Net profit:
            <b class="tabular-nums" [class.text-green-600]="num(pl()?.netProfit) >= 0" [class.text-red-600]="num(pl()?.netProfit) < 0">{{ cur.symbol() }}{{ fmt(pl()?.netProfit) }}</b>
          </p>
        </div>
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 class="text-sm font-bold text-gray-700 mb-3">Tax</h3>
          @if (taxChart()) { <p-chart type="bar" [data]="taxChart()" [options]="moneyBarOptions" height="200px" /> }
          <p class="text-center mt-2 text-sm">Net tax payable: <b class="text-primary-600 tabular-nums">{{ cur.symbol() }}{{ fmt(tax()?.netTax) }}</b></p>
        </div>
      </div>

      <!-- GST (GSTR-1 style: by rate) -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-5">
        <div class="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 class="text-sm font-bold text-gray-700">GST by rate — taxable {{ cur.symbol() }}{{ fmt(gst()?.totals?.taxable) }} · tax {{ cur.symbol() }}{{ fmt(gst()?.totals?.tax) }}</h3>
          <div class="flex gap-2 items-center">
            @if (gst()?.byRate?.length) { <button (click)="showGstTable.set(!showGstTable())" class="text-[12px] font-semibold text-indigo-600 mr-1">{{ showGstTable() ? 'Hide details' : 'Details' }}</button> }
            <p-button label="GSTR-1 CSV" icon="pi pi-download" [outlined]="true" size="small" (onClick)="downloadGstr1('csv')" />
            <p-button label="GSTR-1 JSON" icon="pi pi-code" [outlined]="true" size="small" (onClick)="downloadGstr1('json')" />
          </div>
        </div>
        @if (gstChart()) { <p-chart type="bar" [data]="gstChart()" [options]="moneyBarOptions" height="200px" /> }
        @else { <p class="text-gray-400 text-sm py-10 text-center">No data</p> }
        @if (showGstTable()) {
          <table class="w-full text-sm mt-4"><thead><tr class="text-gray-400 text-xs uppercase text-left"><th class="py-1">Rate</th><th class="text-right">Invoices</th><th class="text-right">Taxable Value</th><th class="text-right">Tax</th></tr></thead>
          <tbody>
            @for (r of gst()?.byRate || []; track r.ratePct) {<tr class="border-t border-gray-50"><td class="py-1">{{ num(r.ratePct) }}%</td><td class="text-right">{{ r.invoices }}</td><td class="text-right tabular-nums">{{ cur.symbol() }}{{ fmt(r.taxableValue) }}</td><td class="text-right tabular-nums">{{ cur.symbol() }}{{ fmt(r.tax) }}</td></tr>}
            @if (gst()?.byRate?.length) {<tr class="border-t-2 border-gray-200 font-bold"><td class="py-1">Total</td><td></td><td class="text-right tabular-nums">{{ cur.symbol() }}{{ fmt(gst()?.totals?.taxable) }}</td><td class="text-right tabular-nums">{{ cur.symbol() }}{{ fmt(gst()?.totals?.tax) }}</td></tr>}
          </tbody></table>
        }
      </div>

      <!-- Day Book (a ledger is inherently a table — collapsed by default) -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-5">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-gray-700">Day Book <span class="text-gray-400 font-normal">· {{ dayBook().length }} transactions</span></h3>
          <button (click)="showDayBook.set(!showDayBook())" class="text-[12px] font-semibold text-indigo-600">{{ showDayBook() ? 'Hide' : 'Show transactions' }}</button>
        </div>
        @if (showDayBook()) {
          <table class="w-full text-sm mt-4"><thead><tr class="text-gray-400 text-xs uppercase text-left"><th class="py-1">Date</th><th>Type</th><th>Ref</th><th>Party</th><th class="text-right">Amount</th></tr></thead>
          <tbody>@for (r of dayBook(); track $index) {<tr class="border-t border-gray-50"><td class="py-1 text-gray-500">{{ r.at | date:'short' }}</td><td>{{ r.type }}</td><td class="font-mono text-xs">{{ r.ref || '-' }}</td><td>{{ r.party || '-' }}</td><td class="text-right tabular-nums" [class.text-red-600]="num(r.amount) < 0">{{ cur.symbol() }}{{ fmt(r.amount) }}</td></tr>} @empty {<tr><td colspan="5" class="text-center py-4 text-gray-400">No transactions</td></tr>}</tbody></table>
        }
      </div>
    </div>
  `,
})
export class ErpReportsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly cur = inject(ErpCurrencyService);
  from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  to = new Date().toISOString().slice(0, 10);
  sales = signal<any>(null);
  expenses = signal<any>(null);
  aging = signal<any[]>([]);
  tax = signal<any>(null);
  pl = signal<any>(null);
  dayBook = signal<any[]>([]);
  gst = signal<any>(null);
  showExpTable = signal(false);
  showAgingTable = signal(false);
  showGstTable = signal(false);
  showDayBook = signal(false);

  // ── Charts ───────────────────────────────────────────────────────────────────
  salesDayChart = computed(() => {
    const rows: any[] = this.sales()?.byDay || [];
    if (!rows.length) return null;
    return {
      labels: rows.map((r) => new Date(r.day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })),
      datasets: [{
        label: 'Sales', data: rows.map((r) => Number(r.amount) || 0),
        borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.12)', fill: true, tension: 0.35, pointRadius: rows.length > 20 ? 0 : 3, borderWidth: 2,
      }],
    };
  });

  statusChart = computed(() => {
    const rows: any[] = this.sales()?.byStatus || [];
    if (!rows.length) return null;
    const color: Record<string, string> = { paid: '#10b981', partial: '#f59e0b', unpaid: '#ef4444', pending: '#ef4444' };
    return {
      labels: rows.map((r) => (r.paymentStatus || 'unknown').charAt(0).toUpperCase() + (r.paymentStatus || 'unknown').slice(1)),
      datasets: [{ data: rows.map((r) => Number(r.amount) || 0), backgroundColor: rows.map((r) => color[r.paymentStatus] || '#94a3b8'), borderWidth: 0, hoverOffset: 6 }],
    };
  });

  expensesChart = computed(() => {
    const rows: any[] = this.expenses()?.byCategory || [];
    if (!rows.length) return null;
    const top = rows.slice(0, 7);
    const rest = rows.slice(7).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return {
      labels: [...top.map((r) => r.category), ...(rest > 0 ? ['Other'] : [])],
      datasets: [{
        data: [...top.map((r) => Number(r.amount) || 0), ...(rest > 0 ? [rest] : [])],
        backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#64748b', '#cbd5e1'], borderWidth: 0, hoverOffset: 6,
      }],
    };
  });

  agingChart = computed(() => {
    const rows = this.aging();
    if (!rows.length) return null;
    const order = ['0-30', '31-60', '61-90', '90+'];
    const sorted = [...rows].sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket));
    return {
      labels: sorted.map((r) => `${r.bucket} days`),
      datasets: [{ label: 'Outstanding', data: sorted.map((r) => Number(r.amount) || 0), backgroundColor: ['#34d399', '#fbbf24', '#fb923c', '#ef4444'], borderRadius: 8, maxBarThickness: 60 }],
    };
  });

  plChart = computed(() => {
    const p = this.pl();
    if (!p) return null;
    const net = this.num(p.netProfit);
    return {
      labels: ['Income', 'Expenses', 'Net profit'],
      datasets: [{ data: [this.num(p.income), this.num(p.expenses), net], backgroundColor: ['#10b981', '#f59e0b', net >= 0 ? '#6366f1' : '#ef4444'], borderRadius: 8, maxBarThickness: 70 }],
    };
  });

  taxChart = computed(() => {
    const t = this.tax();
    if (!t) return null;
    return {
      labels: ['Output tax (sales)', 'Input tax (expenses)', 'Net payable'],
      datasets: [{ data: [this.num(t.outputTax), this.num(t.inputTax), this.num(t.netTax)], backgroundColor: ['#6366f1', '#10b981', '#8b5cf6'], borderRadius: 8, maxBarThickness: 70 }],
    };
  });

  gstChart = computed(() => {
    const rows: any[] = this.gst()?.byRate || [];
    if (!rows.length) return null;
    return {
      labels: rows.map((r) => `${this.num(r.ratePct)}%`),
      datasets: [
        { label: 'Taxable value', data: rows.map((r) => Number(r.taxableValue) || 0), backgroundColor: 'rgba(99,102,241,0.75)', borderRadius: 6, maxBarThickness: 44 },
        { label: 'Tax', data: rows.map((r) => Number(r.tax) || 0), backgroundColor: 'rgba(16,185,129,0.75)', borderRadius: 6, maxBarThickness: 44 },
      ],
    };
  });

  readonly lineOptions = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#0f172a', padding: 10, cornerRadius: 8, callbacks: { label: (c: any) => ' ' + this.cur.symbol() + (Number(c.parsed?.y) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }) } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8', maxTicksLimit: 10 } },
      y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#94a3b8', maxTicksLimit: 5, callback: (v: any) => this.compactInr(v) } },
    },
  };
  readonly moneyBarOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#0f172a', padding: 10, cornerRadius: 8, callbacks: { label: (c: any) => ` ${c.dataset?.label || c.label}: ${this.cur.symbol()}` + (Number(c.parsed?.y) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }) } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#64748b' } },
      y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#94a3b8', maxTicksLimit: 5, callback: (v: any) => this.compactInr(v) } },
    },
  };
  readonly doughnutOptions = {
    responsive: true, maintainAspectRatio: false, cutout: '62%',
    plugins: {
      legend: { position: 'right' as const, labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 10, font: { size: 11 }, color: '#64748b' } },
      tooltip: { backgroundColor: '#0f172a', padding: 10, cornerRadius: 8, callbacks: { label: (c: any) => ` ${c.label}: ${this.cur.symbol()}` + (Number(c.parsed) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }) } },
    },
  };

  ngOnInit() { this.load(); this.cur.load(); }
  load() {
    const p = { from: this.from, to: this.to };
    this.api.get<any>('/erp/reports/sales', p).subscribe({ next: (r) => this.sales.set(r) });
    this.api.get<any>('/erp/reports/expenses', p).subscribe({ next: (r) => this.expenses.set(r) });
    this.api.get<any>('/erp/reports/receivables-aging').subscribe({ next: (r) => this.aging.set(r || []) });
    this.api.get<any>('/erp/reports/tax', p).subscribe({ next: (r) => this.tax.set(r) });
    this.api.get<any>('/erp/reports/profit-loss', p).subscribe({ next: (r) => this.pl.set(r) });
    this.api.get<any>('/erp/reports/day-book', p).subscribe({ next: (r) => this.dayBook.set(r || []) });
    this.api.get<any>('/erp/reports/gst', p).subscribe({ next: (r) => this.gst.set(r) });
  }
  num(v: any): number { return parseFloat(v ?? 0) || 0; }
  fmt(v: any): string { return (parseFloat(v ?? 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
  compactInr(v: unknown): string {
    const s = this.cur.symbol();
    const n = Number(v) || 0; const a = Math.abs(n);
    if (a >= 1e7) return s + (n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + 'Cr';
    if (a >= 1e5) return s + (n / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + 'L';
    if (a >= 1e3) return s + (n / 1e3).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + 'k';
    return s + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  downloadGstr1(fmt: 'csv' | 'json') {
    const path = fmt === 'json' ? 'gst/export-json' : 'gst/export';
    // Blob-download (not window.open) so it works inside the WhatsApp webview.
    this.api.downloadFile(`/erp/reports/${path}?from=${this.from}&to=${this.to}`, `gstr1-${this.from}-${this.to}.${fmt === 'json' ? 'json' : 'csv'}`);
  }
}
