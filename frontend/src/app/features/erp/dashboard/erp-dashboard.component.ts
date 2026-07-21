import { Component, OnInit, effect, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { ApiService } from '../../../core/services/api.service';
import { ErpService } from '../../../core/services/erp.service';
import { FeatureService } from '../../../core/services/feature.service';
import { AiInsightsCardComponent } from '../../insights/ai-insights-card.component';

/**
 * Business Overview — the admin's single chart-first cockpit. Every section is
 * a chart or a KPI tile (minimum reading); sections render only when the plan
 * feature behind them is enabled (premiumInsights strip) or the data exists
 * (orders, expenses, aging), so the page adapts itself to the tenant.
 */
@Component({
  selector: 'wa-erp-dashboard', standalone: true,
  imports: [CommonModule, RouterLink, TagModule, ButtonModule, ChartModule, AiInsightsCardComponent],
  template: `
    <div class="p-4 max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Business Overview</h2>
          <p class="text-sm text-gray-500 mt-1">Everything at a glance — amounts in {{ baseSymbol() }}</p>
        </div>
        <div class="flex items-center gap-2">
          <a routerLink="/erp/reports" class="rounded-xl border border-gray-200 text-gray-600 text-[12.5px] font-semibold px-3 py-2 hover:border-indigo-300 hover:text-indigo-700 transition-colors"><i class="pi pi-chart-line mr-1.5" style="font-size:.75rem"></i>Reports</a>
          <a routerLink="/erp/intel" class="rounded-xl border border-gray-200 text-gray-600 text-[12.5px] font-semibold px-3 py-2 hover:border-indigo-300 hover:text-indigo-700 transition-colors"><i class="pi pi-sparkles mr-1.5" style="font-size:.75rem"></i>AI Insights Pro</a>
          <p-button label="New Invoice" icon="pi pi-plus" routerLink="/erp/invoices" />
        </div>
      </div>

      @if (loading()) {
        <div class="text-center py-20 text-gray-400"><i class="pi pi-spin pi-spinner text-3xl"></i></div>
      } @else {
        <!-- KPI tiles -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          @for (k of kpiCards(); track k.label) {
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div class="flex items-center gap-2.5 mb-1.5">
                <div [class]="'flex items-center justify-center w-9 h-9 rounded-xl ' + k.bg"><i [class]="'pi ' + k.icon" style="font-size:.85rem"></i></div>
                <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-tight">{{ k.label }}</p>
              </div>
              <p class="text-xl font-bold text-gray-900 tabular-nums">{{ k.value }}</p>
              @if (k.sub) { <p class="text-[11px] text-gray-400 mt-0.5">{{ k.sub }}</p> }
            </div>
          }
        </div>

        <!-- AI health strip (premium — only when the plan has it) -->
        @if (intel(); as iv) {
          <a routerLink="/erp/intel" class="flex flex-wrap items-center gap-x-6 gap-y-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl px-5 py-3.5 mb-5 shadow-sm hover:opacity-95 transition-opacity">
            <span class="flex items-center gap-2 font-bold text-sm"><i class="pi pi-sparkles"></i> AI Insights Pro</span>
            <span class="text-[13px]"><b class="tabular-nums">{{ iv.stockoutRiskCount ?? 0 }}</b> stockout risks</span>
            <span class="text-[13px]"><b class="tabular-nums">{{ iv.deadStockCount ?? 0 }}</b> dead stock</span>
            <span class="text-[13px]"><b class="tabular-nums">{{ iv.underpricedCount ?? 0 }}</b> underpriced</span>
            <span class="text-[13px]"><b class="tabular-nums">{{ iv.overpricedCount ?? 0 }}</b> overpriced</span>
            <span class="ml-auto text-[12px] opacity-80">Open <i class="pi pi-arrow-right" style="font-size:.6rem"></i></span>
          </a>
        }

        <!-- Sales trend + receivables aging -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          <div class="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 class="text-sm font-bold text-gray-700 mb-3">Sales — last 6 months</h3>
            @if (salesChart()) {
              <p-chart type="bar" [data]="salesChart()" [options]="moneyBarOptions" height="230px" />
            } @else { <p class="text-gray-400 text-sm py-16 text-center">No sales data yet</p> }
          </div>
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 class="text-sm font-bold text-gray-700 mb-3">Who owes you — by age</h3>
            @if (agingChart()) {
              <p-chart type="doughnut" [data]="agingChart()" [options]="doughnutOptions" height="230px" />
            } @else { <p class="text-gray-400 text-sm py-16 text-center">Nothing outstanding 🎉</p> }
          </div>
        </div>

        <!-- Expenses + top clients -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          @if (expensesChart()) {
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 class="text-sm font-bold text-gray-700 mb-3">Expenses — last 30 days</h3>
              <p-chart type="doughnut" [data]="expensesChart()" [options]="doughnutOptions" height="230px" />
            </div>
          }
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5" [class.lg:col-span-2]="expensesChart()" [class.lg:col-span-3]="!expensesChart()">
            <h3 class="text-sm font-bold text-gray-700 mb-3">Top clients</h3>
            @if (clientsChart()) {
              <p-chart type="bar" [data]="clientsChart()" [options]="clientsBarOptions" height="230px" />
            } @else { <p class="text-gray-400 text-sm py-16 text-center">No clients yet</p> }
          </div>
        </div>

        <!-- Online orders (only when the shop actually has orders) -->
        @if (orders(); as o) {
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-bold text-gray-700">Online shop orders</h3>
              <a routerLink="/orders" class="text-[12.5px] text-primary-600 font-semibold">View orders →</a>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p class="text-[10px] font-semibold text-gray-400 uppercase">Revenue</p><p class="text-xl font-bold tabular-nums">{{ baseSymbol() }}{{ fmt(o.totalRevenue) }}</p></div>
              <div><p class="text-[10px] font-semibold text-gray-400 uppercase">Today</p><p class="text-xl font-bold text-green-600 tabular-nums">{{ baseSymbol() }}{{ fmt(o.revenueToday) }}</p></div>
              <div><p class="text-[10px] font-semibold text-gray-400 uppercase">Orders</p><p class="text-xl font-bold tabular-nums">{{ fmt(o.totalOrders) }}</p></div>
              <div><p class="text-[10px] font-semibold text-gray-400 uppercase">Pending</p><p class="text-xl font-bold text-amber-600 tabular-nums">{{ fmt(o.pendingOrders) }}</p></div>
            </div>
          </div>
        }

        <div class="mb-5"><wa-ai-insights-card /></div>

        <!-- Recent invoices (the one table — compact) -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-gray-700">Recent invoices</h3>
            <a routerLink="/erp/invoices" class="text-[12.5px] text-primary-600 font-semibold">View all →</a>
          </div>
          <table class="w-full text-sm">
            <thead><tr class="text-gray-400 text-xs uppercase text-left"><th class="py-2">Invoice</th><th>Customer</th><th class="text-right">Total</th><th>Status</th><th class="text-right">Date</th></tr></thead>
            <tbody>
              @for (inv of (data()?.recentInvoices || []).slice(0, 6); track inv.invoiceNumber) {
                <tr class="border-t border-gray-50">
                  <td class="py-2 font-mono font-semibold text-primary-600">{{ inv.invoiceNumber }}</td>
                  <td>{{ inv.customerName || '-' }}</td>
                  <td class="text-right tabular-nums">{{ baseSymbol() }}{{ fmt(inv.total) }}</td>
                  <td><p-tag [value]="inv.paymentStatus | titlecase" [severity]="sev(inv.paymentStatus)" /></td>
                  <td class="text-right text-gray-500">{{ inv.issuedAt | date:'mediumDate' }}</td>
                </tr>
              } @empty { <tr><td colspan="5" class="text-center py-6 text-gray-400">No invoices yet</td></tr> }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class ErpDashboardComponent implements OnInit {
  private readonly erp = inject(ErpService);
  private readonly api = inject(ApiService);
  private readonly features = inject(FeatureService);
  loading = signal(true);
  data = signal<any>(null);
  aging = signal<any[]>([]);
  expenses = signal<any>(null);
  intel = signal<any>(null);
  orders = signal<any>(null);

  baseSymbol = computed(() => this.data()?.baseCurrency?.symbol || '₹');
  monthly = computed(() => this.data()?.monthlySales || []);

  kpiCards = computed(() => {
    const k = this.data()?.kpis; const s = this.baseSymbol();
    if (!k) return [];
    return [
      { label: 'Receivables', value: `${s}${this.fmt(k.receivables.amount)}`, sub: `${k.receivables.count} unpaid`, icon: 'pi-wallet', bg: 'bg-red-50 text-red-600' },
      { label: 'Sales — Today', value: `${s}${this.fmt(k.salesToday.amount)}`, sub: `${k.salesToday.count} invoices`, icon: 'pi-chart-line', bg: 'bg-green-50 text-green-600' },
      { label: 'Sales — Month', value: `${s}${this.fmt(k.salesThisMonth)}`, icon: 'pi-calendar', bg: 'bg-blue-50 text-blue-600' },
      { label: 'Expenses — Month', value: `${s}${this.fmt(k.expensesThisMonth)}`, icon: 'pi-arrow-down', bg: 'bg-amber-50 text-amber-600' },
      { label: 'Open Leads', value: k.openLeads, icon: 'pi-filter', bg: 'bg-purple-50 text-purple-600' },
      { label: 'Clients', value: k.clients, icon: 'pi-id-card', bg: 'bg-indigo-50 text-indigo-600' },
      { label: 'Suppliers', value: k.suppliers, icon: 'pi-truck', bg: 'bg-teal-50 text-teal-600' },
      { label: 'Low Stock', value: k.lowStock, icon: 'pi-exclamation-triangle', bg: 'bg-orange-50 text-orange-600' },
    ];
  });

  // ── Charts ───────────────────────────────────────────────────────────────────
  salesChart = computed(() => {
    const rows = this.monthly();
    if (!rows.length) return null;
    return {
      labels: rows.map((m: any) => m.month),
      datasets: [{ label: 'Sales', data: rows.map((m: any) => Number(m.amt) || 0), backgroundColor: 'rgba(99,102,241,0.75)', hoverBackgroundColor: 'rgba(79,70,229,0.95)', borderRadius: 8, maxBarThickness: 44 }],
    };
  });

  agingChart = computed(() => {
    const rows = this.aging();
    if (!rows.length) return null;
    const order = ['0-30', '31-60', '61-90', '90+'];
    const sorted = [...rows].sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket));
    return {
      labels: sorted.map((r) => `${r.bucket} days`),
      datasets: [{ data: sorted.map((r) => Number(r.amount) || 0), backgroundColor: ['#34d399', '#fbbf24', '#fb923c', '#ef4444'], borderWidth: 0, hoverOffset: 6 }],
    };
  });

  expensesChart = computed(() => {
    const rows: any[] = this.expenses()?.byCategory || [];
    if (!rows.length) return null;
    const top = rows.slice(0, 7);
    const rest = rows.slice(7).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const labels = [...top.map((r) => r.category), ...(rest > 0 ? ['Other'] : [])];
    const data = [...top.map((r) => Number(r.amount) || 0), ...(rest > 0 ? [rest] : [])];
    return {
      labels,
      datasets: [{ data, backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#64748b', '#cbd5e1'], borderWidth: 0, hoverOffset: 6 }],
    };
  });

  clientsChart = computed(() => {
    const rows: any[] = (this.data()?.topClients || []).slice(0, 6);
    if (!rows.length) return null;
    return {
      labels: rows.map((c) => this.shortName(c.company || c.name)),
      datasets: [{ label: 'Revenue', data: rows.map((c) => Number(c.totalSpent) || 0), backgroundColor: ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#ddd6fe', '#ede9fe'], borderRadius: 6, maxBarThickness: 22 }],
    };
  });

  readonly moneyBarOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#0f172a', padding: 10, cornerRadius: 8, callbacks: { label: (c: any) => ' ' + this.baseSymbol() + (Number(c.parsed?.y) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }) } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' } },
      y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#94a3b8', maxTicksLimit: 5, callback: (v: any) => this.compactInr(v) } },
    },
  };
  readonly clientsBarOptions = {
    indexAxis: 'y' as const, responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#0f172a', padding: 10, cornerRadius: 8, callbacks: { label: (c: any) => ' ' + this.baseSymbol() + (Number(c.parsed?.x) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }) } },
    },
    scales: {
      x: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#94a3b8', maxTicksLimit: 5, callback: (v: any) => this.compactInr(v) } },
      y: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#64748b' } },
    },
  };
  readonly doughnutOptions = {
    responsive: true, maintainAspectRatio: false, cutout: '62%',
    plugins: {
      legend: { position: 'right' as const, labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 10, font: { size: 11 }, color: '#64748b' } },
      tooltip: { backgroundColor: '#0f172a', padding: 10, cornerRadius: 8, callbacks: { label: (c: any) => ` ${c.label}: ${this.baseSymbol()}` + (Number(c.parsed) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }) } },
    },
  };

  private intelRequested = false;

  constructor() {
    // Premium strip only when the plan actually has it (no 403 noise otherwise).
    // Reactive, not a one-shot ngOnInit check: right after login the session may
    // not have rehydrated yet, so hasFeature() can flip to true a moment later.
    effect(() => {
      if (!this.intelRequested && this.features.hasFeature('premiumInsights')) {
        this.intelRequested = true;
        this.api.get<any>('/erp/intel/overview').subscribe({ next: (r) => this.intel.set(r), error: () => {} });
      }
    });
  }

  ngOnInit() {
    this.erp.dashboard().subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.api.get<any[]>('/erp/reports/receivables-aging').subscribe({ next: (r) => this.aging.set(r || []), error: () => {} });
    this.api.get<any>('/erp/reports/expenses').subscribe({ next: (r) => this.expenses.set(r), error: () => {} });
    // Online-shop orders: data-adaptive — the section appears only when orders exist.
    this.api.get<any>('/orders/stats').subscribe({
      next: (s) => { if ((Number(s?.totalOrders) || 0) > 0) this.orders.set(s); },
      error: () => {},
    });
  }

  fmt(v: any): string { return (parseFloat(v ?? 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
  sev(s: string): 'success' | 'warn' | 'danger' { return s === 'paid' ? 'success' : s === 'partial' ? 'warn' : 'danger'; }
  compactInr(v: unknown): string {
    const s = this.baseSymbol();
    const n = Number(v) || 0; const a = Math.abs(n);
    if (a >= 1e7) return s + (n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + 'Cr';
    if (a >= 1e5) return s + (n / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + 'L';
    if (a >= 1e3) return s + (n / 1e3).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + 'k';
    return s + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  private shortName(name: unknown): string {
    const s = String(name ?? '');
    return s.length > 18 ? s.slice(0, 16) + '…' : s;
  }
}
