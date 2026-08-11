import { DocTemplateConfig } from './document-template.types';

/**
 * Shared helpers that apply a DocTemplateConfig to a pdfkit document — used by every
 * document builder (invoice, offer, PO, receipt, notes) so a tenant's chosen branding
 * (logo, colours, font, header fields, text blocks) renders consistently everywhere.
 */

export interface CompanyHeaderInfo {
  businessName: string;
  address?: string;
  gstin?: string;
  email?: string;
  phone?: string;
  website?: string;
}

const FONTS: Record<string, { normal: string; bold: string }> = {
  helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold' },
  times: { normal: 'Times-Roman', bold: 'Times-Bold' },
  courier: { normal: 'Courier', bold: 'Courier-Bold' },
};

export function fonts(cfg: DocTemplateConfig): { normal: string; bold: string } {
  return FONTS[cfg.font] || FONTS.helvetica;
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const m = /^data:image\/[a-zA-Z+]+;base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    return Buffer.from(m[1], 'base64');
  } catch {
    return null;
  }
}

/**
 * Draw the branded header (optional logo + company block). Returns the Y coordinate
 * just below the header so callers can continue laying out the document title.
 */
export function drawHeader(
  doc: PDFKit.PDFDocument,
  cfg: DocTemplateConfig,
  info: CompanyHeaderInfo,
  left: number,
  right: number,
): number {
  const f = fonts(cfg);
  let textX = left;
  const top = 40;

  if (cfg.showLogo && cfg.logo) {
    const buf = dataUrlToBuffer(cfg.logo);
    if (buf) {
      try {
        doc.image(buf, left, top, { fit: [64, 64] });
        textX = left + 76;
      } catch {
        /* bad image data — skip the logo, keep the text */
      }
    }
  }

  doc.font(f.bold).fontSize(16).fillColor(cfg.textColor);
  doc.text(info.businessName || 'Your Business', textX, top, { width: 300 });
  doc.font(f.normal).fontSize(9).fillColor('#555');
  if (cfg.header.showAddress && info.address) doc.text(info.address, textX, doc.y, { width: 300 });
  const line: string[] = [];
  if (cfg.header.showGstin && info.gstin) line.push(`GSTIN: ${info.gstin}`);
  if (cfg.header.showPhone && info.phone) line.push(`Ph: ${info.phone}`);
  if (cfg.header.showEmail && info.email) line.push(info.email);
  if (cfg.header.showWebsite && info.website) line.push(info.website);
  if (line.length) doc.text(line.join('   '), textX, doc.y, { width: 320 });

  return Math.max(doc.y, top + 64);
}

/** Accent-coloured document title on the right. */
export function drawTitle(
  doc: PDFKit.PDFDocument,
  cfg: DocTemplateConfig,
  title: string,
  subtitle: string | null,
  right: number,
): void {
  const f = fonts(cfg);
  doc.font(f.bold).fontSize(22).fillColor(cfg.accentColor).text(title, 340, 40, { align: 'right', width: right - 340 });
  if (subtitle) {
    doc.font(f.bold).fontSize(11).fillColor('#555').text(subtitle, 340, 68, { align: 'right', width: right - 340 });
  }
}

/** Fill a table-header band in the accent colour with white text. */
export function tableHeaderFill(doc: PDFKit.PDFDocument, cfg: DocTemplateConfig, left: number, width: number, y: number): void {
  doc.rect(left, y - 3, width, 18).fill(cfg.accentColor);
}

/**
 * Render the configured text blocks (terms, bank details, declaration, footer, signature)
 * below the totals. Returns the Y after the blocks.
 */
export function drawBlocks(
  doc: PDFKit.PDFDocument,
  cfg: DocTemplateConfig,
  left: number,
  right: number,
  startY: number,
): number {
  const f = fonts(cfg);
  let y = startY + 14;
  const width = right - left;
  const pageBreak = () => {
    if (y > 740) {
      doc.addPage();
      y = 50;
    }
  };

  const block = (label: string, body: string) => {
    if (!body || !body.trim()) return;
    pageBreak();
    doc.font(f.bold).fontSize(8.5).fillColor(cfg.accentColor).text(label, left, y);
    y = doc.y + 1;
    doc.font(f.normal).fontSize(8.5).fillColor('#333').text(body.trim(), left, y, { width: width * 0.62 });
    y = doc.y + 8;
  };

  block('Notes', cfg.blocks.notes);
  block('Bank Details', cfg.blocks.bankDetails);
  block('Terms & Conditions', cfg.blocks.terms);
  block('Declaration', cfg.blocks.declaration);

  // Signature — right-aligned box.
  if (cfg.blocks.signatureLabel && cfg.blocks.signatureLabel.trim()) {
    const sigY = Math.max(y, startY + 40);
    doc.font(f.normal).fontSize(9).fillColor('#333');
    doc.text(cfg.blocks.signatureLabel.trim(), right - 200, sigY + 24, { width: 200, align: 'right' });
    doc.strokeColor('#bbb').moveTo(right - 170, sigY + 22).lineTo(right, sigY + 22).stroke();
    y = Math.max(y, sigY + 40);
  }

  // Footer — centred, muted.
  if (cfg.blocks.footer && cfg.blocks.footer.trim()) {
    y += 8;
    pageBreak();
    doc.font(f.normal).fontSize(8).fillColor('#999').text(cfg.blocks.footer.trim(), left, y, { align: 'center', width });
    y = doc.y;
  }
  return y;
}
