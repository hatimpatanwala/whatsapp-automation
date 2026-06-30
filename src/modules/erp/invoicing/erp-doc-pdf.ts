import PDFDocument from 'pdfkit';
import { ErpPdfSettings } from './erp-invoice-pdf';

export interface ErpDocPdfData {
  docTitle: string;             // 'OFFER' | 'PURCHASE ORDER' | 'PAYMENT RECEIPT'
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
 * Generic ERP document PDF (offers, purchase orders, receipts) — same look as the
 * invoice renderer but field-agnostic, so any line-item document can produce a PDF
 * without bespoke layout code. pdfkit, in-memory, returns a Buffer.
 */
export function buildErpDocPdf(d: ErpDocPdfData, s: ErpPdfSettings): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const cur = (s.currency || d.currency) === 'INR' ? 'Rs.' : (s.currency || d.currency || '');
      const money = (n: any) => `${cur} ${Number(n || 0).toFixed(2)}`;
      const items: any[] = Array.isArray(d.items) ? d.items : [];
      const left = 40, right = 555;

      doc.fontSize(16).fillColor('#111').text(s.businessName || 'Your Business', left, 40);
      doc.fontSize(9).fillColor('#555');
      if (s.address) doc.text(s.address, { width: 300 });
      if (s.gstin) doc.text(`GSTIN: ${s.gstin}`);

      doc.fontSize(22).fillColor('#111').text(d.docTitle, 320, 40, { align: 'right', width: right - 320 });
      if (d.statusLabel) doc.fontSize(11).fillColor(d.statusColor || '#555').text(d.statusLabel.toUpperCase(), 320, 68, { align: 'right', width: right - 320 });

      let y = Math.max(doc.y, 110);
      doc.strokeColor('#ddd').moveTo(left, y).lineTo(right, y).stroke();
      y += 12;
      doc.fontSize(9).fillColor('#333');
      doc.text(`No: ${d.number}`, left, y);
      doc.text(`Date: ${new Date(d.date || Date.now()).toLocaleDateString('en-IN')}`, left, y + 14);
      if (d.party) {
        doc.fillColor('#111').text(d.party.label, 320, y);
        doc.fillColor('#333');
        if (d.party.name) doc.text(d.party.name, 320, y + 14);
        if (d.party.phone) doc.text(d.party.phone, 320, y + 28);
      }
      y += 56;

      const cols = [
        { x: left, w: 270, align: 'left' as const },
        { x: 320, w: 50, align: 'right' as const },
        { x: 375, w: 85, align: 'right' as const },
        { x: 465, w: 90, align: 'right' as const },
      ];
      doc.rect(left, y - 3, right - left, 18).fill('#f3f4f6');
      doc.fillColor('#111').fontSize(9);
      ['Item', 'Qty', 'Rate', 'Amount'].forEach((t, i) => doc.text(t, cols[i].x, y, { width: cols[i].w, align: cols[i].align }));
      y += 18;
      doc.fillColor('#333');
      for (const it of items) {
        const qty = Number(it.quantity || 0);
        const rate = Number(it.unitPrice ?? it.unit_price ?? 0);
        const amt = Number(it.lineTotal ?? it.line_total ?? qty * rate);
        doc.text(String(it.description || ''), cols[0].x, y, { width: cols[0].w });
        doc.text(String(qty), cols[1].x, y, { width: cols[1].w, align: 'right' });
        doc.text(money(rate), cols[2].x, y, { width: cols[2].w, align: 'right' });
        doc.text(money(amt), cols[3].x, y, { width: cols[3].w, align: 'right' });
        y += 18;
        if (y > 720) { doc.addPage(); y = 60; }
      }
      doc.strokeColor('#ddd').moveTo(left, y).lineTo(right, y).stroke();
      y += 10;

      const labelX = 360, valX = 465, valW = 90;
      const row = (label: string, val: string, bold = false, color = '#333') => {
        doc.fontSize(bold ? 11 : 9).fillColor(color);
        doc.text(label, labelX, y, { width: 100, align: 'right' });
        doc.text(val, valX, y, { width: valW, align: 'right' });
        y += bold ? 18 : 15;
      };
      if (d.subtotal !== undefined) row('Subtotal', money(d.subtotal));
      if (Number(d.discount) > 0) row('Discount', `- ${money(d.discount)}`);
      if (Number(d.totalTax) > 0) row('Tax', money(d.totalTax));
      row('Total', money(d.total), true, '#111');
      for (const er of d.extraRows || []) row(er.label, er.value);

      if (d.note) {
        y += 14;
        doc.fontSize(9).fillColor('#555').text('Note:', left, y);
        doc.fillColor('#333').text(String(d.note), left, y + 12, { width: 300 });
      }
      doc.moveDown(2);
      doc.fontSize(8).fillColor('#999').text('Generated via WhatsApp Commerce ERP', left, doc.y, { align: 'center', width: right - left });
      doc.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}
