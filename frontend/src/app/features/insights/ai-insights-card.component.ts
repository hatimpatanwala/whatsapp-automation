import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';
import { ApiService } from '../../core/services/api.service';

const unwrap = <T>(r: any): T => (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;

/**
 * AI Insights card — a plain-language, data-driven read of the business, powered by
 * GET /erp/insights. Drops onto the Dashboard and the Business Overview. Hides itself
 * silently when the tenant can't access it (non-ERP) or there's nothing to show.
 */
@Component({
  selector: 'wa-ai-insights-card',
  standalone: true,
  imports: [CommonModule, ChartModule],
  template: `
    @if (!hidden()) {
      <div class="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-purple-50 overflow-hidden shadow-sm">
        <!-- header -->
        <div class="flex items-center gap-3 px-5 py-4 border-b border-indigo-100/70">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-sm">
            <i class="pi pi-sparkles" style="font-size:1.05rem"></i>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-gray-900 leading-tight">AI Insights</h3>
              @if (data()?.aiPowered) {
                <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">LLM</span>
              }
            </div>
            <p class="text-[11px] text-gray-400 leading-tight">
              {{ data()?.asOf ? 'As of ' + fmtDate(data()?.asOf) : 'Your business at a glance' }}
            </p>
          </div>
          <button (click)="load(true)" [disabled]="loading()"
            class="text-gray-400 hover:text-indigo-600 disabled:opacity-40 transition-colors" title="Refresh insights">
            <i class="pi" [class.pi-refresh]="!loading()" [class.pi-spin]="loading()" [class.pi-spinner]="loading()"></i>
          </button>
        </div>

        <div class="p-5">
          @if (loading() && !data()) {
            <div class="animate-pulse space-y-3">
              <div class="h-4 bg-gray-100 rounded w-3/4"></div>
              <div class="h-4 bg-gray-100 rounded w-1/2"></div>
              <div class="h-16 bg-gray-100 rounded-xl"></div>
            </div>
          } @else if (data()) {
            <!-- narrative -->
            <div class="text-[13.5px] text-gray-700 leading-relaxed whitespace-pre-line mb-4">{{ data().narrative }}</div>

            <!-- KPI strip -->
            @if (kpis()) {
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
                <div class="bg-white rounded-xl border border-gray-100 p-3">
                  <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Sales this month</p>
                  <p class="text-[15px] font-bold tabular-nums text-gray-900">₹{{ inr(kpis().salesThisMonth) }}</p>
                  @if (kpis().growthPct) {
                    <p class="text-[11px] font-semibold" [class.text-emerald-600]="kpis().growthPct > 0" [class.text-red-500]="kpis().growthPct < 0">
                      <i class="pi" [class.pi-arrow-up]="kpis().growthPct > 0" [class.pi-arrow-down]="kpis().growthPct < 0" style="font-size:.6rem"></i>
                      {{ abs(kpis().growthPct) }}% vs last month
                    </p>
                  }
                </div>
                <div class="bg-white rounded-xl border border-gray-100 p-3">
                  <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Profit this month</p>
                  @if (kpis().profitKnown) {
                    <p class="text-[15px] font-bold tabular-nums" [class.text-red-500]="kpis().netProfit < 0" [class.text-gray-900]="kpis().netProfit >= 0">₹{{ inr(kpis().netProfit) }}</p>
                    <p class="text-[11px] text-gray-400">{{ kpis().marginPct }}% margin</p>
                  } @else {
                    <p class="text-[15px] font-bold text-gray-300">—</p>
                    <p class="text-[11px] text-gray-400">Add expenses to see profit</p>
                  }
                </div>
                <div class="bg-white rounded-xl border border-gray-100 p-3">
                  <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Money to collect</p>
                  <p class="text-[15px] font-bold tabular-nums text-gray-900">₹{{ inr(kpis().receivables) }}</p>
                  @if (kpis().overdue90 > 0) { <p class="text-[11px] font-semibold text-red-500">₹{{ inr(kpis().overdue90) }} over 90 days late</p> }
                </div>
                <div class="bg-white rounded-xl border border-gray-100 p-3">
                  <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Best-selling item</p>
                  <p class="text-[13px] font-bold text-gray-900 truncate" [title]="kpis().topProduct || ''">{{ kpis().topProduct || '—' }}</p>
                </div>
              </div>
            }

            <!-- charts: sales trend + top products -->
            @if (salesChartData()) {
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                <div class="bg-white rounded-xl border border-gray-100 p-3">
                  <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Sales — last 6 months</p>
                  <p-chart type="bar" [data]="salesChartData()" [options]="salesChartOptions" height="180px" />
                </div>
                @if (topChartData()) {
                  <div class="bg-white rounded-xl border border-gray-100 p-3">
                    <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Top products by revenue</p>
                    <p-chart type="bar" [data]="topChartData()" [options]="topChartOptions" height="180px" />
                  </div>
                }
              </div>
            }

            <!-- insights list -->
            <div class="space-y-2">
              @for (i of shown(); track i.id) {
                <div class="flex gap-3 bg-white rounded-xl border p-3"
                  [class.border-red-100]="i.kind === 'critical'"
                  [class.border-amber-100]="i.kind === 'warning'"
                  [class.border-emerald-100]="i.kind === 'positive'"
                  [class.border-gray-100]="i.kind === 'info' || i.kind === 'tip'">
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    [class.bg-red-50]="i.kind === 'critical'" [class.text-red-600]="i.kind === 'critical'"
                    [class.bg-amber-50]="i.kind === 'warning'" [class.text-amber-600]="i.kind === 'warning'"
                    [class.bg-emerald-50]="i.kind === 'positive'" [class.text-emerald-600]="i.kind === 'positive'"
                    [class.bg-indigo-50]="i.kind === 'info' || i.kind === 'tip'" [class.text-indigo-600]="i.kind === 'info' || i.kind === 'tip'">
                    <i class="pi {{ i.icon }}" style="font-size:.85rem"></i>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-[13px] font-semibold text-gray-900 leading-snug">{{ i.title }}</p>
                    <p class="text-[12px] text-gray-500 leading-snug mt-0.5">{{ i.detail }}</p>
                    @if (i.recommendation) {
                      <p class="text-[12px] text-indigo-700 leading-snug mt-1 flex gap-1.5">
                        <i class="pi pi-angle-right mt-0.5" style="font-size:.65rem"></i>
                        <span>{{ i.recommendation }}</span>
                      </p>
                    }
                  </div>
                </div>
              }
            </div>

            @if (data().insights?.length > shown().length) {
              <button (click)="expanded.set(!expanded())" class="mt-3 text-[12px] font-semibold text-indigo-600 hover:text-indigo-800">
                {{ expanded() ? 'Show less' : 'Show ' + (data().insights.length - shown().length) + ' more insight' + (data().insights.length - shown().length === 1 ? '' : 's') }}
              </button>
            }

            <!-- top products mini list -->
            @if (data().topProducts?.length) {
              <div class="mt-4 pt-4 border-t border-indigo-100/70">
                <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Top products this month</p>
                <div class="space-y-1.5">
                  @for (p of data().topProducts.slice(0, 5); track p.name; let idx = $index) {
                    <div class="flex items-center gap-2 text-[12.5px]">
                      <span class="w-5 h-5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">{{ idx + 1 }}</span>
                      <span class="flex-1 truncate text-gray-700">{{ p.name }}</span>
                      <span class="text-gray-400 tabular-nums">{{ inrQty(p.qty) }} qty</span>
                      <span class="font-semibold text-gray-900 tabular-nums w-24 text-right">₹{{ inr(p.value) }}</span>
                    </div>
                  }
                </div>
              </div>
            }
          }
        </div>
      </div>
    }
  `,
})
export class AiInsightsCardComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly data = signal<any>(null);
  readonly loading = signal(false);
  readonly hidden = signal(false);
  readonly expanded = signal(false);

  readonly kpis = computed(() => this.data()?.kpis);
  readonly shown = computed(() => {
    const all = this.data()?.insights || [];
    return this.expanded() ? all : all.slice(0, 4);
  });

  // ── Charts ───────────────────────────────────────────────────────────────────
  readonly salesChartData = computed(() => {
    const series = this.data()?.monthlySeries || [];
    if (series.length < 2) return null; // one month is not a trend
    return {
      labels: series.map((m: any) => m.label),
      datasets: [{
        label: 'Sales',
        data: series.map((m: any) => Number(m.sales) || 0),
        backgroundColor: 'rgba(99,102,241,0.75)',
        hoverBackgroundColor: 'rgba(79,70,229,0.95)',
        borderRadius: 6,
        maxBarThickness: 34,
      }],
    };
  });

  readonly topChartData = computed(() => {
    const rows = (this.data()?.topProducts || []).slice(0, 5);
    if (!rows.length) return null;
    return {
      labels: rows.map((p: any) => this.shortName(p.name)),
      datasets: [{
        label: 'Revenue',
        data: rows.map((p: any) => Number(p.value) || 0),
        backgroundColor: ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'],
        borderRadius: 6,
        maxBarThickness: 20,
      }],
    };
  });

  readonly salesChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a', padding: 10, cornerRadius: 8,
        callbacks: { label: (ctx: any) => ' ₹' + (Number(ctx.parsed?.y) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }) },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8' } },
      y: {
        beginAtZero: true, grid: { color: '#f1f5f9' },
        ticks: { font: { size: 10 }, color: '#94a3b8', maxTicksLimit: 5, callback: (v: any) => this.compactInr(v) },
      },
    },
  };

  readonly topChartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a', padding: 10, cornerRadius: 8,
        callbacks: { label: (ctx: any) => ' ₹' + (Number(ctx.parsed?.x) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }) },
      },
    },
    scales: {
      x: {
        beginAtZero: true, grid: { color: '#f1f5f9' },
        ticks: { font: { size: 10 }, color: '#94a3b8', maxTicksLimit: 5, callback: (v: any) => this.compactInr(v) },
      },
      y: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#64748b' } },
    },
  };

  /** ₹ axis labels the Indian way: 1.2Cr / 45L / 80k. */
  private compactInr(v: unknown): string {
    const n = Number(v) || 0;
    const a = Math.abs(n);
    if (a >= 1e7) return '₹' + (n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + 'Cr';
    if (a >= 1e5) return '₹' + (n / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + 'L';
    if (a >= 1e3) return '₹' + (n / 1e3).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + 'k';
    return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  private shortName(name: unknown): string {
    const s = String(name ?? '');
    return s.length > 22 ? s.slice(0, 20) + '…' : s;
  }

  ngOnInit() { this.load(); }

  load(refresh = false) {
    this.loading.set(true);
    this.api.get<any>('/erp/insights', refresh ? { refresh: '1' } : undefined).subscribe({
      next: (r) => {
        const d = unwrap<any>(r);
        this.data.set(d);
        // Nothing meaningful to show → hide the card entirely.
        if (!d || (!d.insights?.length && !d.narrative)) this.hidden.set(true);
        this.loading.set(false);
      },
      error: () => { this.hidden.set(true); this.loading.set(false); },
    });
  }

  fmtDate(v: any): string {
    const d = new Date(v);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  inr(n: any): string { return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
  inrQty(n: any): string { return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
  abs(n: any): number { return Math.abs(Number(n) || 0); }
}
