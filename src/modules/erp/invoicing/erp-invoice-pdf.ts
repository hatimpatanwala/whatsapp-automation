import PDFDocument from 'pdfkit';

export interface ErpPdfSettings {
  businessName: string;
  address?: string;
  gstin?: string;
  currency?: string;
}

const STATUS_COLOR: Record<string, string> = {
  paid: '#16a34a',
  partial: '#d97706',
  unpaid: '#dc2626',
};

/**
 * Render an ERP accounts-receivable invoice (the kind created by
 * ErpInvoiceService) to a PDF Buffer using pdfkit — matching the codebase's
 * existing GST invoice renderer (src/modules/whatsapp/invoice-pdf.ts) but laid
 * out for standalone AR invoices: line items, totals, paid/balance and status.
 */
export function buildErpInvoicePdf(inv: any, s: ErpPdfSettings): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const cur = (s.currency || inv.currency) === 'INR' ? 'Rs.' : (s.currency || inv.currency || '');
      const money = (n: any) => `${cur} ${Number(n || 0).toFixed(2)}`;
      const items: any[] = Array.isArray(inv.items) ? inv.items : JSON.parse(inv.items || '[]');
      const left = 40;
      const right = 555;

      // ── Header (business) ──────────────────────────────────────────────
      doc.fontSize(16).fillColor('#111').text(s.businessName || 'Your Business', left, 40);
      doc.fontSize(9).fillColor('#555');
      if (s.address) doc.text(s.address, { width: 300 });
      if (s.gstin) doc.text(`GSTIN: ${s.gstin}`);

      // ── Title + status (right) ─────────────────────────────────────────
      doc.fontSize(22).fillColor('#111').text('INVOICE', 360, 40, { align: 'right', width: right - 360 });
      const statusColor = STATUS_COLOR[inv.payment_status] || '#555';
      doc.fontSize(11).fillColor(statusColor).text(String(inv.payment_status || '').toUpperCase(), 360, 68, { align: 'right', width: right - 360 });

      doc.moveDown(1.2);
      let y = Math.max(doc.y, 110);
      doc.strokeColor('#ddd').moveTo(left, y).lineTo(right, y).stroke();
      y += 12;

      // ── Meta (no / date / bill-to) ─────────────────────────────────────
      doc.fontSize(9).fillColor('#333');
      doc.text(`Invoice No: ${inv.invoice_number}`, left, y);
      doc.text(`Date: ${new Date(inv.issued_at || inv.created_at || Date.now()).toLocaleDateString('en-IN')}`, left, y + 14);
      if (inv.due_date) doc.text(`Due: ${new Date(inv.due_date).toLocaleDateString('en-IN')}`, left, y + 28);
      doc.fillColor('#111').text('Bill To', 320, y);
      doc.fillColor('#333');
      if (inv.customer_name) doc.text(inv.customer_name, 320, y + 14);
      if (inv.customer_phone) doc.text(inv.customer_phone, 320, y + 28);
      y += 56;

      // ── Items table ────────────────────────────────────────────────────
      const cols = [
        { t: 'Item', x: left, w: 270, align: 'left' as const },
        { t: 'Qty', x: 320, w: 50, align: 'right' as const },
        { t: 'Rate', x: 375, w: 85, align: 'right' as const },
        { t: 'Amount', x: 465, w: 90, align: 'right' as const },
      ];
      doc.rect(left, y - 3, right - left, 18).fill('#f3f4f6');
      doc.fillColor('#111').fontSize(9);
      cols.forEach((c) => doc.text(c.t, c.x, y, { width: c.w, align: c.align }));
      y += 18;
      doc.fillColor('#333');
      for (const it of items) {
        const qty = Number(it.quantity || 0);
        const rate = Number(it.unitPrice || 0);
        const amt = Number(it.lineTotal ?? qty * rate);
        doc.text(String(it.description || ''), cols[0].x, y, { width: cols[0].w });
        doc.text(String(qty), cols[1].x, y, { width: cols[1].w, align: 'right' });
        doc.text(money(rate), cols[2].x, y, { width: cols[2].w, align: 'right' });
        doc.text(money(amt), cols[3].x, y, { width: cols[3].w, align: 'right' });
        y += 18;
        if (y > 720) { doc.addPage(); y = 60; }
      }
      doc.strokeColor('#ddd').moveTo(left, y).lineTo(right, y).stroke();
      y += 10;

      // ── Totals (right aligned block) ───────────────────────────────────
      const labelX = 360, valX = 465, valW = 90;
      const row = (label: string, val: string, bold = false, color = '#333') => {
        doc.fontSize(bold ? 11 : 9).fillColor(color);
        doc.text(label, labelX, y, { width: 100, align: 'right' });
        doc.text(val, valX, y, { width: valW, align: 'right' });
        y += bold ? 18 : 15;
      };
      row('Subtotal', money(inv.subtotal));
      if (Number(inv.discount) > 0) row('Discount', `- ${money(inv.discount)}`);
      if (Number(inv.total_tax) > 0) row('Tax', money(inv.total_tax));
      row('Total', money(inv.total), true, '#111');
      if (Number(inv.amount_paid) > 0) row('Paid', money(inv.amount_paid), false, '#16a34a');
      row('Balance Due', money(inv.balance_due), true, STATUS_COLOR[inv.payment_status] || '#111');

      // ── Note / footer ──────────────────────────────────────────────────
      if (inv.note) {
        y += 14;
        doc.fontSize(9).fillColor('#555').text('Note:', left, y);
        doc.fillColor('#333').text(String(inv.note), left, y + 12, { width: 300 });
      }
      // Footer flows right after the content (avoids forcing a second page).
      doc.moveDown(2);
      doc.fontSize(8).fillColor('#999').text('Generated via WhatsApp Commerce ERP', left, doc.y, { align: 'center', width: right - left });

      doc.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}
