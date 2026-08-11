import PDFDocument from 'pdfkit';
import { DocTemplateConfig, DEFAULT_TEMPLATE_CONFIG } from '../templates/document-template.types';
import { fonts, drawHeader, drawTitle, tableHeaderFill, drawBlocks } from '../templates/pdf-template';

export interface ErpPdfSettings {
  businessName: string;
  address?: string;
  gstin?: string;
  email?: string;
  phone?: string;
  website?: string;
  currency?: string;
  /** Active document template (branding + layout). Falls back to the built-in Classic. */
  template?: DocTemplateConfig;
}

const STATUS_COLOR: Record<string, string> = {
  paid: '#16a34a',
  partial: '#d97706',
  unpaid: '#dc2626',
};

interface Col {
  t: string;
  x: number;
  w: number;
  align: 'left' | 'right';
  get: (it: any, i: number) => string;
}

/**
 * Render an ERP accounts-receivable invoice to a PDF Buffer, applying the tenant's
 * document template (logo, colours, font, which columns show, and the text blocks).
 */
export function buildErpInvoicePdf(inv: any, s: ErpPdfSettings): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const cfg = s.template || DEFAULT_TEMPLATE_CONFIG;
      const f = fonts(cfg);
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

      // ── Branded header + title ─────────────────────────────────────────
      const headerBottom = drawHeader(doc, cfg, s, left, right);
      drawTitle(doc, cfg, 'INVOICE', null, right);
      const statusColor = STATUS_COLOR[inv.payment_status] || '#555';
      doc.font(f.bold).fontSize(11).fillColor(statusColor)
        .text(String(inv.payment_status || '').toUpperCase(), 340, 68, { align: 'right', width: right - 340 });

      let y = Math.max(headerBottom, 108) + 6;
      doc.strokeColor(cfg.accentColor).lineWidth(1).moveTo(left, y).lineTo(right, y).stroke();
      y += 12;

      // ── Meta (no / date / bill-to) ─────────────────────────────────────
      doc.font(f.normal).fontSize(9).fillColor('#333');
      doc.text(`Invoice No: ${inv.invoice_number}`, left, y);
      doc.text(`Date: ${new Date(inv.issued_at || inv.created_at || Date.now()).toLocaleDateString('en-IN')}`, left, y + 14);
      if (inv.due_date) doc.text(`Due: ${new Date(inv.due_date).toLocaleDateString('en-IN')}`, left, y + 28);
      doc.font(f.bold).fillColor(cfg.textColor).text('Bill To', 320, y);
      doc.font(f.normal).fillColor('#333');
      if (inv.customer_name) doc.text(inv.customer_name, 320, y + 14);
      if (inv.customer_phone) doc.text(inv.customer_phone, 320, y + 28);
      y += 56;

      // ── Items table (columns driven by the template) ───────────────────
      const cols = buildColumns(cfg, left, right, money);
      tableHeaderFill(doc, cfg, left, right - left, y);
      doc.font(f.bold).fillColor('#ffffff').fontSize(9);
      cols.forEach((c) => doc.text(c.t, c.x, y, { width: c.w, align: c.align }));
      y += 18;
      doc.font(f.normal).fillColor('#333');
      items.forEach((it, i) => {
        const rowH = rowHeight(doc, cfg, String(it.description || ''), cols[itemColIndex(cols)].w);
        cols.forEach((c) => doc.text(c.get(it, i), c.x, y, { width: c.w, align: c.align }));
        y += rowH;
        if (y > 700) { doc.addPage(); y = 60; }
      });
      doc.strokeColor('#ddd').lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke();
      y += 10;

      // ── Totals ─────────────────────────────────────────────────────────
      const labelX = 360, valX = 465, valW = 90;
      const row = (label: string, val: string, bold = false, color = '#333') => {
        doc.font(bold ? f.bold : f.normal).fontSize(bold ? 11 : 9).fillColor(color);
        doc.text(label, labelX, y, { width: 100, align: 'right' });
        doc.text(val, valX, y, { width: valW, align: 'right' });
        y += bold ? 18 : 15;
      };
      row('Subtotal', money(inv.subtotal));
      if (cfg.totals.showDiscount && Number(inv.discount) > 0) row('Discount', `- ${money(inv.discount)}`);
      if (cfg.totals.showTaxBreakup && Number(inv.total_tax) > 0) row('Tax', money(inv.total_tax));
      let displayTotal = Number(inv.total || 0);
      if (cfg.totals.showRoundoff) {
        const rounded = Math.round(displayTotal);
        const diff = rounded - displayTotal;
        if (Math.abs(diff) >= 0.01) {
          row('Round Off', `${diff > 0 ? '+' : '-'} ${money(Math.abs(diff))}`);
          displayTotal = rounded;
        }
      }
      row('Total', money(displayTotal), true, cfg.accentColor);
      if (Number(inv.amount_paid) > 0) row('Paid', money(inv.amount_paid), false, '#16a34a');
      row('Balance Due', money(inv.balance_due), true, STATUS_COLOR[inv.payment_status] || cfg.textColor);

      // ── Note + template blocks (terms / bank / declaration / footer / sign) ──
      if (inv.note) {
        y += 14;
        doc.font(f.bold).fontSize(8.5).fillColor(cfg.accentColor).text('Note', left, y);
        doc.font(f.normal).fillColor('#333').text(String(inv.note), left, doc.y + 1, { width: 320 });
        y = doc.y;
      }
      drawBlocks(doc, cfg, left, right, y);

      doc.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}

