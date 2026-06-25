import PDFDocument from 'pdfkit';

const DOC_LABEL: Record<string, string> = {
  tax_invoice: 'TAX INVOICE',
  bill_of_supply: 'BILL OF SUPPLY',
  delivery_challan: 'DELIVERY CHALLAN',
};

interface PdfSettings {
  legalName: string;
  gstin: string;
  address: string;
  state: string;
  termsNote?: string;
  footerNote?: string;
}

/** Render a GST-style invoice PDF and return it as a Buffer. */
export function buildInvoicePdf(inv: any, s: PdfSettings): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const cur = inv.currency === 'INR' ? 'Rs.' : (inv.currency || '');
      const isTax = inv.doc_type === 'tax_invoice';
      const lines: any[] = Array.isArray(inv.items) ? inv.items : JSON.parse(inv.items || '[]');
      const left = 40;
      const right = 555;
      const money = (n: any) => `${cur} ${Number(n || 0).toFixed(2)}`;

      // ── Header
      doc.fontSize(18).fillColor('#111').text(DOC_LABEL[inv.doc_type] || 'INVOICE', { align: 'center' });
      doc.moveDown(0.4);
      doc.fontSize(13).fillColor('#111').text(s.legalName || 'Your Business', { align: 'center' });
      doc.fontSize(9).fillColor('#555');
      if (s.address) doc.text(s.address, { align: 'center' });
      if (isTax && s.gstin) doc.text(`GSTIN: ${s.gstin}`, { align: 'center' });
      doc.moveDown(0.6);
      doc.strokeColor('#ddd').moveTo(left, doc.y).lineTo(right, doc.y).stroke();
      doc.moveDown(0.6);

      // ── Meta (invoice no / date / bill-to)
      const metaY = doc.y;
      doc.fontSize(9).fillColor('#333');
      doc.text(`Invoice No: ${inv.invoice_number}`, left, metaY);
      doc.text(`Date: ${new Date(inv.issued_at || Date.now()).toLocaleDateString('en-IN')}`, left, metaY + 14);
      if (inv.customer_name) doc.text(`Bill To: ${inv.customer_name}`, 320, metaY);
      if (inv.customer_phone) doc.text(`Phone: ${inv.customer_phone}`, 320, metaY + 14);
      doc.moveDown(2);

      // ── Items table header
      const cols = isTax
        ? [{ t: 'Item', x: left, w: 200 }, { t: 'HSN', x: 245, w: 50 }, { t: 'Qty', x: 300, w: 35 }, { t: 'Rate', x: 340, w: 70 }, { t: 'GST%', x: 415, w: 40 }, { t: 'Amount', x: 460, w: 95 }]
        : [{ t: 'Item', x: left, w: 280 }, { t: 'Qty', x: 330, w: 50 }, { t: 'Rate', x: 385, w: 80 }, { t: 'Amount', x: 470, w: 85 }];
      let y = doc.y;
      doc.rect(left, y - 3, right - left, 18).fill('#f3f4f6');
      doc.fillColor('#111').fontSize(9);
      for (const c of cols) doc.text(c.t, c.x + 3, y + 2, { width: c.w - 6, align: c.t === 'Item' || c.t === 'HSN' ? 'left' : 'right' });
      y += 20;

      // ── Items rows
      doc.fillColor('#333').fontSize(9);
      for (const it of lines) {
        const row = isTax
          ? [it.name, it.hsn || '-', String(it.qty), money(it.rate), `${it.gst_rate || 0}%`, money(it.line_total)]
          : [it.name, String(it.qty), money(it.rate), money(it.line_total)];
        let maxH = 14;
        row.forEach((val: string, i: number) => {
          const c = cols[i];
          const align = (i === 0 || (isTax && i === 1)) ? 'left' : 'right';
          doc.text(val, c.x + 3, y, { width: c.w - 6, align });
        });
        y += maxH;
        if (y > 740) { doc.addPage(); y = 50; }
      }
      doc.strokeColor('#ddd').moveTo(left, y + 2).lineTo(right, y + 2).stroke();
      y += 10;

      // ── Totals
      const labelX = 360, valX = 460, valW = 95;
      const totRow = (label: string, val: string, bold = false) => {
        doc.fontSize(bold ? 11 : 9).fillColor(bold ? '#111' : '#444');
        doc.text(label, labelX, y, { width: 95, align: 'right' });
        doc.text(val, valX, y, { width: valW, align: 'right' });
        y += bold ? 18 : 14;
      };
      if (isTax) {
        totRow('Taxable Value', money(inv.taxable_value));
        if (Number(inv.igst) > 0) totRow('IGST', money(inv.igst));
        else { totRow('CGST', money(inv.cgst)); totRow('SGST', money(inv.sgst)); }
        totRow('Total GST', money(inv.total_tax));
      }
      if (Number(inv.discount) > 0) totRow('Discount', `- ${money(inv.discount)}`);
      totRow('TOTAL', money(inv.total), true);

      // ── Footer
      y += 16;
      doc.fontSize(8).fillColor('#777');
      if (inv.doc_type === 'delivery_challan') doc.text('Not a tax invoice — issued for delivery of goods only.', left, y);
      else if (inv.doc_type === 'bill_of_supply') doc.text('Bill of Supply — no GST charged on this document.', left, y);
      if (s.termsNote) { y = doc.y + 4; doc.text(s.termsNote, left, y, { width: right - left }); }
      doc.moveDown(1);
      doc.fontSize(8).fillColor('#999').text(s.footerNote || 'This is a computer-generated document and does not require a signature.', left, doc.y, { width: right - left, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
