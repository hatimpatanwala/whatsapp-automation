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

interface DocLine { name: string; qty: number; rate: number; amount: number; batch?: string; }
interface DocDetail {
  id: string; no: string; date: string; party: string; status: string;
  total: number; balance: number | null; lines: DocLine[];
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
              <tr (click)="sel.set(i); open(r)" class="cursor-pointer"
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

      <!-- Document detail (click / Enter on any row) -->
      @if (detail(); as d) {
        <div class="rg-backdrop" (mousedown)="closeDetail()">
          <div class="rg-box" tabindex="-1" data-detail-box
               (mousedown)="$event.stopPropagation()" (keydown)="onDetailKey($event)">
            <div class="rg-title">
              {{ d.no }} <span class="rg-sub">{{ d.party }} · {{ d.date | date: 'dd-MM-yyyy' }} · {{ d.status }}</span>
            </div>
            @if (detailLoading()) {
              <p class="rg-none">Loading…</p>
            } @else {
              <table class="rg-lines">
                <thead><tr><th>#</th><th>Item</th><th class="rg-r">Qty</th><th class="rg-r">Rate</th><th class="rg-r">Amount</th></tr></thead>
                <tbody>
                  @for (l of d.lines; track $index; let i = $index) {
                    <tr>
                      <td>{{ i + 1 }}</td>
                      <td>{{ l.name }}@if (l.batch) { <span class="rg-batch">batch {{ l.batch }}</span> }</td>
                      <td class="rg-r">{{ l.qty }}</td>
                      <td class="rg-r">{{ fmt(l.rate) }}</td>
                      <td class="rg-r">{{ fmt(l.amount) }}</td>
                    </tr>
                  } @empty { <tr><td colspan="5" class="rg-none">No line items recorded.</td></tr> }
                </tbody>
                <tfoot>
                  <tr><td colspan="4" class="rg-r rg-tot">TOTAL</td><td class="rg-r rg-tot">₹{{ fmt(d.total) }}</td></tr>
                  @if (d.balance !== null) {
                    <tr><td colspan="4" class="rg-r">Balance</td><td class="rg-r" [class.rg-bad]="d.balance > 0">{{ fmt(d.balance) }}</td></tr>
                  }
                </tfoot>
              </table>
              <div class="rg-actions">
                @if (kind() === 'sales') {
                  <button class="rg-btn rg-btn-dark" (click)="printDetail()">🖨 Print (Enter)</button>
                }
                @if (kind() === 'quote') {
                  <button class="rg-btn rg-btn-dark" (click)="convertDetail()">→ Convert to Invoice (Enter)</button>
                }
                <button class="rg-btn" (click)="closeDetail()">Close (Esc)</button>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .rg-backdrop { position: fixed; inset: 0; z-index: 600; background: rgba(20,40,70,.45);
        display: flex; align-items: flex-start; justify-content: center; padding-top: 10vh; }
      .rg-box { background: #fff; border: 1px solid #7da2ce; box-shadow: 4px 6px 18px rgba(0,0,0,.35);
        width: 640px; max-width: 94vw; max-height: 74vh; overflow: auto; padding: 12px 14px; outline: none; font-size: 13px; }
      .rg-title { font-weight: 700; color: #14456e; font-size: 14px; margin-bottom: 8px; font-family: Consolas, monospace; }
      .rg-sub { font-weight: 400; font-family: 'Segoe UI', sans-serif; font-size: 12px; color: #778; }
      .rg-lines { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .rg-lines th { text-align: left; color: #789; font-weight: 600; font-size: 11px; border-bottom: 1px solid #dfe5ee; padding: 3px 6px; }
      .rg-lines td { border-bottom: 1px solid #eef1f6; padding: 4px 6px; }
      .rg-r { text-align: right !important; }
      .rg-tot { font-weight: 700; color: #14456e; }
      .rg-bad { color: #b91c1c; font-weight: 600; }
      .rg-batch { margin-left: 6px; font-size: 10.5px; color: #889; background: #f2f5fa; border: 1px solid #dfe5ee; padding: 0 4px; border-radius: 3px; }
      .rg-none { color: #9aa; text-align: center; padding: 10px; }
      .rg-actions { display: flex; gap: 8px; margin-top: 12px; }
      .rg-btn { border: 1px solid #b5b19f; background: #f4f2e8; padding: 6px 14px; cursor: pointer; font-size: 12.5px; }
      .rg-btn-dark { background: #1d5c8f; border-color: #14456e; color: #fff; }
    `,
  ],
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

  // ─── Document detail (click / Enter on a row) ───────────────────────────────
  readonly detail = signal<DocDetail | null>(null);
  readonly detailLoading = signal(false);
  private detailPrevFocus: HTMLElement | null = null;

  open(r: RegRow): void {
    this.detailPrevFocus = document.activeElement as HTMLElement | null;
    this.detail.set({ id: r.id, no: r.number, date: r.date, party: r.party, status: r.status, total: r.total, balance: r.balance, lines: [] });
    this.detailLoading.set(true);
    setTimeout(() => (document.querySelector('[data-detail-box]') as HTMLElement | null)?.focus());

    const unwrap = (res: any) => res?.data ?? res;
    const money = (v: unknown) => Number(v) || 0;
    const done = (lines: DocLine[], total?: number, balance?: number | null) => {
      const d = this.detail();
      if (!d || d.id !== r.id) return;
      this.detail.set({ ...d, lines, total: total ?? d.total, balance: balance !== undefined ? balance : d.balance });
      this.detailLoading.set(false);
    };
    const fail = () => this.detailLoading.set(false);

    switch (this.kind()) {
      case 'sales':
        this.entry.invoice(r.id).subscribe({
          next: (res) => {
            const inv = unwrap(res);
            const items = Array.isArray(inv?.items) ? inv.items : [];
            done(
              items.map((it: any) => ({
                name: it.description || it.productName || '—',
                qty: money(it.quantity) + (money(it.freeQty) ? money(it.freeQty) : 0),
                rate: money(it.unitPrice),
                amount: money(it.lineTotal) || money(it.quantity) * money(it.unitPrice),
                batch: it.batchNo || undefined,
              })),
              money(inv?.total), money(inv?.balanceDue),
            );
          },
          error: fail,
        });
        return;
      case 'purchase':
        this.entry.supplierOrderById(r.id).subscribe({
          next: (res) => {
            const so = unwrap(res);
            const items = Array.isArray(so?.items) ? so.items : [];
            done(
              items.map((it: any) => ({
                name: it.description || '—',
                qty: money(it.quantity),
                rate: money(it.unitPrice),
                amount: money(it.lineTotal) || money(it.quantity) * money(it.unitPrice),
                batch: it.batchNo || undefined,
              })),
              money(so?.total), money(so?.total) - money(so?.amountPaid),
            );
          },
          error: fail,
        });
        return;
      case 'quote':
        this.entry.quoteById(r.id).subscribe({
          next: (res) => {
            const q = unwrap(res);
            const items = Array.isArray(q?.items) ? q.items : [];
            done(
              items.map((it: any) => {
                const qty = money(it.quantity);
                const rate = money(it.unitPrice);
                const disc = money(it.discount);
                return { name: it.productName || it.description || '—', qty, rate, amount: qty * rate * (1 - disc / 100) };
              }),
              money(q?.totalAmount), null,
            );
          },
          error: fail,
        });
        return;
      case 'order':
        this.entry.orderById(r.id).subscribe({
          next: (res) => {
            const o = unwrap(res);
            const items = Array.isArray(o?.items) ? o.items : [];
            done(
              items.map((it: any) => ({
                name: it.productName || it.description || '—',
                qty: money(it.quantity),
                rate: money(it.unitPrice),
                amount: money(it.totalPrice) || money(it.lineTotal) || money(it.quantity) * money(it.unitPrice),
              })),
              money(o?.total), null,
            );
          },
          error: fail,
        });
        return;
    }
  }

  onDetailKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closeDetail(); return; }
    if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      if (this.kind() === 'sales') this.printDetail();
      else if (this.kind() === 'quote') this.convertDetail();
    }
  }

  printDetail(): void {
    const d = this.detail();
    if (d) void this.router.navigate(['/print/invoice', d.id]);
  }

  /** Miracle "convert to invoice": carries the quotation into the sales screen. */
  convertDetail(): void {
    const d = this.detail();
    if (d) void this.router.navigate(['/entry/sales'], { queryParams: { fromQuote: d.id } });
  }

  closeDetail(): void {
    this.detail.set(null);
    const back = this.detailPrevFocus;
    this.detailPrevFocus = null;
    setTimeout(() => back?.focus());
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
    if (this.detail()) return; // the detail popup owns the keyboard
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
