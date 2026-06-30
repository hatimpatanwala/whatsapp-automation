import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ApiService } from '../../../core/services/api.service';
import { ErpCurrencyService } from '../../../core/services/erp-currency.service';

@Component({
  selector: 'wa-erp-reports', standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule],
  template: `
    <div class="p-4 max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-6">
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
        <h3 class="font-semibold text-gray-800 mb-4">Sales</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><p class="text-xs text-gray-400 uppercase">Invoiced</p><p class="text-xl font-bold tabular-nums">{{ cur.symbol() }}{{ fmt(sales()?.totals?.sales) }}</p><p class="text-xs text-gray-400">{{ sales()?.totals?.count || 0 }} invoices</p></div>
          <div><p class="text-xs text-gray-400 uppercase">Collected</p><p class="text-xl font-bold text-green-600 tabular-nums">{{ cur.symbol() }}{{ fmt(sales()?.totals?.collected) }}</p></div>
          <div><p class="text-xs text-gray-400 uppercase">Outstanding</p><p class="text-xl font-bold text-red-600 tabular-nums">{{ cur.symbol() }}{{ fmt(sales()?.totals?.outstanding) }}</p></div>
        </div>
        @if (sales()?.byStatus?.length) {
          <table class="w-full text-sm mt-4"><thead><tr class="text-gray-400 text-xs uppercase text-left"><th class="py-1">Status</th><th class="text-right">Count</th><th class="text-right">Amount</th></tr></thead>
          <tbody>@for (r of sales().byStatus; track r.paymentStatus) {<tr class="border-t border-gray-50"><td class="py-1">{{ r.paymentStatus | titlecase }}</td><td class="text-right">{{ r.count }}</td><td class="text-right tabular-nums">{{ cur.symbol() }}{{ fmt(r.amount) }}</td></tr>}</tbody></table>
        }
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <!-- Expenses -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 class="font-semibold text-gray-800 mb-4">Expenses by Category — {{ cur.symbol() }}{{ fmt(expenses()?.total?.amount) }}</h3>
          <table class="w-full text-sm"><thead><tr class="text-gray-400 text-xs uppercase text-left"><th class="py-1">Category</th><th class="text-right">Count</th><th class="text-right">Amount</th></tr></thead>
          <tbody>@for (r of expenses()?.byCategory || []; track r.category) {<tr class="border-t border-gray-50"><td class="py-1">{{ r.category }}</td><td class="text-right">{{ r.count }}</td><td class="text-right tabular-nums">{{ cur.symbol() }}{{ fmt(r.amount) }}</td></tr>} @empty {<tr><td colspan="3" class="text-center py-4 text-gray-400">No expenses</td></tr>}</tbody></table>
        </div>

        <!-- Receivables aging -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 class="font-semibold text-gray-800 mb-4">Receivables Aging</h3>
          <table class="w-full text-sm"><thead><tr class="text-gray-400 text-xs uppercase text-left"><th class="py-1">Age (days)</th><th class="text-right">Invoices</th><th class="text-right">Outstanding</th></tr></thead>
          <tbody>@for (r of aging() || []; track r.bucket) {<tr class="border-t border-gray-50"><td class="py-1">{{ r.bucket }}</td><td class="text-right">{{ r.count }}</td><td class="text-right tabular-nums" [class.text-red-600]="r.bucket === '90+'">{{ cur.symbol() }}{{ fmt(r.amount) }}</td></tr>} @empty {<tr><td colspan="3" class="text-center py-4 text-gray-400">Nothing outstanding 🎉</td></tr>}</tbody></table>
        </div>
      </div>

      <!-- Profit & Loss -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-5">
        <h3 class="font-semibold text-gray-800 mb-4">Profit & Loss</h3>
        <div class="grid grid-cols-3 gap-4">
          <div><p class="text-xs text-gray-400 uppercase">Income (Sales)</p><p class="text-xl font-bold text-green-600 tabular-nums">{{ cur.symbol() }}{{ fmt(pl()?.income) }}</p></div>
          <div><p class="text-xs text-gray-400 uppercase">Expenses</p><p class="text-xl font-bold text-amber-600 tabular-nums">{{ cur.symbol() }}{{ fmt(pl()?.expenses) }}</p></div>
          <div><p class="text-xs text-gray-400 uppercase">Net Profit</p><p class="text-xl font-bold tabular-nums" [class.text-green-600]="num(pl()?.netProfit) >= 0" [class.text-red-600]="num(pl()?.netProfit) < 0">{{ cur.symbol() }}{{ fmt(pl()?.netProfit) }}</p></div>
        </div>
      </div>

      <!-- Day Book -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-5">
        <h3 class="font-semibold text-gray-800 mb-4">Day Book</h3>
        <table class="w-full text-sm"><thead><tr class="text-gray-400 text-xs uppercase text-left"><th class="py-1">Date</th><th>Type</th><th>Ref</th><th>Party</th><th class="text-right">Amount</th></tr></thead>
        <tbody>@for (r of dayBook(); track $index) {<tr class="border-t border-gray-50"><td class="py-1 text-gray-500">{{ r.at | date:'short' }}</td><td>{{ r.type }}</td><td class="font-mono text-xs">{{ r.ref || '-' }}</td><td>{{ r.party || '-' }}</td><td class="text-right tabular-nums" [class.text-red-600]="num(r.amount) < 0">{{ cur.symbol() }}{{ fmt(r.amount) }}</td></tr>} @empty {<tr><td colspan="5" class="text-center py-4 text-gray-400">No transactions</td></tr>}</tbody></table>
      </div>

      <!-- Tax -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-5">
        <h3 class="font-semibold text-gray-800 mb-4">Tax Summary</h3>
        <div class="grid grid-cols-3 gap-4">
          <div><p class="text-xs text-gray-400 uppercase">Output Tax (on sales)</p><p class="text-xl font-bold tabular-nums">{{ cur.symbol() }}{{ fmt(tax()?.outputTax) }}</p></div>
          <div><p class="text-xs text-gray-400 uppercase">Input Tax (on expenses)</p><p class="text-xl font-bold tabular-nums">{{ cur.symbol() }}{{ fmt(tax()?.inputTax) }}</p></div>
          <div><p class="text-xs text-gray-400 uppercase">Net Tax Payable</p><p class="text-xl font-bold text-primary-600 tabular-nums">{{ cur.symbol() }}{{ fmt(tax()?.netTax) }}</p></div>
        </div>
      </div>

      <!-- GST (GSTR-1 style: by rate) -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-800">GST Summary (by rate)</h3>
          <div class="flex gap-2">
            <p-button label="GSTR-1 CSV" icon="pi pi-download" [outlined]="true" size="small" (onClick)="downloadGstr1('csv')" />
            <p-button label="GSTR-1 JSON" icon="pi pi-code" [outlined]="true" size="small" (onClick)="downloadGstr1('json')" />
          </div>
        </div>
        <table class="w-full text-sm"><thead><tr class="text-gray-400 text-xs uppercase text-left"><th class="py-1">Rate</th><th class="text-right">Invoices</th><th class="text-right">Taxable Value</th><th class="text-right">Tax</th></tr></thead>
        <tbody>
          @for (r of gst()?.byRate || []; track r.ratePct) {<tr class="border-t border-gray-50"><td class="py-1">{{ num(r.ratePct) }}%</td><td class="text-right">{{ r.invoices }}</td><td class="text-right tabular-nums">{{ cur.symbol() }}{{ fmt(r.taxableValue) }}</td><td class="text-right tabular-nums">{{ cur.symbol() }}{{ fmt(r.tax) }}</td></tr>} @empty {<tr><td colspan="4" class="text-center py-4 text-gray-400">No data</td></tr>}
          @if (gst()?.byRate?.length) {<tr class="border-t-2 border-gray-200 font-bold"><td class="py-1">Total</td><td></td><td class="text-right tabular-nums">{{ cur.symbol() }}{{ fmt(gst()?.totals?.taxable) }}</td><td class="text-right tabular-nums">{{ cur.symbol() }}{{ fmt(gst()?.totals?.tax) }}</td></tr>}
        </tbody></table>
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
  downloadGstr1(fmt: 'csv' | 'json') {
    const path = fmt === 'json' ? 'gst/export-json' : 'gst/export';
    window.open(this.api.url(`/erp/reports/${path}?from=${this.from}&to=${this.to}`), '_blank');
  }
}
