import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Observable } from 'rxjs';
import { EntryService, RateHistoryRow } from '../../core/services/entry.service';

/**
 * In-entry lookups — Miracle's mid-voucher intelligence, available on EVERY
 * billing screen without leaving the entry:
 *
 *   Alt+P — PARTY detail popup: outstanding / overdue / credit limit & days /
 *           price level / recent bills / what they usually buy at what rate.
 *   Alt+I — ITEM detail popup for the grid row the cursor is on: live stock vs
 *           min stock, purchase/sale/MRP rates, dual units, HSN/GST, last rate
 *           to THIS party, last overall, price-level rate.
 *   Alt+L — LAST RATES list for the current item, specific to the selected
 *           party (their previous bills: date, doc, qty, rate). ↑↓ pick a row
 *           and Enter APPLIES that rate to the grid line — Miracle's rate pick.
 *
 * Esc closes and returns focus exactly where the cursor was, so the operator
 * never loses their place in the voucher. Embed once per screen:
 *   <wa-entry-lookup [kind]="'customer'" [party]="customer()" [rows]="rows" />
 */
@Component({
  selector: 'wa-entry-lookup',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (panel(); as p) {
      <div class="lk-backdrop" (mousedown)="close()">
        <div class="lk-box" tabindex="-1" data-lookup-box
             (mousedown)="$event.stopPropagation()" (keydown)="onBoxKey($event)">
          @if (p === 'party' && party) {
            <div class="lk-title">
              👤 {{ party.name }}
              <span class="lk-sub">{{ party.phone || '' }} {{ party.gstin ? '· ' + party.gstin : '' }}</span>
            </div>
            <div class="lk-stats">
              <div class="lk-stat" [class.lk-bad]="num(party.outstanding) > 0">
                <span>Outstanding</span><b>₹{{ fmt(party.outstanding) }}</b>
              </div>
              @if (kind === 'customer') {
                <div class="lk-stat" [class.lk-bad]="num(party.overdue) > 0"><span>Overdue</span><b>₹{{ fmt(party.overdue) }}</b></div>
                <div class="lk-stat"><span>Open bills</span><b>{{ party.openInvoices ?? 0 }}</b></div>
                <div class="lk-stat"><span>Credit limit</span><b>{{ party.creditLimit ? '₹' + fmt(party.creditLimit) : '—' }}</b></div>
                <div class="lk-stat"><span>Credit days</span><b>{{ party.creditDays ?? '—' }}</b></div>
                <div class="lk-stat"><span>Price level</span><b>{{ party.priceLevelName || 'Standard' }}</b></div>
              } @else {
                <div class="lk-stat"><span>Open orders</span><b>{{ party.openOrders ?? 0 }}</b></div>
              }
            </div>

            <div class="lk-h">Recent {{ kind === 'customer' ? 'bills' : 'purchases' }}</div>
            <table class="lk-table">
              <thead><tr><th>No.</th><th>Date</th><th class="lk-r">Total</th><th class="lk-r">{{ kind === 'customer' ? 'Balance' : 'Status' }}</th></tr></thead>
              <tbody>
                @for (b of recentDocs(); track $index) {
                  <tr>
                    <td class="lk-mono">{{ b.no }}</td>
                    <td>{{ b.at | date: 'dd-MM-yy' }}</td>
                    <td class="lk-r">{{ fmt(b.total) }}</td>
                    <td class="lk-r" [class.lk-bad]="kind === 'customer' && num(b.tail) > 0">{{ b.tailText }}</td>
                  </tr>
                } @empty { <tr><td colspan="4" class="lk-none">None yet.</td></tr> }
              </tbody>
            </table>

            <div class="lk-h">Usually {{ kind === 'customer' ? 'buys' : 'supplies' }}</div>
            <table class="lk-table">
              <thead><tr><th>Item</th><th class="lk-r">Last rate</th><th>When</th><th class="lk-r">Total qty</th></tr></thead>
              <tbody>
                @for (t of party.topItems || []; track $index) {
                  <tr>
                    <td>{{ t.productName }}</td>
                    <td class="lk-r">₹{{ fmt(t.lastPrice) }}</td>
                    <td>{{ t.lastDate | date: 'dd-MM-yy' }}</td>
                    <td class="lk-r">{{ t.totalQty }}</td>
                  </tr>
                } @empty { <tr><td colspan="4" class="lk-none">No history.</td></tr> }
              </tbody>
            </table>
          }

          @if (p === 'item') {
            @if (loading()) {
              <div class="lk-title">📦 Loading item…</div>
            } @else if (item(); as it) {
              <div class="lk-title">
                📦 {{ it.name }}
                <span class="lk-sub">{{ it.uom || 'pcs' }}{{ it.altUom ? ' · 1 ' + it.altUom + ' = ' + num(it.uomFactor) + ' ' + (it.uom || 'pcs') : '' }}</span>
              </div>
              <div class="lk-stats">
                <div class="lk-stat" [class.lk-bad]="num(it.stock) <= num(it.minStock)">
                  <span>Stock</span><b>{{ num(it.stock) }} {{ it.uom || 'pcs' }}</b>
                </div>
                @if (it.altUom && num(it.uomFactor) > 0) {
                  <div class="lk-stat"><span>In {{ it.altUom }}</span><b>{{ fmt(num(it.stock) / num(it.uomFactor)) }}</b></div>
                }
                <div class="lk-stat"><span>Min stock</span><b>{{ num(it.minStock) }}</b></div>
                <div class="lk-stat"><span>HSN</span><b>{{ it.hsnCode || '—' }}</b></div>
                <div class="lk-stat"><span>GST</span><b>{{ num(it.gstRate) }}%</b></div>
                <div class="lk-stat"><span>Purchase rate</span><b>{{ it.purchasePrice ? '₹' + fmt(it.purchasePrice) : '—' }}</b></div>
                <div class="lk-stat"><span>Sale rate</span><b>₹{{ fmt(it.salePrice ?? it.basePrice) }}</b></div>
                <div class="lk-stat"><span>MRP</span><b>{{ it.mrp ? '₹' + fmt(it.mrp) : '—' }}</b></div>
                @if (it.levelPrice) {
                  <div class="lk-stat lk-good"><span>{{ it.levelPrice.levelName }} rate</span><b>₹{{ fmt(it.levelPrice.price) }}</b></div>
                }
              </div>

              <div class="lk-h">Rate memory</div>
              <table class="lk-table">
                <tbody>
                  @if (kind === 'customer') {
                    <tr><td>Last to {{ party?.name || 'this party' }}</td>
                        <td class="lk-r">{{ it.lastToCustomer ? '₹' + fmt(it.lastToCustomer.price) : '—' }}</td>
                        <td>{{ it.lastToCustomer ? (it.lastToCustomer.at | date: 'dd-MM-yy') : '' }}</td></tr>
                    <tr><td>Last overall sale</td>
                        <td class="lk-r">{{ it.lastOverall ? '₹' + fmt(it.lastOverall.price) : '—' }}</td>
                        <td>{{ it.lastOverall ? (it.lastOverall.at | date: 'dd-MM-yy') : '' }}</td></tr>
                  } @else {
                    <tr><td>Last from {{ party?.name || 'this supplier' }}</td>
                        <td class="lk-r">{{ it.lastFromSupplier ? '₹' + fmt(it.lastFromSupplier.price) : '—' }}</td>
                        <td>{{ it.lastFromSupplier ? (it.lastFromSupplier.at | date: 'dd-MM-yy') : '' }}</td></tr>
                    <tr><td>Last overall purchase</td>
                        <td class="lk-r">{{ it.lastOverall ? '₹' + fmt(it.lastOverall.price) : '—' }}</td>
                        <td>{{ it.lastOverall ? (it.lastOverall.at | date: 'dd-MM-yy') : '' }}</td></tr>
                  }
                </tbody>
              </table>
            } @else {
              <div class="lk-title">📦 Pick an item on the grid first</div>
            }
          }

          @if (p === 'rates') {
            <div class="lk-title">
              💰 Last rates — {{ rateItemName() }}
              <span class="lk-sub">{{ party ? 'to ' + party.name : 'all parties' }}</span>
            </div>
            @if (loading()) {
              <p class="lk-none">Loading…</p>
            } @else {
              <table class="lk-table">
                <thead><tr><th></th><th>Date</th><th>Doc</th><th class="lk-r">Qty</th><th class="lk-r">Rate</th></tr></thead>
                <tbody>
                  @for (r of rates(); track $index; let i = $index) {
                    <tr (click)="applyRateRow(i)" class="lk-pick" [class.lk-sel]="i === rateIdx()">
                      <td>{{ i === rateIdx() ? '▶' : '' }}</td>
                      <td>{{ r.at | date: 'dd-MM-yy' }}</td>
                      <td class="lk-mono">{{ r.doc }}</td>
                      <td class="lk-r">{{ num(r.qty) }}</td>
                      <td class="lk-r"><b>₹{{ fmt(r.price) }}</b></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="5" class="lk-none">{{ party ? 'Never billed to ' + party.name + ' yet.' : 'No sales of this item yet.' }}</td></tr>
                  }
                </tbody>
              </table>
              @if (rates().length) {
                <p class="lk-hint">↑↓ pick · <b>Enter applies the rate to the line</b></p>
              }
            }
          }

          <div class="lk-foot">Esc close · Alt+P party · Alt+I item · Alt+L last rates</div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .lk-backdrop {
        position: fixed; inset: 0; background: rgba(20, 40, 70, .45); z-index: 600;
        display: flex; align-items: flex-start; justify-content: center; padding-top: 9vh;
      }
      .lk-box {
        background: #fff; border: 1px solid #7da2ce; box-shadow: 4px 6px 18px rgba(0,0,0,.35);
        width: 560px; max-width: 94vw; max-height: 78vh; overflow: auto;
        padding: 12px 14px; font-size: 13px; outline: none;
      }
      .lk-title { font-weight: 700; color: #14456e; font-size: 14px; margin-bottom: 8px; display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
      .lk-sub { font-weight: 400; font-size: 11.5px; color: #777; }
      .lk-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; }
      .lk-stat { border: 1px solid #dfe5ee; background: #f7f9fc; padding: 5px 8px; display: flex; flex-direction: column; gap: 1px; }
      .lk-stat span { font-size: 10.5px; color: #789; text-transform: uppercase; letter-spacing: .3px; }
      .lk-stat b { font-size: 13px; color: #1f2430; }
      .lk-bad b { color: #b91c1c; }
      .lk-good { border-color: #b7e0c5; background: #f2fbf5; }
      .lk-h { font-weight: 600; color: #14456e; font-size: 12px; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: .3px; }
      .lk-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .lk-table th { text-align: left; color: #789; font-weight: 600; font-size: 11px; border-bottom: 1px solid #dfe5ee; padding: 3px 6px; }
      .lk-table td { border-bottom: 1px solid #eef1f6; padding: 3px 6px; }
      .lk-r { text-align: right !important; }
      .lk-mono { font-family: Consolas, monospace; font-size: 11.5px; }
      .lk-none { color: #9aa; text-align: center; padding: 8px !important; }
      .lk-pick { cursor: pointer; }
      .lk-pick:hover { background: #f2f7fd; }
      .lk-sel { background: #fdf6d8 !important; }
      .lk-sel td { font-weight: 600; }
      .lk-hint { margin: 6px 0 0; font-size: 11.5px; color: #667; }
      .lk-hint b { color: #14456e; }
      .lk-foot { margin-top: 10px; font-size: 11px; color: #889; border-top: 1px solid #eef1f6; padding-top: 6px; }
    `,
  ],
})
export class EntryLookupComponent {
  private readonly entry = inject(EntryService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** 'customer' billing screens vs 'supplier' purchase screens. */
  @Input() kind: 'customer' | 'supplier' = 'customer';
  /** The party context the screen already loaded (CustomerContext | SupplierContext). */
  @Input() party: any | null = null;
  /** The grid rows (need only .productId) — [] on party-only screens like Receipt. */
  @Input() rows: any[] = [];
  /** Fired when the operator picks a historical rate with Enter (Alt+L panel). */
  @Output() applyRate = new EventEmitter<{ row: number; rate: number }>();

  readonly panel = signal<'party' | 'item' | 'rates' | null>(null);
  readonly item = signal<any | null>(null);
  readonly rates = signal<RateHistoryRow[]>([]);
  readonly rateIdx = signal(0);
  readonly loading = signal(false);

  private prevFocus: HTMLElement | null = null;
  private rateRow = -1;
  private rateName = '';

  @HostListener('document:keydown', ['$event'])
  onDocKey(e: KeyboardEvent): void {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'p') { e.preventDefault(); e.stopPropagation(); this.toggleParty(); }
    else if (k === 'i') { e.preventDefault(); e.stopPropagation(); this.toggleItem(); }
    else if (k === 'l') { e.preventDefault(); e.stopPropagation(); this.toggleRates(); }
  }

  onBoxKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    if (this.panel() === 'rates' && this.rates().length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); this.rateIdx.set(Math.min(this.rateIdx() + 1, this.rates().length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); this.rateIdx.set(Math.max(this.rateIdx() - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.applyRateRow(this.rateIdx()); return; }
    }
  }

  private toggleParty(): void {
    if (this.panel() === 'party') { this.close(); return; }
    if (!this.party) return;
    this.openPanel('party');
  }

  private toggleItem(): void {
    if (this.panel() === 'item') { this.close(); return; }
    const pid = this.currentProductId();
    if (!pid) return;
    this.item.set(null);
    this.loading.set(true);
    this.openPanel('item');
    const fetch$: Observable<any> = this.kind === 'supplier'
      ? this.entry.itemPurchaseContext(pid, this.party?.id)
      : this.entry.itemContext(pid, this.party?.id);
    fetch$.subscribe({
      next: (ctx: any) => { this.item.set(ctx); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  /**
   * Alt+L — this party's previous rates for the current line's item. Enter on a
   * row writes that rate back into the grid (Miracle's rate pick).
   */
  private toggleRates(): void {
    if (this.panel() === 'rates') { this.close(); return; }
    const at = this.currentRow();
    if (at === null) return;
    this.rateRow = at;
    this.rateName = this.rows[at]?.name || '';
    this.rates.set([]);
    this.rateIdx.set(0);
    this.loading.set(true);
    this.openPanel('rates');
    const opts = this.kind === 'supplier' ? { supplierId: this.party?.id } : { customerId: this.party?.id };
    this.entry.rateHistory(this.rows[at].productId, opts).subscribe({
      next: (rows) => { this.rates.set(rows || []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  applyRateRow(i: number): void {
    const r = this.rates()[i];
    if (!r || this.rateRow < 0) return;
    this.applyRate.emit({ row: this.rateRow, rate: Number(r.price) || 0 });
    this.close();
  }

  rateItemName(): string { return this.rateName; }

  /** Row index under the cursor (data-cell="N:col"), else the last row holding a product. */
  private currentRow(): number | null {
    const dc = (document.activeElement as HTMLElement | null)?.getAttribute?.('data-cell') || '';
    const m = /^(\d+):/.exec(dc);
    if (m && this.rows[+m[1]]?.productId) return +m[1];
    for (let i = this.rows.length - 1; i >= 0; i--) if (this.rows[i]?.productId) return i;
    return null;
  }

  private currentProductId(): string | undefined {
    const at = this.currentRow();
    return at === null ? undefined : this.rows[at].productId;
  }

  private openPanel(p: 'party' | 'item' | 'rates'): void {
    if (!this.panel()) this.prevFocus = document.activeElement as HTMLElement | null;
    this.panel.set(p);
    setTimeout(() => (this.host.nativeElement.querySelector('[data-lookup-box]') as HTMLElement | null)?.focus());
  }

  close(): void {
    this.panel.set(null);
    const back = this.prevFocus;
    this.prevFocus = null;
    setTimeout(() => { back?.focus(); (back as HTMLInputElement | null)?.select?.(); });
  }

  /** Normalised recent-documents list for the party panel. */
  recentDocs(): Array<{ no: string; at: string; total: number; tail: number; tailText: string }> {
    if (this.kind === 'customer') {
      return (this.party?.recentInvoices || []).map((r: any) => ({
        no: r.invoiceNumber, at: r.issuedAt, total: Number(r.total) || 0,
        tail: Number(r.balanceDue) || 0, tailText: this.fmt(r.balanceDue),
      }));
    }
    return (this.party?.recentOrders || []).map((r: any) => ({
      no: r.supplierInvoiceNo || r.orderNumber, at: r.createdAt, total: Number(r.total) || 0,
      tail: 0, tailText: r.paymentStatus || r.status || '',
    }));
  }

  num(v: unknown): number { return Number(v) || 0; }
  fmt(v: unknown): string { return (Number(v) || 0).toFixed(2); }
}
