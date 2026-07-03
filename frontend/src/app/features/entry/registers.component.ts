import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { EntryService } from '../../core/services/entry.service';

type Kind = 'sales' | 'purchase' | 'quote' | 'order';

interface RegRow {
  id: string;
  date: string;
  number: string;
  party: string;
  status: string;
  total: number;
  balance: number | null;
}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Local yyyy-MM-dd (toISOString would shift IST dates back a day). */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Registers — the Miracle document registers, one screen for all four:
 * Sales Register, Purchase Register, Quotation Register, Order Register.
 *
 * From/To period (defaults to the current month), type-to-filter on party/number,
 * ↑↓ row selection, Enter drills a sales row into the printable invoice,
 * PgUp/PgDn shift the period a month, Esc returns to the Gateway. Footer keeps
 * running totals of the filtered set (count / amount / outstanding).
 */
@Component({
  selector: 'wa-registers',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="p-3 md:p-5 select-none">
      <div class="flex items-center gap-4 mb-3 border-b pb-2 flex-wrap">
        <h1 class="text-lg font-semibold">{{ title() }}</h1>
        <div class="flex rounded overflow-hidden border text-sm">
          @for (k of kinds; track k.kind) {
            <button (click)="switchKind(k.kind)" class="px-3 py-1"
                    [class.bg-slate-800]="kind() === k.kind" [class.text-white]="kind() === k.kind">{{ k.label }}</button>
          }
        </div>
        <label class="text-sm">From
          <input type="date" [(ngModel)]="from" (ngModelChange)="apply()" class="ml-1 border rounded px-2 py-1" />
        </label>
        <label class="text-sm">To
          <input type="date" [(ngModel)]="to" (ngModelChange)="apply()" class="ml-1 border rounded px-2 py-1" />
        </label>
        <input [(ngModel)]="filter" (ngModelChange)="apply()" placeholder="Filter party / number…"
               data-autofocus data-cell="filter"
               class="border rounded px-2 py-1 text-sm focus:bg-amber-50 focus:outline-none" autocomplete="off" />
        <span class="ml-auto text-xs text-slate-500">↑↓ move · Enter {{ kind() === 'quote' ? 'convert to invoice' : 'open' }} · PgUp/PgDn month · Esc back</span>
      </div>

      @if (loading()) {
        <p class="text-sm text-slate-400 py-8 text-center">Loading register…</p>
      } @else {
        <table class="w-full text-sm border border-slate-300" style="border-collapse: collapse">
          <thead>
            <tr class="bg-slate-100 text-slate-600">
              <th class="border border-slate-300 px-2 py-1 w-24 text-left">Date</th>
              <th class="border border-slate-300 px-2 py-1 w-36 text-left">No.</th>
              <th class="border border-slate-300 px-2 py-1 text-left">Party</th>
              <th class="border border-slate-300 px-2 py-1 w-28 text-left">Status</th>
              <th class="border border-slate-300 px-2 py-1 w-28 text-right">Amount</th>
              <th class="border border-slate-300 px-2 py-1 w-28 text-right">{{ balanceHead() }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of visible(); track r.id; let i = $index) {
              <tr (click)="sel.set(i)" (dblclick)="open(r)" class="cursor-pointer"
                  [class.bg-amber-100]="i === sel()">
                <td class="border border-slate-300 px-2 py-1">{{ r.date | date: 'dd-MM-yy' }}</td>
                <td class="border border-slate-300 px-2 py-1 font-mono text-xs">{{ r.number }}</td>
                <td class="border border-slate-300 px-2 py-1">{{ r.party }}</td>
                <td class="border border-slate-300 px-2 py-1">
                  <span class="text-xs px-1.5 py-0.5 rounded"
                        [class.bg-emerald-50]="isGood(r.status)" [class.text-emerald-700]="isGood(r.status)"
                        [class.bg-amber-50]="!isGood(r.status)" [class.text-amber-700]="!isGood(r.status)">{{ r.status }}</span>
                </td>
                <td class="border border-slate-300 px-2 py-1 text-right font-medium">{{ fmt(r.total) }}</td>
                <td class="border border-slate-300 px-2 py-1 text-right"
                    [class.text-red-600]="(r.balance ?? 0) > 0">{{ r.balance !== null ? fmt(r.balance) : '—' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="border border-slate-300 px-2 py-6 text-center text-slate-400">No documents in this period.</td></tr>
            }
          </tbody>
          <tfoot>
            <tr class="bg-slate-50 font-semibold">
              <td class="border border-slate-300 px-2 py-1" colspan="3">{{ visible().length }} document(s)</td>
              <td class="border border-slate-300 px-2 py-1 text-right text-xs text-slate-500">TOTAL</td>
              <td class="border border-slate-300 px-2 py-1 text-right">₹{{ fmt(sumTotal()) }}</td>
              <td class="border border-slate-300 px-2 py-1 text-right" [class.text-red-600]="sumBalance() > 0">
                {{ hasBalance() ? '₹' + fmt(sumBalance()) : '—' }}
              </td>
            </tr>
          </tfoot>
        </table>
      }
    </div>
  `,
})
export class RegistersComponent {
  private readonly entry = inject(EntryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly kinds: Array<{ kind: Kind; label: string }> = [
    { kind: 'sales', label: 'Sales' },
    { kind: 'purchase', label: 'Purchase' },
    { kind: 'quote', label: 'Quotation' },
    { kind: 'order', label: 'Order' },
  ];

  readonly kind = signal<Kind>('sales');
  readonly loading = signal(false);
  readonly sel = signal(0);
  readonly visible = signal<RegRow[]>([]);

  private all: RegRow[] = [];
  from = '';
  to = '';
  filter = '';

  constructor() {
    const now = new Date();
    this.from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    this.to = ymd(now);
    this.route.paramMap.subscribe((pm) => {
      const k = (pm.get('kind') || 'sales') as Kind;
      this.kind.set(['sales', 'purchase', 'quote', 'order'].includes(k) ? k : 'sales');
      this.load();
    });
  }

  title(): string {
    return { sales: 'Sales Register', purchase: 'Purchase Register', quote: 'Quotation Register', order: 'Order Register' }[this.kind()];
  }
  balanceHead(): string {
    return this.kind() === 'quote' || this.kind() === 'order' ? '' : 'Balance';
  }
  hasBalance(): boolean { return this.kind() === 'sales' || this.kind() === 'purchase'; }

  switchKind(k: Kind): void {
    void this.router.navigate(['/entry/registers', k]);
  }

  private load(): void {
    this.loading.set(true);
    const done = (rows: RegRow[]) => {
      this.all = rows;
      this.loading.set(false);
      this.apply();
    };
    const arr = (res: any): any[] => res?.data ?? res?.items ?? (Array.isArray(res) ? res : []);
    switch (this.kind()) {
      case 'sales':
        this.entry.invoices(200).subscribe({
          next: (res) => done(arr(res).map((r: any) => ({
            id: r.id,
            date: r.issuedAt || r.createdAt,
            number: r.invoiceNumber || '',
            party: r.customerName || r.billTo?.name || (r.isCash ? 'Cash' : '—'),
            status: r.paymentStatus || r.status || '',
            total: Number(r.total) || 0,
            balance: Number(r.balanceDue) || 0,
          }))),
          error: () => done([]),
        });
        return;
      case 'purchase':
        this.entry.supplierOrders(200).subscribe({
          next: (res) => done(arr(res).map((r: any) => ({
            id: r.id,
            date: r.supplierInvoiceDate || r.createdAt,
            number: r.supplierInvoiceNo || r.orderNumber || '',
            party: r.supplierName || '—',
            status: r.paymentStatus || r.status || '',
            total: Number(r.total) || 0,
            balance: money((Number(r.total) || 0) - (Number(r.amountPaid) || 0)),
          }))),
          error: () => done([]),
        });
        return;
      case 'quote':
        this.entry.quotes(100).subscribe({
          next: (res) => done(arr(res).map((r: any) => ({
            id: r.id,
            date: r.createdAt,
            number: r.quoteNumber || '',
            party: r.customerName || '—',
            status: r.status || '',
            total: Number(r.totalAmount) || 0,
            balance: null,
          }))),
          error: () => done([]),
        });
        return;
      case 'order':
        this.entry.orders(100).subscribe({
          next: (res) => done(arr(res).map((r: any) => ({
            id: r.id,
            date: r.createdAt,
            number: r.orderNumber || '',
            party: r.customerName || r.customer?.name || '—',
            status: r.status || '',
            total: Number(r.total) || 0,
            balance: null,
          }))),
          error: () => done([]),
        });
        return;
    }
  }

  apply(): void {
    const f = this.filter.trim().toLowerCase();
    const from = this.from ? new Date(this.from + 'T00:00:00') : null;
    const to = this.to ? new Date(this.to + 'T23:59:59') : null;
    this.visible.set(this.all.filter((r) => {
      const d = r.date ? new Date(r.date) : null;
      if (from && d && d < from) return false;
      if (to && d && d > to) return false;
      if (f && !(`${r.number} ${r.party}`.toLowerCase().includes(f))) return false;
      return true;
    }));
    this.sel.set(0);
  }

  sumTotal(): number { return money(this.visible().reduce((s, r) => s + r.total, 0)); }
  sumBalance(): number { return money(this.visible().reduce((s, r) => s + (r.balance || 0), 0)); }
  isGood(status: string): boolean { return ['paid', 'completed', 'delivered', 'accepted', 'confirmed', 'received'].includes((status || '').toLowerCase()); }
  fmt(n: unknown): string { return (Number(n) || 0).toFixed(2); }

  open(r: RegRow): void {
    if (this.kind() === 'sales') void this.router.navigate(['/print/invoice', r.id]);
    // Miracle "convert to invoice": Enter on a quotation carries it into the sales screen.
    else if (this.kind() === 'quote') void this.router.navigate(['/entry/sales'], { queryParams: { fromQuote: r.id } });
  }

  private shiftMonth(delta: number): void {
    const f = new Date(this.from + 'T00:00:00');
    const start = new Date(f.getFullYear(), f.getMonth() + delta, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    this.from = ymd(start);
    this.to = ymd(end);
    this.apply();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement | null;
    // The filter box is the home cell — arrows/Enter still drive the row selection from it.
    const inFilter = el?.getAttribute?.('data-cell') === 'filter';
    const typing = !inFilter && el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    switch (e.key) {
      case 'ArrowDown':
        if (typing) return;
        e.preventDefault();
        this.sel.set(Math.min(this.sel() + 1, this.visible().length - 1));
        return;
      case 'ArrowUp':
        if (typing) return;
        e.preventDefault();
        this.sel.set(Math.max(this.sel() - 1, 0));
        return;
      case 'Enter': {
        if (typing) return;
        const row = this.visible()[this.sel()];
        if (row) this.open(row);
        return;
      }
      case 'PageUp':
        e.preventDefault();
        this.shiftMonth(-1);
        return;
      case 'PageDown':
        e.preventDefault();
        this.shiftMonth(1);
        return;
      case 'Escape':
        if (typing) { (el as HTMLInputElement).blur(); return; }
        void this.router.navigate(['/gateway']);
        return;
    }
  }
}
