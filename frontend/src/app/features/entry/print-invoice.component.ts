import { Component, HostListener, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { EntryService } from '../../core/services/entry.service';

/** Indian-numbering amount in words (₹ lakh/crore). */
function amountInWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number): string => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ' ' + ones[x % 10] : ''}`);
  const three = (x: number): string => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x));
  if (!n || n <= 0) return 'Zero';
  const whole = Math.floor(n);
  const paise = Math.round((n - whole) * 100);
  let x = whole;
  const parts: string[] = [];
  const crore = Math.floor(x / 10000000); x %= 10000000;
  const lakh = Math.floor(x / 100000); x %= 100000;
  const thousand = Math.floor(x / 1000); x %= 1000;
  if (crore) parts.push(`${two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (x) parts.push(three(x));
  let words = `Rupees ${parts.join(' ') || 'Zero'}`;
  if (paise) words += ` and ${two(paise)} Paise`;
  return `${words} Only`;
}

/**
 * GST Tax Invoice print format — the paper a distributor hands over. Renders the full
 * Miracle layout (seller block, Bill To / Ship To, HSN item table with Free/D1/D2, tax
 * summary, round-off, amount in words, transport/broker, signature block). PgUp/PgDn
 * browses older/newer invoices; Ctrl+P / the button prints. `?print=1` auto-prints.
 */
