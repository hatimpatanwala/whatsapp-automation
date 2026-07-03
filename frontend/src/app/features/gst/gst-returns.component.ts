import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GstService } from '../../core/services/gst.service';

type Report = 'gstr1' | 'gstr3b' | 'hsn' | 'gstr2b';

@Component({
  selector: 'wa-gst-returns',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="p-4 md:p-6">
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <h1 class="text-xl font-semibold">GST Returns</h1>
        <input type="month" [(ngModel)]="month" (ngModelChange)="load()" class="border rounded px-2 py-1.5 text-sm" />
        <div class="flex gap-1 ml-auto">
          @for (t of tabs; track t.key) {
            <button (click)="select(t.key)"
                    class="px-3 py-1.5 rounded-md text-sm"
                    [class.bg-slate-800]="report() === t.key" [class.text-white]="report() === t.key"
                    [class.bg-slate-100]="report() !== t.key">{{ t.label }}</button>
          }
        </div>
        <button (click)="downloadJson()" class="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm">
          Download GSTR-1 JSON
        </button>
      </div>

      @if (loading()) {
        <p class="text-slate-500">Loading…</p>
      } @else if (!data()) {
        <p class="text-slate-500">No data.</p>
      } @else {
        @switch (report()) {
          @case ('gstr1') {
            <h2 class="font-semibold mb-2">B2B (registered)</h2>
            <div class="border rounded-lg overflow-x-auto mb-6">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-600"><tr>
                  <th class="text-left p-2">Invoice</th><th class="text-left p-2">GSTIN</th><th class="text-right p-2">Rate%</th>
                  <th class="text-right p-2">Taxable</th><th class="text-right p-2">IGST</th><th class="text-right p-2">CGST</th><th class="text-right p-2">SGST</th>
                </tr></thead>
                <tbody>
                  @for (r of data().b2b; track r.invoiceNumber) {
                    <tr class="border-t"><td class="p-2 font-mono">{{ r.invoiceNumber }}</td><td class="p-2">{{ r.gstin }}</td>
                      <td class="p-2 text-right">{{ r.rate }}</td><td class="p-2 text-right">{{ fmt(r.taxableValue) }}</td>
                      <td class="p-2 text-right">{{ fmt(r.igst) }}</td><td class="p-2 text-right">{{ fmt(r.cgst) }}</td><td class="p-2 text-right">{{ fmt(r.sgst) }}</td></tr>
                  } @empty { <tr><td colspan="7" class="p-3 text-slate-500">No B2B invoices.</td></tr> }
                </tbody>
              </table>
            </div>
            <h2 class="font-semibold mb-2">B2C (summary)</h2>
            <div class="border rounded-lg overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-600"><tr>
                  <th class="text-left p-2">Place of supply</th><th class="text-right p-2">Rate%</th>
                  <th class="text-right p-2">Taxable</th><th class="text-right p-2">IGST</th><th class="text-right p-2">CGST</th><th class="text-right p-2">SGST</th>
                </tr></thead>
                <tbody>
                  @for (r of data().b2cs; track $index) {
                    <tr class="border-t"><td class="p-2">{{ r.placeOfSupply || '—' }}</td><td class="p-2 text-right">{{ r.rate }}</td>
                      <td class="p-2 text-right">{{ fmt(r.taxableValue) }}</td><td class="p-2 text-right">{{ fmt(r.igst) }}</td>
                      <td class="p-2 text-right">{{ fmt(r.cgst) }}</td><td class="p-2 text-right">{{ fmt(r.sgst) }}</td></tr>
                  } @empty { <tr><td colspan="6" class="p-3 text-slate-500">No B2C invoices.</td></tr> }
                </tbody>
              </table>
            </div>
          }
          @case ('gstr3b') {
            <div class="border rounded-lg max-w-xl">
              <div class="bg-slate-50 p-2 font-semibold">3.1(a) Outward taxable supplies</div>
              <table class="w-full text-sm">
                <tbody>
                  <tr class="border-t"><td class="p-2">Taxable value</td><td class="p-2 text-right">{{ fmt(data().outwardTaxableSupplies.taxableValue) }}</td></tr>
                  <tr class="border-t"><td class="p-2">IGST</td><td class="p-2 text-right">{{ fmt(data().outwardTaxableSupplies.igst) }}</td></tr>
                  <tr class="border-t"><td class="p-2">CGST</td><td class="p-2 text-right">{{ fmt(data().outwardTaxableSupplies.cgst) }}</td></tr>
                  <tr class="border-t"><td class="p-2">SGST</td><td class="p-2 text-right">{{ fmt(data().outwardTaxableSupplies.sgst) }}</td></tr>
                  <tr class="border-t font-semibold"><td class="p-2">Total invoice value ({{ data().invoiceCount }} invoices)</td><td class="p-2 text-right">{{ fmt(data().totalInvoiceValue) }}</td></tr>
                </tbody>
              </table>
            </div>
          }
          @case ('hsn') {
            <div class="border rounded-lg overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-600"><tr>
                  <th class="text-left p-2">HSN</th><th class="text-right p-2">Rate%</th><th class="text-right p-2">Qty</th>
                  <th class="text-right p-2">Taxable</th><th class="text-right p-2">IGST</th><th class="text-right p-2">CGST</th><th class="text-right p-2">SGST</th>
                </tr></thead>
                <tbody>
                  @for (r of data().rows; track $index) {
                    <tr class="border-t"><td class="p-2">{{ r.hsn }}</td><td class="p-2 text-right">{{ r.rate }}</td><td class="p-2 text-right">{{ r.quantity }}</td>
                      <td class="p-2 text-right">{{ fmt(r.taxableValue) }}</td><td class="p-2 text-right">{{ fmt(r.igst) }}</td>
                      <td class="p-2 text-right">{{ fmt(r.cgst) }}</td><td class="p-2 text-right">{{ fmt(r.sgst) }}</td></tr>
                  } @empty { <tr><td colspan="7" class="p-3 text-slate-500">No line items.</td></tr> }
                </tbody>
              </table>
            </div>
          }
          @case ('gstr2b') {
            <div class="mb-4 flex items-center gap-3 text-sm">
              <label class="font-medium">Import GSTR-2B JSON (from the GST portal):</label>
              <input type="file" accept="application/json" (change)="importFile($event)" />
            </div>
            @if (error()) { <p class="text-red-600 text-sm mb-3">{{ error() }}</p> }
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 max-w-3xl">
              <div class="border rounded-lg p-3"><div class="text-slate-500 text-xs">ITC as per 2B</div><div class="text-lg font-semibold">{{ fmt(data().summary.itcAsPer2b) }}</div></div>
              <div class="border rounded-lg p-3"><div class="text-slate-500 text-xs">ITC in books</div><div class="text-lg font-semibold">{{ fmt(data().summary.itcInBooks) }}</div></div>
              <div class="border rounded-lg p-3"><div class="text-slate-500 text-xs">Matched</div><div class="text-lg font-semibold text-green-600">{{ data().summary.matchedCount }}</div></div>
              <div class="border rounded-lg p-3"><div class="text-slate-500 text-xs">Mismatch / Missing</div><div class="text-lg font-semibold text-amber-600">{{ data().summary.mismatchCount + data().summary.onlyInPortalCount + data().summary.onlyInBooksCount }}</div></div>
            </div>

            <h2 class="font-semibold mb-2">In 2B but not in books ({{ data().onlyInPortal.length }})</h2>
            <div class="border rounded-lg overflow-x-auto mb-5">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-600"><tr>
                  <th class="text-left p-2">Supplier GSTIN</th><th class="text-left p-2">Invoice</th><th class="text-right p-2">Taxable</th><th class="text-right p-2">Tax</th>
                </tr></thead>
                <tbody>
                  @for (r of data().onlyInPortal; track $index) {
                    <tr class="border-t"><td class="p-2">{{ r.supplierGstin }}</td><td class="p-2">{{ r.invoiceNumber }}</td>
                      <td class="p-2 text-right">{{ fmt(r.taxableValue) }}</td><td class="p-2 text-right">{{ fmt(r.totalTax) }}</td></tr>
                  } @empty { <tr><td colspan="4" class="p-3 text-slate-500">Nothing — every 2B invoice is in your books.</td></tr> }
                </tbody>
              </table>
            </div>

            <h2 class="font-semibold mb-2">In books but not in 2B ({{ data().onlyInBooks.length }})</h2>
            <div class="border rounded-lg overflow-x-auto mb-5">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-600"><tr>
                  <th class="text-left p-2">Supplier</th><th class="text-left p-2">Doc</th><th class="text-right p-2">Total</th><th class="text-right p-2">Tax</th>
                </tr></thead>
                <tbody>
                  @for (r of data().onlyInBooks; track $index) {
                    <tr class="border-t"><td class="p-2">{{ r.supplierName || r.gstin }}</td><td class="p-2">{{ r.docNumber }}</td>
                      <td class="p-2 text-right">{{ fmt(r.total) }}</td><td class="p-2 text-right">{{ fmt(r.tax) }}</td></tr>
                  } @empty { <tr><td colspan="4" class="p-3 text-slate-500">Nothing pending.</td></tr> }
                </tbody>
              </table>
            </div>

            @if (data().mismatch.length) {
              <h2 class="font-semibold mb-2">Tax mismatches ({{ data().mismatch.length }})</h2>
              <div class="border rounded-lg overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="bg-slate-50 text-slate-600"><tr>
                    <th class="text-left p-2">Supplier GSTIN</th><th class="text-right p-2">Tax in 2B</th><th class="text-right p-2">Tax in books</th><th class="text-right p-2">Diff</th>
                  </tr></thead>
                  <tbody>
                    @for (r of data().mismatch; track $index) {
                      <tr class="border-t"><td class="p-2">{{ r.portal.supplierGstin }}</td><td class="p-2 text-right">{{ fmt(r.portal.totalTax) }}</td>
                        <td class="p-2 text-right">{{ fmt(r.book.tax) }}</td><td class="p-2 text-right" [class.text-red-600]="r.taxDiff !== 0">{{ fmt(r.taxDiff) }}</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        }
      }
    </div>
  `,
})
export class GstReturnsComponent {
  private readonly gst = inject(GstService);
  readonly report = signal<Report>('gstr1');
  readonly data = signal<any>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly tabs: Array<{ key: Report; label: string }> = [
    { key: 'gstr1', label: 'GSTR-1' },
    { key: 'gstr3b', label: 'GSTR-3B' },
    { key: 'gstr2b', label: 'GSTR-2B' },
    { key: 'hsn', label: 'HSN Summary' },
  ];
  month = new Date().toISOString().slice(0, 7);

  constructor() { this.load(); }

  select(r: Report): void { this.report.set(r); this.load(); }
  fmt(n: unknown): string { return Number(n || 0).toFixed(2); }

  load(): void {
    this.loading.set(true);
    const done = { next: (d: any) => { this.data.set(d); this.loading.set(false); }, error: () => this.loading.set(false) };
    switch (this.report()) {
      case 'gstr3b': this.gst.gstr3b(this.month).subscribe(done); break;
      case 'hsn': this.gst.hsnSummary(this.month).subscribe(done); break;
      case 'gstr2b': this.gst.reconcile2b(this.month).subscribe(done); break;
      default: this.gst.gstr1(this.month).subscribe(done);
    }
  }

  /** Upload a GSTR-2B JSON downloaded from the portal, then re-reconcile. */
  importFile(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    file.text().then((txt) => {
      let json: any;
      try { json = JSON.parse(txt); } catch { this.error.set('Invalid JSON file'); return; }
      this.loading.set(true);
      this.gst.import2b(this.month, json).subscribe({
        next: () => this.load(),
        error: () => this.loading.set(false),
      });
    });
  }

  downloadJson(): void {
    this.gst.gstr1Json(this.month, '').subscribe((json) => {
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GSTR1-${this.month}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}
