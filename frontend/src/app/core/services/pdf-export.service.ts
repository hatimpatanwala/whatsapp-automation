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
  /** Tally-style header: centre the business name/title/period (accounting reports). */
  tally?: boolean;
}

/** One side of a Tally-style two-column statement (e.g. Liabilities or Assets). */
export interface TallyStatementSide {
  heading: string;
  rows: { name: string; amount: number; bold?: boolean }[];
  totalLabel?: string;
}

export interface TallyStatementOptions {
  title: string;       // e.g. "Balance Sheet" / "Profit & Loss A/c"
  period?: string;     // e.g. "as at 31-Mar-2027" / "1-Apr-2026 to 31-Mar-2027"
  left: TallyStatementSide;
  right: TallyStatementSide;
  filename?: string;
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

  /** Plain money (no symbol) — Tally columns show the number, symbol in the header. */
  private amt(n: any): string {
    return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Tally-style centred header: business name, address/GSTIN, a boxed report
   * title and the period — the look of a Tally report top. Returns the y to
   * continue drawing from.
   */
  private tallyHeader(doc: jsPDF, pageW: number, marginX: number, seller: any, title: string, period?: string): number {
    let y = 40;
    const cx = pageW / 2;
    const name = seller?.legalName || seller?.legal_name || seller?.businessName || seller?.name || 'Business';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20);
    doc.text(String(name), cx, y, { align: 'center' }); y += 13;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
    const addr = seller?.address || seller?.invoiceAddress; if (addr) { doc.text(String(addr), cx, y, { align: 'center' }); y += 11; }
    const gstin = seller?.gstin || seller?.invoiceGstin; if (gstin) { doc.text('GSTIN: ' + gstin, cx, y, { align: 'center' }); y += 11; }
    y += 4;
    // Boxed title + period (Tally boxes the statement heading).
    doc.setDrawColor(120); doc.setLineWidth(0.6);
    const boxTop = y; const boxH = period ? 30 : 20;
    doc.rect(marginX, boxTop, pageW - 2 * marginX, boxH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20);
    doc.text(title, cx, boxTop + 14, { align: 'center' });
    if (period) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80); doc.text(period, cx, boxTop + 25, { align: 'center' }); }
    doc.setFontSize(7.5); doc.setTextColor(150);
    doc.text('Generated ' + new Date().toLocaleString('en-IN'), pageW - marginX, 30, { align: 'right' });
    return boxTop + boxH + 12;
  }

  /**
   * Tally-style two-column statement (Balance Sheet: Liabilities | Assets;
   * P&L: Expenditure | Income). Each side is a bordered Particulars/Amount
   * table with a bold Total row; the two Totals are drawn equal (the caller
   * balances the sides by placing Net Profit/Loss on the correct side).
   */
  async exportTallyStatement(opts: TallyStatementOptions): Promise<void> {
    const seller = await this.loadSeller();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 36;
    const y0 = this.tallyHeader(doc, pageW, marginX, seller, opts.title, opts.period);
    const gap = 14;
    const colW = (pageW - 2 * marginX - gap) / 2;

    const drawSide = (side: TallyStatementSide, leftX: number): number => {
      const total = side.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const body = side.rows.map((r) => [r.name, this.amt(r.amount)]);
      body.push([{ content: side.totalLabel || 'Total', styles: { fontStyle: 'bold' } } as any,
                  { content: this.amt(total), styles: { fontStyle: 'bold', halign: 'right' } } as any]);
      autoTable(doc, {
        head: [[side.heading, 'Amount']],
        body,
        startY: y0,
        margin: { left: leftX },
        tableWidth: colW,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3, lineColor: [140, 140, 140], lineWidth: 0.4, textColor: 30 },
        headStyles: { fillColor: [230, 233, 238], textColor: 20, fontStyle: 'bold', halign: 'left', lineColor: [140, 140, 140], lineWidth: 0.4 },
        columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right', cellWidth: 90 } },
      });
      return (doc as any).lastAutoTable.finalY;
    };

    const leftEnd = drawSide(opts.left, marginX);
    const rightEnd = drawSide(opts.right, marginX + colW + gap);

    // Footer
    const endY = Math.max(leftEnd, rightEnd);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(150);
    doc.text('This is a computer-generated statement.', marginX, endY + 16);

    const fname = (opts.filename || opts.title).replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.pdf';
    doc.save(fname);
  }

  async exportTable(opts: PdfReportOptions): Promise<void> {
    const seller = await this.loadSeller();
    const doc = new jsPDF({ orientation: opts.orientation || 'portrait', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 40;
    let y: number;

    if (opts.tally) {
      // ── Tally-style centred header (accounting registers) ──
      y = this.tallyHeader(doc, pageW, marginX, seller, opts.title, opts.subtitle);
    } else {
      y = 44;
      // ── Business header (left-aligned) ──
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
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text('Generated ' + new Date().toLocaleString('en-IN'), pageW - marginX, 44, { align: 'right' });
      y += 6;
    }

    // ── Table ──
    const head = [opts.columns.map((c) => c.header)];
    const body = opts.rows.map((r) => opts.columns.map((c) => {
      const v = r[c.key];
      return c.fmt ? c.fmt(v, r) : (v == null ? '' : String(v));
    }));
    autoTable(doc, {
      head, body, startY: y, margin: { left: marginX, right: marginX },
      theme: opts.tally ? 'grid' : 'striped',
      styles: opts.tally
        ? { fontSize: 8.5, cellPadding: 3, overflow: 'linebreak', lineColor: [140, 140, 140], lineWidth: 0.4, textColor: 30 }
        : { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak' },
      headStyles: opts.tally
        ? { fillColor: [230, 233, 238], textColor: 20, fontStyle: 'bold', lineColor: [140, 140, 140], lineWidth: 0.4 }
        : { fillColor: [30, 92, 143], textColor: 255, fontStyle: 'bold' },
      ...(opts.tally ? {} : { alternateRowStyles: { fillColor: [245, 247, 250] } }),
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
