import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ApiService } from './api.service';

export interface PdfColumn {
  header: string;
  key: string;
  align?: 'left' | 'right' | 'center';
  /** Optional value formatter (e.g. currency). */
  fmt?: (v: any, row: any) => string;
}

export interface PdfReportOptions {
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: any[];
  /** Summary lines rendered under the table (e.g. totals). */
  summary?: { label: string; value: string }[];
  filename?: string;
  orientation?: 'portrait' | 'landscape';
}

/**
 * One client-side PDF exporter for every tabular report across the portal and
 * the ERP — registers, accounting reports (incl. P&L), GST, orders. Draws a
 * business header (name/GSTIN/address, fetched once from the seller profile),
 * the report title + period, an auto-paginated table, and optional totals.
 */
@Injectable({ providedIn: 'root' })
export class PdfExportService {
  private readonly api = inject(ApiService);
  private seller: any = null;
  private sellerLoaded = false;

  private async loadSeller(): Promise<any> {
    if (this.sellerLoaded) return this.seller;
    this.sellerLoaded = true;
    try { this.seller = await firstValueFrom(this.api.get<any>('/gst/seller-profile')); } catch { this.seller = null; }
    return this.seller;
  }

  /** Money formatter shared by report columns. */
  money(n: any): string {
    return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async exportTable(opts: PdfReportOptions): Promise<void> {
    const seller = await this.loadSeller();
    const doc = new jsPDF({ orientation: opts.orientation || 'portrait', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 40;
    let y = 44;

    // ── Business header ──
    const name = seller?.legalName || seller?.legal_name || seller?.businessName || seller?.name || 'Business';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20);
    doc.text(String(name), marginX, y);
    y += 15;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
    const sub: string[] = [];
    const addr = seller?.address || seller?.invoiceAddress; if (addr) sub.push(String(addr));
    const gstin = seller?.gstin || seller?.invoiceGstin; if (gstin) sub.push('GSTIN: ' + gstin);
    if (sub.length) { doc.text(sub.join('   '), marginX, y); y += 13; }

    // ── Report title ──
    doc.setDrawColor(210); doc.line(marginX, y, pageW - marginX, y); y += 18;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30);
    doc.text(opts.title, marginX, y); y += 15;
    if (opts.subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(110); doc.text(opts.subtitle, marginX, y); y += 6; }
    const stamp = new Date().toLocaleString('en-IN');
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text('Generated ' + stamp, pageW - marginX, 44, { align: 'right' });

    // ── Table ──
    const head = [opts.columns.map((c) => c.header)];
    const body = opts.rows.map((r) => opts.columns.map((c) => {
      const v = r[c.key];
      return c.fmt ? c.fmt(v, r) : (v == null ? '' : String(v));
    }));
    autoTable(doc, {
      head, body, startY: y + 6, margin: { left: marginX, right: marginX },
      styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 92, 143], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: Object.fromEntries(opts.columns.map((c, i) => [i, { halign: c.align || 'left' }])),
    });

    // ── Summary ──
    if (opts.summary?.length) {
      let sy = (doc as any).lastAutoTable.finalY + 18;
      for (const s of opts.summary) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30);
        doc.text(s.label, pageW - marginX - 160, sy);
        doc.text(s.value, pageW - marginX, sy, { align: 'right' });
        sy += 15;
      }
    }

    // ── Footer page numbers ──
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(160);
      doc.text(`Page ${p} of ${pages}`, pageW - marginX, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
    }

    const fname = (opts.filename || opts.title).replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.pdf';
    doc.save(fname);
  }
}