/** Build the enabled item columns and lay them out across the page width. */
function buildColumns(cfg: DocTemplateConfig, left: number, right: number, money: (n: any) => string): Col[] {
  const c = cfg.columns;
  // Fixed-width columns (besides the flexible Item column).
  const spec: Array<{ key: string; t: string; w: number; align: 'left' | 'right'; get: (it: any, i: number) => string }> = [];
  if (c.sno) spec.push({ key: 'sno', t: '#', w: 24, align: 'right', get: (_it, i) => String(i + 1) });
  spec.push({ key: 'item', t: 'Item', w: 0, align: 'left', get: (it) => String(it.description || '') });
  if (c.hsn) spec.push({ key: 'hsn', t: 'HSN', w: 52, align: 'left', get: (it) => String(it.hsn || it.hsnCode || '') });
  if (c.qty) spec.push({ key: 'qty', t: 'Qty', w: 42, align: 'right', get: (it) => String(Number(it.quantity || 0)) });
  if (c.rate) spec.push({ key: 'rate', t: 'Rate', w: 72, align: 'right', get: (it) => money(it.unitPrice) });
  if (c.discount) spec.push({ key: 'disc', t: 'Disc', w: 56, align: 'right', get: (it) => (Number(it.discount) ? money(it.discount) : '-') });
  if (c.tax) spec.push({ key: 'tax', t: 'Tax', w: 54, align: 'right', get: (it) => (it.tax != null ? money(it.tax) : it.taxRate != null ? `${it.taxRate}%` : '-') });
  if (c.amount) spec.push({ key: 'amount', t: 'Amount', w: 78, align: 'right', get: (it) => money(it.lineTotal ?? Number(it.quantity || 0) * Number(it.unitPrice || 0)) });

  const fixed = spec.reduce((sum, s) => sum + s.w, 0);
  const itemW = Math.max(120, right - left - fixed);
  let x = left;
  return spec.map((s) => {
    const w = s.key === 'item' ? itemW : s.w;
    const col: Col = { t: s.t, x, w, align: s.align, get: s.get };
    x += w;
    return col;
  });
}

function itemColIndex(cols: Col[]): number {
  const i = cols.findIndex((c) => c.t === 'Item');
  return i >= 0 ? i : 0;
}

function rowHeight(doc: PDFKit.PDFDocument, cfg: DocTemplateConfig, text: string, width: number): number {
  const h = doc.font(fonts(cfg).normal).fontSize(9).heightOfString(text || ' ', { width });
  return Math.max(18, h + 4);
}