@Component({
  selector: 'wa-print-invoice',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (inv(); as v) {
      <div class="pi-actions">
        <button (click)="back()">← Back (Esc)</button>
        <button (click)="nav(1)">◂ Older (PgDn)</button>
        <button (click)="nav(-1)">Newer (PgUp) ▸</button>
        <button class="pi-print" (click)="print()">🖨 Print (Ctrl+P)</button>
      </div>

      <div class="pi-page">
        <div class="pi-title">{{ v.isCash ? 'CASH MEMO / TAX INVOICE' : 'TAX INVOICE' }}</div>

        <!-- Seller -->
        <div class="pi-head">
          <div class="pi-seller">
            <div class="pi-seller-name">{{ seller()?.legalName || 'Seller' }}</div>
            <div>{{ seller()?.address }}</div>
            <div>{{ seller()?.city }} {{ seller()?.state }} {{ seller()?.pin }}</div>
            <div><b>GSTIN:</b> {{ seller()?.gstin || '—' }}</div>
          </div>
          <div class="pi-meta">
            <div><b>Invoice No:</b> {{ v.invoiceNumber }}</div>
            <div><b>Date:</b> {{ v.issuedAt | date: 'dd-MM-yyyy' }}</div>
            @if (v.dueDate) { <div><b>Due:</b> {{ v.dueDate | date: 'dd-MM-yyyy' }}</div> }
            @if (v.placeOfSupply) { <div><b>Place of Supply:</b> {{ v.placeOfSupply }}</div> }
            @if (v.irn) { <div class="pi-small"><b>IRN:</b> {{ v.irn }}</div> }
          </div>
        </div>

        <!-- Bill To / Ship To -->
        <div class="pi-addr">
          <div>
            <div class="pi-addr-h">Bill To</div>
            <div><b>{{ v.billTo?.name || v.customerName || (v.isCash ? 'Cash' : '') }}</b></div>
            <div>{{ v.billTo?.address }}</div>
            <div>{{ v.billTo?.city }} {{ v.billTo?.pincode }}</div>
            @if (v.billTo?.gstin || v.buyerGstin) { <div><b>GSTIN:</b> {{ v.billTo?.gstin || v.buyerGstin }}</div> }
            @if (v.customerPhone) { <div>{{ v.customerPhone }}</div> }
          </div>
          <div>
            <div class="pi-addr-h">Ship To</div>
            <div><b>{{ v.shipTo?.name || v.billTo?.name || v.customerName || '' }}</b></div>
            <div>{{ v.shipTo?.address || v.billTo?.address }}</div>
            <div>{{ v.shipTo?.city || v.billTo?.city }} {{ v.shipTo?.pincode || v.billTo?.pincode }}</div>
            @if (v.transport?.name || v.transport?.lrNo || v.transport?.vehicleNo) {
              <div class="pi-small">Transport: {{ v.transport?.name }} · LR {{ v.transport?.lrNo }} · {{ v.transport?.vehicleNo }}</div>
            }
            @if (v.broker) { <div class="pi-small">Broker: {{ v.broker }}</div> }
          </div>
        </div>

        <!-- Items -->
        <table class="pi-items">
          <thead>
            <tr>
              <th>#</th><th class="l">Item</th><th>HSN</th><th>Qty</th><th>Free</th>
              <th>Rate</th><th>D1%</th><th>D2%</th><th>Taxable</th><th>GST%</th><th>Amount</th>
            </tr>
          </thead>
          <tbody>
            @for (it of items(); track $index; let i = $index) {
              <tr>
                <td>{{ i + 1 }}</td>
                <td class="l">{{ it.description }}</td>
                <td>{{ it.hsn }}</td>
                <td>{{ it.quantity }}</td>
                <td>{{ it.freeQty || '' }}</td>
                <td class="r">{{ fmt(it.mrpRate || it.unitPrice) }}</td>
                <td>{{ it.d1 || '' }}</td>
                <td>{{ it.d2 || '' }}</td>
                <td class="r">{{ fmt(it.lineTotal) }}</td>
                <td>{{ it.gstRate || 0 }}</td>
                <td class="r">{{ fmt(lineWithTax(it)) }}</td>
              </tr>
            }
            @for (c of charges(); track $index) {
              <tr>
                <td></td><td class="l"><i>{{ c.label }}</i></td><td></td><td></td><td></td>
                <td></td><td></td><td></td>
                <td class="r">{{ fmt(c.amount) }}</td><td>{{ c.gstRate || 0 }}</td>
                <td class="r">{{ fmt(c.amount * (1 + (c.gstRate || 0) / 100)) }}</td>
              </tr>
            }
          </tbody>
        </table>

        <!-- Totals -->
        <div class="pi-bottom">
          <div class="pi-words">
            <div><b>Amount in words:</b></div>
            <div>{{ words() }}</div>
            @if (v.note) { <div class="pi-small pi-mt"><b>Narration:</b> {{ v.note }}</div> }
          </div>
          <table class="pi-totals">
            <tr><td>Taxable Value</td><td class="r">{{ fmt(v.taxableValue) }}</td></tr>
            @if (v.isInterstate) {
              <tr><td>IGST</td><td class="r">{{ fmt(v.igst) }}</td></tr>
            } @else {
              <tr><td>CGST</td><td class="r">{{ fmt(v.cgst) }}</td></tr>
              <tr><td>SGST</td><td class="r">{{ fmt(v.sgst) }}</td></tr>
            }
            @if (num(v.discount)) { <tr><td>Bill Discount</td><td class="r">− {{ fmt(v.discount) }}</td></tr> }
            <tr><td>Round Off</td><td class="r">{{ fmt(v.roundOff) }}</td></tr>
            <tr class="pi-grand"><td>TOTAL</td><td class="r">₹{{ fmt(v.total) }}</td></tr>
            <tr><td>Paid</td><td class="r">{{ fmt(v.amountPaid) }}</td></tr>
            <tr><td>Balance</td><td class="r">{{ fmt(v.balanceDue) }}</td></tr>
          </table>
        </div>

        <div class="pi-sign">
          <div>Receiver's signature</div>
          <div>For <b>{{ seller()?.legalName || 'Seller' }}</b><br /><br />Authorised signatory</div>
        </div>
      </div>
    } @else {
      <p class="pi-loading">Loading invoice…</p>
    }
  `,
  styles: [
    `
      :host { display: block; background: #eee; min-height: 100vh; font-family: 'Segoe UI', sans-serif; }
      .pi-actions { display: flex; gap: 8px; padding: 10px 14px; }
      .pi-actions button { padding: 6px 14px; border: 1px solid #999; background: #fff; cursor: pointer; border-radius: 3px; font-size: 13px; }
      .pi-print { background: #1d5c8f !important; color: #fff; border-color: #14456e !important; }
      .pi-loading { padding: 40px; text-align: center; color: #666; }

      .pi-page {
        width: 210mm; min-height: 240mm; margin: 0 auto 20px; background: #fff; color: #111;
        padding: 10mm 12mm; box-shadow: 0 2px 12px rgba(0,0,0,.25); font-size: 12.5px;
      }
      .pi-title { text-align: center; font-weight: 700; letter-spacing: 2px; border: 1.5px solid #111; padding: 4px; margin-bottom: 8px; }
      .pi-head { display: flex; justify-content: space-between; gap: 12px; border: 1px solid #111; padding: 8px; }
      .pi-seller-name { font-size: 16px; font-weight: 700; }
      .pi-meta { text-align: right; min-width: 60mm; }
      .pi-small { font-size: 11px; color: #333; }
      .pi-mt { margin-top: 6px; }

      .pi-addr { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #111; border-top: 0; }
      .pi-addr > div { padding: 6px 8px; }
      .pi-addr > div:first-child { border-right: 1px solid #111; }
      .pi-addr-h { font-weight: 700; border-bottom: 1px solid #999; margin-bottom: 3px; }

      .pi-items { width: 100%; border-collapse: collapse; margin-top: 8px; }
      .pi-items th, .pi-items td { border: 1px solid #111; padding: 3px 6px; text-align: center; }
      .pi-items th { background: #f0f0f0; }
      .pi-items .l { text-align: left; }
      .pi-items .r { text-align: right; }

      .pi-bottom { display: flex; gap: 12px; margin-top: 8px; align-items: stretch; }
      .pi-words { flex: 1; border: 1px solid #111; padding: 8px; }
      .pi-totals { border-collapse: collapse; min-width: 70mm; }
      .pi-totals td { border: 1px solid #111; padding: 3px 8px; }
      .pi-totals .r { text-align: right; }
      .pi-grand td { font-weight: 700; font-size: 14px; background: #f0f0f0; }

      .pi-sign { display: flex; justify-content: space-between; margin-top: 18mm; padding-top: 4px; font-size: 12px; }
      .pi-sign > div { border-top: 1px solid #111; padding: 4px 12px 0; text-align: center; }

      @media print {
        .pi-actions { display: none; }
        :host { background: #fff; }
        .pi-page { box-shadow: none; margin: 0; width: auto; min-height: auto; padding: 4mm; }
      }
    `,
  ],
})
export class PrintInvoiceComponent {
  private readonly entry = inject(EntryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly inv = signal<any>(null);
  readonly seller = signal<any>(null);
  private list: string[] = [];

  constructor() {
    this.entry.sellerProfile().subscribe((s) => this.seller.set(s));
    this.entry.invoices(100).subscribe((res: any) => {
      this.list = ((res?.data ?? []) as any[]).map((x) => x.id);
    });
    this.route.paramMap.subscribe((p) => {
      const id = p.get('id');
      if (id) this.load(id);
    });
  }

  private load(id: string): void {
    this.entry.invoice(id).subscribe((v) => {
      this.inv.set(v);
      if (this.route.snapshot.queryParamMap.get('print') === '1') {
        setTimeout(() => window.print(), 600);
      }
    });
  }

  items(): any[] { return Array.isArray(this.inv()?.items) ? this.inv().items : []; }
  charges(): any[] { return Array.isArray(this.inv()?.charges) ? this.inv().charges : []; }
  num(v: unknown): number { return Number(v) || 0; }
  fmt(n: unknown): string { return (Number(n) || 0).toFixed(2); }
  lineWithTax(it: any): number {
    const base = Number(it.lineTotal) || 0;
    return base * (1 + (Number(it.gstRate) || 0) / 100);
  }
  words(): string { return amountInWords(Number(this.inv()?.total) || 0); }

  print(): void { window.print(); }
  back(): void { void this.router.navigate(['/entry/sales']); }

  /** PgUp = newer (dir −1), PgDn = older (dir +1) within the recent-invoice list. */
  nav(dir: number): void {
    const id = this.inv()?.id;
    const i = this.list.indexOf(id);
    if (i < 0) return;
    const next = this.list[i + dir];
    if (next) void this.router.navigate(['/print/invoice', next]);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.key === 'PageUp') { e.preventDefault(); this.nav(-1); }
    if (e.key === 'PageDown') { e.preventDefault(); this.nav(1); }
    if (e.key === 'Escape') { e.preventDefault(); this.back(); }
  }
}
