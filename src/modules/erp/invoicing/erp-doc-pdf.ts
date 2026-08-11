import PDFDocument from 'pdfkit';
import { ErpPdfSettings } from './erp-invoice-pdf';
import { DEFAULT_TEMPLATE_CONFIG } from '../templates/document-template.types';
import { fonts, drawHeader, drawTitle, tableHeaderFill, drawBlocks } from '../templates/pdf-template';

export interface ErpDocPdfData {
  docTitle: string;             // 'OFFER' | 'PURCHASE ORDER' | 'PAYMENT RECEIPT' | 'QUOTATION' | …
  number: string;
  date?: string | Date;
  party?: { label: string; name?: string; phone?: string };
  items: any[];                 // {description, quantity, unitPrice|unit_price, lineTotal|line_total}
  subtotal?: any;
  discount?: any;
  totalTax?: any;
  total: any;
  currency?: string;
  statusLabel?: string;
  statusColor?: string;
  extraRows?: { label: string; value: string }[]; // e.g. Paid / Balance
  note?: string;
}

/**
 * Generic ERP document PDF (offers, purchase orders, receipts, quotations, notes) — same
 * look as the invoice renderer but field-agnostic, and driven by the tenant's document
 * template (logo, colours, font, item columns, text blocks). pdfkit, returns a Buffer.
 */
export function buildErpDocPdf(d: ErpDocPdfData, s: ErpPdfSettings): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const cfg = s.template || DEFAULT_TEMPLATE_CONFIG;
      const f = fonts(cfg);
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const cur = (s.currency || d.currency) === 'INR' ? 'Rs.' : (s.currency || d.currency || '');
      const money = (n: any) => `${cur} ${Number(n || 0).toFixed(2)}`;
      const items: any[] = Array.isArray(d.items) ? d.items : [];
      const left = 40, right = 555;

      const headerBottom = drawHeader(doc, cfg, s, left, right);
      drawTitle(doc, cfg, d.docTitle, d.statusLabel ? d.statusLabel.toUpperCase() : null, right);

      let y = Math.max(headerBottom, 108) + 6;
      doc.strokeColor(cfg.accentColor).lineWidth(1).moveTo(left, y).lineTo(right, y).stroke();
      y += 12;
      doc.font(f.normal).fontSize(9).fillColor('#333');
      doc.text(`No: ${d.number}`, left, y);
      doc.text(`Date: ${new Date(d.date || Date.now()).toLocaleDateString('en-IN')}`, left, y + 14);
      if (d.party) {
        doc.font(f.bold).fillColor(cfg.textColor).text(d.party.label, 320, y);
        doc.font(f.normal).fillColor('#333');
        if (d.party.name) doc.text(d.party.name, 320, y + 14);
        if (d.party.phone) doc.text(d.party.phone, 320, y + 28);
      }
      y += 56;

      // Column set honours the template's HSN/qty/rate/amount toggles (Item always shown).
      const c = cfg.columns;
      const spec: Array<{ t: string; w: number; align: 'left' | 'right'; get: (it: any) => string }> = [];
      spec.push({ t: 'Item', w: 0, align: 'left', get: (it) => String(it.description || '') });
      if (c.hsn) spec.push({ t: 'HSN', w: 52, align: 'left', get: (it) => String(it.hsn || it.hsnCode || '') });
      if (c.qty) spec.push({ t: 'Qty', w: 45, align: 'right', get: (it) => String(Number(it.quantity || 0)) });
      if (c.rate) spec.push({ t: 'Rate', w: 82, align: 'right', get: (it) => money(it.unitPrice ?? it.unit_price ?? 0) });
      if (c.amount) spec.push({ t: 'Amount', w: 88, align: 'right', get: (it) => money(it.lineTotal ?? it.line_total ?? Number(it.quantity || 0) * Number(it.unitPrice ?? it.unit_price ?? 0)) });
      const fixed = spec.reduce((sum, sp) => sum + sp.w, 0);
      let cx = left;
      const cols = spec.map((sp) => { const w = sp.t === 'Item' ? Math.max(150, right - left - fixed) : sp.w; const col = { ...sp, x: cx, w }; cx += w; return col; });

      tableHeaderFill(doc, cfg, left, right - left, y);
      doc.font(f.bold).fillColor('#ffffff').fontSize(9);
      cols.forEach((col) => doc.text(col.t, col.x, y, { width: col.w, align: col.align }));
      y += 18;
      doc.font(f.normal).fillColor('#333');
      for (const it of items) {
        cols.forEach((col) => doc.text(col.get(it), col.x, y, { width: col.w, align: col.align }));
        y += 18;
        if (y > 700) { doc.addPage(); y = 60; }
      }
      doc.strokeColor('#ddd').lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke();
      y += 10;

      const labelX = 360, valX = 465, valW = 90;
      const row = (label: string, val: string, bold = false, color = '#333') => {
        doc.font(bold ? f.bold : f.normal).fontSize(bold ? 11 : 9).fillColor(color);
        doc.text(label, labelX, y, { width: 100, align: 'right' });
        doc.text(val, valX, y, { width: valW, align: 'right' });
        y += bold ? 18 : 15;
      };
      if (d.subtotal !== undefined) row('Subtotal', money(d.subtotal));
      if (cfg.totals.showDiscount && Number(d.discount) > 0) row('Discount', `- ${money(d.discount)}`);
      if (cfg.totals.showTaxBreakup && Number(d.totalTax) > 0) row('Tax', money(d.totalTax));
      row('Total', money(d.total), true, cfg.accentColor);
      for (const er of d.extraRows || []) row(er.label, er.value);

      if (d.note) {
        y += 14;
        doc.font(f.bold).fontSize(8.5).fillColor(cfg.accentColor).text('Note', left, y);
        doc.font(f.normal).fillColor('#333').text(String(d.note), left, doc.y + 1, { width: 320 });
        y = doc.y;
      }
      drawBlocks(doc, cfg, left, right, y);
      doc.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}
