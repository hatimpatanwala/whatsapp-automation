import { Component, HostListener, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { EntryService, ItemMasterRow } from '../../core/services/entry.service';
import { AccountingService } from '../../core/services/accounting.service';

interface MonthBar { label: string; value: number; }
interface DueRow { id: string; no: string; party: string; due: string; balance: number; overdue: boolean; }
interface TopParty { name: string; amount: number; }

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * ERP Home — the admin's one-glance business overview (portal-style dashboard
 * inside the Miracle chrome): sales today/this month, month profit, receivables
 * with due-soon/overdue split, a 6-month sales chart and ageing chart (hand-rolled
 * SVG — no chart library), bills needing collection, top parties by outstanding,
 * and low-stock alerts. Every tile deep-links into the relevant screen.
 */
@Component({
  selector: 'wa-erp-home',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="p-3 md:p-5 select-none">
      <div class="flex items-center gap-4 mb-3 border-b pb-2">
        <h1 class="text-lg font-semibold">Business Overview</h1>
        <span class="text-sm text-slate-500">{{ today | date: 'EEEE, dd MMMM yyyy' }}</span>
        @if (loading()) { <span class="text-xs text-slate-400">refreshing…</span> }
        <button (click)="refresh()" class="ml-auto text-xs px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50" title="Reload the latest figures">↻ Refresh</button>
      </div>

      <!-- KPI cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div class="hm-card cursor-pointer" (click)="go('/entry/registers/sales')">
          <span>Sales today</span><b>₹{{ fmt(todaySales()) }}</b>
        </div>
        <div class="hm-card cursor-pointer" (click)="go('/entry/registers/sales')">
          <span>Sales this month</span><b>₹{{ fmt(monthSales()) }}</b>
        </div>
        <div class="hm-card" [class.hm-good]="profit() >= 0" [class.hm-bad-card]="profit() < 0">
          <span>Profit this month</span><b>₹{{ fmt(profit()) }}</b>
        </div>
        <div class="hm-card cursor-pointer" (click)="go('/accounting/reports/ageing')">
          <span>Receivables</span><b>₹{{ fmt(receivables()) }}</b>
        </div>
        <div class="hm-card hm-bad-card cursor-pointer" (click)="go('/accounting/reports/ageing')">
          <span>Overdue</span><b>₹{{ fmt(overdueTotal()) }}</b>
        </div>
        <div class="hm-card cursor-pointer" (click)="go('/entry/receipt')">
          <span>Open bills</span><b>{{ openBills() }}</b>
        </div>
        <div class="hm-card cursor-pointer" (click)="go('/accounting/reports/stock-summary')">
          <span>Stock value</span><b>₹{{ fmt(stockValue()) }}</b>
        </div>
        <div class="hm-card cursor-pointer" (click)="go('/entry/items')">
          <span>Low stock items</span><b [class.hm-bad]="lowStock().length">{{ lowStock().length }}</b>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <!-- Sales trend (6 months) -->
        <div class="hm-panel">
          <div class="hm-h">Sales — last 6 months</div>
          <svg [attr.viewBox]="'0 0 300 120'" class="w-full" preserveAspectRatio="none">
            @for (b of monthBars(); track b.label; let i = $index) {
              <rect [attr.x]="i * 50 + 10" [attr.y]="110 - barH(b.value, maxMonth())"
                    width="30" [attr.height]="barH(b.value, maxMonth())" rx="2" fill="#2a6cb5" />
              <text [attr.x]="i * 50 + 25" y="118" text-anchor="middle" font-size="7" fill="#667">{{ b.label }}</text>
              <text [attr.x]="i * 50 + 25" [attr.y]="106 - barH(b.value, maxMonth())" text-anchor="middle" font-size="7" fill="#334">{{ short(b.value) }}</text>
            }
          </svg>
        </div>

        <!-- Receivables ageing -->
        <div class="hm-panel">
          <div class="hm-h">Receivables ageing</div>
          <svg [attr.viewBox]="'0 0 300 120'" class="w-full" preserveAspectRatio="none">
            @for (b of ageBars(); track b.label; let i = $index) {
              <rect [attr.x]="i * 72 + 14" [attr.y]="110 - barH(b.value, maxAge())"
                    width="44" [attr.height]="barH(b.value, maxAge())" rx="2"
                    [attr.fill]="i === 0 ? '#22a06b' : i === 1 ? '#d9a520' : i === 2 ? '#e07b39' : '#c0392b'" />
              <text [attr.x]="i * 72 + 36" y="118" text-anchor="middle" font-size="7" fill="#667">{{ b.label }}</text>
              <text [attr.x]="i * 72 + 36" [attr.y]="106 - barH(b.value, maxAge())" text-anchor="middle" font-size="7" fill="#334">{{ short(b.value) }}</text>
            }
          </svg>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Collection list: overdue + due soon -->
        <div class="hm-panel lg:col-span-2">
          <div class="hm-h">Bills to collect <span class="hm-sub">(overdue &amp; due in 7 days — click to receive)</span></div>
          <table class="hm-table">
            <thead><tr><th>No.</th><th>Party</th><th>Due</th><th class="r">Balance</th><th></th></tr></thead>
            <tbody>
              @for (d of dueRows(); track d.id) {
                <tr class="cursor-pointer" (click)="go('/entry/receipt')">
                  <td class="mono">{{ d.no }}</td>
                  <td>{{ d.party }}</td>
                  <td>{{ d.due | date: 'dd-MM-yy' }}</td>
                  <td class="r" [class.hm-bad]="d.overdue">{{ fmt(d.balance) }}</td>
                  <td>@if (d.overdue) { <span class="hm-chip hm-chip-red">overdue</span> } @else { <span class="hm-chip">due soon</span> }</td>
                </tr>
              } @empty { <tr><td colspan="5" class="hm-none">Nothing due — collections are clean. 🎉</td></tr> }
            </tbody>
          </table>
        </div>

        <div class="space-y-4">
          <!-- Top parties by outstanding -->
          <div class="hm-panel">
            <div class="hm-h">Top parties by outstanding</div>
            @for (t of topDebtors(); track t.name) {
              <div class="hm-row"><span class="truncate">{{ t.name }}</span><b>₹{{ fmt(t.amount) }}</b></div>
            } @empty { <p class="hm-none">No outstanding balances.</p> }
          </div>

          <!-- Low stock -->
          <div class="hm-panel">
            <div class="hm-h">Low stock <span class="hm-sub">(≤ min)</span></div>
            @for (it of lowStock(); track it.id) {
              <div class="hm-row cursor-pointer" (click)="go('/entry/items')">
                <span class="truncate">{{ it.name }}</span>
                <b class="hm-bad">{{ it.stock }} / {{ it.minStock }}</b>
              </div>
            } @empty { <p class="hm-none">All items above minimum stock.</p> }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .hm-card { border: 1px solid #dfe5ee; background: #f7f9fc; padding: 10px 12px; border-radius: 6px;
        display: flex; flex-direction: column; gap: 2px; }
      .hm-card span { font-size: 11px; color: #789; text-transform: uppercase; letter-spacing: .3px; }
      .hm-card b { font-size: 18px; color: #1f2430; }
      .hm-good b { color: #1d7a4f; }
      .hm-bad-card b { color: #b91c1c; }
      .hm-bad { color: #b91c1c !important; }
      .hm-panel { border: 1px solid #dfe5ee; border-radius: 6px; padding: 10px 12px; background: #fff; }
      .hm-h { font-weight: 700; color: #14456e; font-size: 12.5px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .3px; }
      .hm-sub { font-weight: 400; text-transform: none; color: #889; font-size: 11px; }
      .hm-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .hm-table th { text-align: left; color: #789; font-weight: 600; font-size: 11px; border-bottom: 1px solid #dfe5ee; padding: 3px 6px; }
      .hm-table td { border-bottom: 1px solid #eef1f6; padding: 4px 6px; }
      .hm-table .r { text-align: right; }
      .mono { font-family: Consolas, monospace; font-size: 11.5px; }
      .hm-chip { font-size: 10.5px; border: 1px solid #d9a520; color: #8a6d0b; background: #fdf6d8; padding: 0 6px; border-radius: 8px; }
      .hm-chip-red { border-color: #e3a0a0; color: #b91c1c; background: #fdecec; }
      .hm-row { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; padding: 3px 0; border-bottom: 1px solid #f2f5fa; }
      .hm-none { color: #9aa; font-size: 12px; text-align: center; padding: 8px 0; }
    `,
  ],
})
export class ErpHomeComponent {
  private readonly entry = inject(EntryService);
  private readonly acc = inject(AccountingService);
  private readonly router = inject(Router);

  readonly today = new Date();
  readonly loading = signal(true);

  readonly todaySales = signal(0);
  readonly monthSales = signal(0);
  readonly profit = signal(0);
  readonly receivables = signal(0);
  readonly overdueTotal = signal(0);
  readonly openBills = signal(0);
  readonly stockValue = signal(0);
  readonly monthBars = signal<MonthBar[]>([]);
  readonly ageBars = signal<MonthBar[]>([]);
  readonly dueRows = signal<DueRow[]>([]);
  readonly topDebtors = signal<TopParty[]>([]);
  readonly lowStock = signal<ItemMasterRow[]>([]);

  constructor() {
    this.load();
  }

  /** Manual + tab-focus refresh of the dashboard figures. */
  @HostListener('window:focus')
  refresh(): void { this.load(); }

  private load(): void {
    const now = new Date();
    const todayKey = ymdLocal(now);
    const monthKey = todayKey.slice(0, 7);
    const monthStart = `${monthKey}-01`;

    // Sales, dues and the monthly trend — computed from the invoice register.
    this.entry.invoices(200).subscribe((res: any) => {
      const rows = (res?.data ?? res?.items ?? []) as any[];
      let today = 0, month = 0, recv = 0, overdue = 0, open = 0;
      const byMonth = new Map<string, number>();
      const due: DueRow[] = [];
      const soonCutoff = new Date(now.getTime() + 7 * 86400_000);

      for (const r of rows) {
        if ((r.status || 'issued') === 'void') continue;
        const total = Number(r.total) || 0;
        const bal = Number(r.balanceDue) || 0;
        const issued = r.issuedAt || r.createdAt;
        const key = issued ? String(issued).slice(0, 7) : '';
        if (key) byMonth.set(key, (byMonth.get(key) || 0) + total);
        if (issued && String(issued).slice(0, 10) === todayKey) today += total;
        if (key === monthKey) month += total;
        recv += bal;
        if (bal > 0) {
          open++;
          const dueAt = r.dueDate ? new Date(r.dueDate) : null;
          const isOverdue = !!dueAt && dueAt < now;
          if (isOverdue) overdue += bal;
          if (dueAt && (isOverdue || dueAt <= soonCutoff)) {
            due.push({
              id: r.id, no: r.invoiceNumber, party: r.customerName || (r.isCash ? 'Cash' : '—'),
              due: r.dueDate, balance: bal, overdue: isOverdue,
            });
          }
        }
      }

      const bars: MonthBar[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        bars.push({ label: d.toLocaleString('en', { month: 'short' }), value: money(byMonth.get(k) || 0) });
      }

      due.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
      this.todaySales.set(money(today));
      this.monthSales.set(money(month));
      this.receivables.set(money(recv));
      this.overdueTotal.set(money(overdue));
      this.openBills.set(open);
      this.monthBars.set(bars);
      this.dueRows.set(due.slice(0, 8));
      this.loading.set(false);
    });

    // Month profit from the P&L.
    this.acc.pnl(monthStart, todayKey).subscribe({
      next: (r: any) => {
        const p = r?.netProfit ?? r?.profit ?? (Number(r?.totalIncome) || 0) - (Number(r?.totalExpense) || 0);
        this.profit.set(money(Number(p) || 0));
      },
      error: () => { /* books empty — profit stays 0 */ },
    });

    // Ageing buckets + top debtors.
    this.acc.ageing().subscribe({
      next: (res: any) => {
        const rows = (res?.receivables ?? res?.rows ?? []) as any[];
        const sum = (k: string) => money(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
        this.ageBars.set([
          { label: '0–30', value: sum('d030') },
          { label: '31–60', value: sum('d3160') },
          { label: '61–90', value: sum('d6190') },
          { label: '90+', value: sum('d90Plus') },
        ]);
        this.topDebtors.set(
          rows
            .map((r) => ({ name: r.party || r.partyName || r.name || '—', amount: Number(r.total ?? r.outstanding) || 0 }))
            .filter((t) => t.amount > 0)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5),
        );
      },
      error: () => { /* ageing needs books — fine on a fresh install */ },
    });

    // Stock value + low-stock alerts from the item master.
    this.entry.items('').subscribe((items) => {
      const list = items || [];
      this.stockValue.set(money(list.reduce((s, it) =>
        s + (Number(it.stock) || 0) * (Number(it.purchasePrice ?? it.openingRate ?? it.basePrice) || 0), 0)));
      this.lowStock.set(list.filter((it) => (Number(it.stock) || 0) <= (Number(it.minStock) || 0)).slice(0, 6));
    });
  }

  barH(v: number, max: number): number { return max > 0 ? Math.max(1, Math.round((v / max) * 92)) : 1; }
  maxMonth(): number { return Math.max(1, ...this.monthBars().map((b) => b.value)); }
  maxAge(): number { return Math.max(1, ...this.ageBars().map((b) => b.value)); }
  short(v: number): string {
    if (v >= 10_000_000) return (v / 10_000_000).toFixed(1) + 'Cr';
    if (v >= 100_000) return (v / 100_000).toFixed(1) + 'L';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'k';
    return v ? String(Math.round(v)) : '';
  }
  fmt(n: unknown): string { return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  go(route: string): void { void this.router.navigate([route]); }
}
