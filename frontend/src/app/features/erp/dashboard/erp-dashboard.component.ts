import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ErpService } from '../../../core/services/erp.service';

@Component({
  selector: 'wa-erp-dashboard', standalone: true,
  imports: [CommonModule, RouterLink, TagModule, ButtonModule],
  template: `
    <div class="p-4 max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">ERP Dashboard</h2>
          <p class="text-sm text-gray-500 mt-1">Your business at a glance — all amounts in {{ baseSymbol() }} (base currency)</p>
        </div>
        <p-button label="New Invoice" icon="pi pi-plus" routerLink="/erp/invoices" />
      </div>

      @if (loading()) {
        <div class="text-center py-20 text-gray-400"><i class="pi pi-spin pi-spinner text-3xl"></i></div>
      } @else {
        <!-- KPI cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          @for (k of kpiCards(); track k.label) {
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div class="flex items-center gap-3 mb-2">
                <div [class]="'flex items-center justify-center w-10 h-10 rounded-xl ' + k.bg"><i [class]="'pi ' + k.icon"></i></div>
                <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{{ k.label }}</p>
              </div>
              <p class="text-2xl font-bold text-gray-900 tabular-nums">{{ k.value }}</p>
              @if (k.sub) { <p class="text-xs text-gray-400 mt-1">{{ k.sub }}</p> }
            </div>
          }
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Monthly sales trend -->
          <div class="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 class="font-semibold text-gray-800 mb-4">Sales — last 6 months</h3>
            <div class="flex items-end gap-3 h-48">
              @for (m of monthly(); track m.month) {
                <div class="flex-1 flex flex-col items-center justify-end h-full">
                  <span class="text-[10px] text-gray-500 mb-1 tabular-nums">{{ baseSymbol() }}{{ short(m.amt) }}</span>
                  <div class="w-full rounded-t-lg bg-gradient-to-t from-primary-500 to-primary-300 transition-all" [style.height.%]="barPct(m.amt)" style="min-height:4px"></div>
                  <span class="text-xs text-gray-500 mt-2">{{ m.month }}</span>
                </div>
              }
              @if (!monthly().length) { <p class="text-gray-400 text-sm m-auto">No sales data yet</p> }
            </div>
          </div>

          <!-- Top clients -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 class="font-semibold text-gray-800 mb-4">Top Clients</h3>
            @for (c of data()?.topClients || []; track c.name) {
              <div class="flex items-center justify-between py-2 border-t border-gray-50 first:border-0">
                <div><p class="text-sm font-medium text-gray-800">{{ c.company || c.name }}</p></div>
                <span class="text-sm font-semibold tabular-nums">{{ baseSymbol() }}{{ fmt(c.totalSpent) }}</span>
              </div>
            } @empty { <p class="text-gray-400 text-sm">No clients yet</p> }
          </div>
        </div>

        <!-- Recent invoices -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-gray-800">Recent Invoices</h3>
            <a routerLink="/erp/invoices" class="text-sm text-primary-600 font-medium">View all →</a>
          </div>
          <table class="w-full text-sm">
            <thead><tr class="text-gray-400 text-xs uppercase text-left"><th class="py-2">Invoice</th><th>Customer</th><th class="text-right">Total</th><th>Status</th><th class="text-right">Date</th></tr></thead>
            <tbody>
              @for (inv of data()?.recentInvoices || []; track inv.invoiceNumber) {
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
  loading = signal(true);
  data = signal<any>(null);

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

  ngOnInit() {
    this.erp.dashboard().subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  barPct(amt: number): number {
    const max = Math.max(...this.monthly().map((m: any) => Number(m.amt) || 0), 1);
    return Math.round((Number(amt) / max) * 100);
  }
  fmt(v: any): string { return (parseFloat(v ?? 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
  short(v: any): string { const n = Number(v) || 0; return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
  sev(s: string): 'success' | 'warn' | 'danger' { return s === 'paid' ? 'success' : s === 'partial' ? 'warn' : 'danger'; }
}
