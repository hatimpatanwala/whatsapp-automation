import { Injectable, Logger, Optional } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { SmartNotificationService } from './smart-notification.service';
import { WhatsAppApiService } from './whatsapp-api.service';
import { buildInvoicePdf } from './invoice-pdf';

export type DocType = 'tax_invoice' | 'bill_of_supply' | 'delivery_challan';

const DOC_LABEL: Record<DocType, string> = {
  tax_invoice: 'TAX INVOICE',
  bill_of_supply: 'BILL OF SUPPLY',
  delivery_challan: 'DELIVERY CHALLAN',
};

interface InvoiceLine {
  name: string;
  hsn: string;
  qty: number;
  rate: number;        // unit price (incl. GST when applicable)
  line_total: number;  // qty * rate
  gst_rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

interface InvoiceSettings {
  enabled: boolean;
  legalName: string;
  gstin: string;
  address: string;
  state: string;
  stateCode: string;
  prefix: string;
  numberFormat: string;
  defaultDocType: DocType;
  priceIncludesGst: boolean;
  termsNote: string;
  footerNote: string;
}

/**
 * Generates GST-compliant documents for confirmed orders:
 *  - Tax Invoice    → billable (GST) items, with CGST/SGST (intra-state) or IGST.
 *  - Bill of Supply → non-billable / GST-exempt items (no tax).
 *  - Delivery Challan → goods movement without a tax invoice.
 * Prices are treated as GST-inclusive by default (Indian MRP), so the order total
 * is preserved and tax is extracted from it.
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    @Optional() private readonly smartNotification: SmartNotificationService,
    @Optional() private readonly whatsappApi: WhatsAppApiService,
  ) {}

  async getSettings(schema: string): Promise<InvoiceSettings> {
    const rows = await this.connectionManager.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT key, value FROM settings WHERE key LIKE 'invoice_%'`));
    const raw: Record<string, any> = {};
    for (const r of rows || []) { try { raw[r.key] = JSON.parse(r.value); } catch { raw[r.key] = r.value; } }
    return {
      enabled: raw['invoice_enabled'] !== false,
      legalName: raw['invoice_legal_name'] || '',
      gstin: raw['invoice_gstin'] || '',
      address: raw['invoice_address'] || '',
      state: raw['invoice_state'] || '',
      stateCode: String(raw['invoice_state_code'] || ''),
      prefix: raw['invoice_prefix'] || 'INV',
      numberFormat: raw['invoice_number_format'] || '{prefix}/{code}/{year}/{seq}',
      defaultDocType: (raw['invoice_default_doc_type'] || 'tax_invoice') as DocType,
      priceIncludesGst: raw['invoice_price_includes_gst'] !== false,
      termsNote: raw['invoice_terms'] || '',
      footerNote: raw['invoice_footer'] || '',
    };
  }

  private round(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }

  async listInvoices(schema: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT id, order_id, invoice_number, doc_type, customer_name, customer_phone, total, total_tax, currency, issued_at
                FROM invoices ORDER BY issued_at DESC LIMIT 200`));
  }

  async getInvoice(schema: string, id: string): Promise<any | null> {
    const inv = await this.connectionManager.executeInTenantContext(schema, async (qr) =>
      (await qr.query(`SELECT * FROM invoices WHERE id = $1`, [id]))[0]);
    if (!inv) return null;
    const settings = await this.getSettings(schema);
    return { ...inv, text: this.renderText(inv, settings) };
  }

  /** Create + persist the document for an order, then return the saved invoice. */
  async createInvoiceForOrder(schema: string, orderId: string, docType: DocType, customNumber?: string): Promise<any | null> {
    const settings = await this.getSettings(schema);

    return this.connectionManager.executeInTransaction(schema, async (qr) => {
      const order = (await qr.query(`SELECT * FROM orders WHERE id = $1`, [orderId]))[0];
      if (!order) return null;

      // Already issued for this order+type? Return it (idempotent).
      const existing = (await qr.query(`SELECT * FROM invoices WHERE order_id = $1 AND doc_type = $2 LIMIT 1`, [orderId, docType]))[0];
      if (existing) return existing;

      const items = await qr.query(
        `SELECT oi.product_name, oi.quantity, oi.unit_price, oi.total_price,
                p.hsn_code, COALESCE(p.gst_rate, 0) AS gst_rate, COALESCE(p.is_billable, true) AS is_billable
         FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [orderId],
      );
      const customer = order.customer_id
        ? (await qr.query(`SELECT name, phone FROM customers WHERE id = $1`, [order.customer_id]))[0]
        : null;

      const applyGst = docType === 'tax_invoice';
      const lines: InvoiceLine[] = [];
      let taxable = 0, cgst = 0, sgst = 0, igst = 0;
      const isInterstate = false; // intra-state by default (CGST + SGST)

      for (const it of items) {
        const lineTotal = Number(it.total_price);
        const rate = applyGst && it.is_billable ? Number(it.gst_rate) : 0;
        let lineTaxable = lineTotal, lineTax = 0;
        if (rate > 0) {
          lineTaxable = settings.priceIncludesGst ? this.round(lineTotal / (1 + rate / 100)) : lineTotal;
          lineTax = settings.priceIncludesGst ? this.round(lineTotal - lineTaxable) : this.round(lineTotal * rate / 100);
        }
        const lc = isInterstate ? 0 : this.round(lineTax / 2);
        const ls = isInterstate ? 0 : this.round(lineTax - lc);
        const li = isInterstate ? lineTax : 0;
        taxable += lineTaxable; cgst += lc; sgst += ls; igst += li;
        lines.push({
          name: it.product_name, hsn: it.hsn_code || '', qty: Number(it.quantity),
          rate: Number(it.unit_price), line_total: lineTotal, gst_rate: rate,
          taxable: lineTaxable, cgst: lc, sgst: ls, igst: li,
        });
      }

      taxable = this.round(taxable);
      const totalTax = this.round(cgst + sgst + igst);
      const subtotal = Number(order.subtotal || 0);
      const discount = Number(order.discount || 0);
      const total = Number(order.total || 0);

      const invoiceNumber = await this.nextInvoiceNumber(qr, settings, docType, customNumber);

      const saved = (await qr.query(
        `INSERT INTO invoices
          (order_id, invoice_number, doc_type, customer_id, customer_name, customer_phone,
           seller_gstin, place_of_supply, is_interstate, subtotal, discount, taxable_value,
           cgst, sgst, igst, total_tax, total, currency, items, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'issued')
         RETURNING *`,
        [
          orderId, invoiceNumber, docType, order.customer_id, customer?.name || '', customer?.phone || '',
          settings.gstin, settings.state, isInterstate, subtotal, discount, taxable,
          this.round(cgst), this.round(sgst), this.round(igst), totalTax, total, order.currency || 'INR',
          JSON.stringify(lines),
        ],
      ))[0];
      return saved;
    });
  }

  private async nextInvoiceNumber(qr: any, settings: InvoiceSettings, docType: DocType, customNumber?: string): Promise<string> {
    // 1) Manual number (matches the tenant's ERP) takes priority.
    if (customNumber && customNumber.trim()) return customNumber.trim();

    const code = docType === 'tax_invoice' ? 'INV' : docType === 'bill_of_supply' ? 'BOS' : 'DC';
    const now = (await qr.query(`SELECT to_char(NOW(),'YYYY') AS y, to_char(NOW(),'MM') AS m`))[0];
    const year = now.y;
    // Indian financial year label, e.g. 2025-26
    const fy = Number(now.m) >= 4 ? `${year}-${String(Number(year) + 1).slice(2)}` : `${Number(year) - 1}-${String(year).slice(2)}`;

    // 2) Tenant-managed running series (invoice_next_number) — they can set the
    //    starting number to align with their ERP. Increment after use.
    let seq: number | null = null;
    const seqRow = (await qr.query(`SELECT value FROM settings WHERE key = 'invoice_next_number'`))[0];
    if (seqRow?.value !== undefined) {
      const parsed = parseInt(typeof seqRow.value === 'string' ? JSON.parse(seqRow.value) : seqRow.value, 10);
      if (!Number.isNaN(parsed) && parsed > 0) seq = parsed;
    }
    if (seq === null) {
      seq = (await qr.query(`SELECT COUNT(*)::int AS c FROM invoices WHERE doc_type = $1`, [docType]))[0].c + 1;
    } else {
      await qr.query(`UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'invoice_next_number'`, [JSON.stringify(seq + 1)]);
    }

    return (settings.numberFormat || '{prefix}/{code}/{year}/{seq}')
      .replace(/\{prefix\}/g, settings.prefix)
      .replace(/\{code\}/g, code)
      .replace(/\{year\}/g, year)
      .replace(/\{fy\}/g, fy)
      .replace(/\{seq\}/g, String(seq).padStart(4, '0'));
  }

  /** Render a WhatsApp-friendly document text. */
  renderText(inv: any, settings: InvoiceSettings): string {
    const cur = inv.currency === 'INR' ? '₹' : (inv.currency || '');
    const lines: InvoiceLine[] = Array.isArray(inv.items) ? inv.items : JSON.parse(inv.items || '[]');
    const L: string[] = [];
    L.push(`*${DOC_LABEL[inv.doc_type as DocType]}*`);
    if (settings.legalName) L.push(`*${settings.legalName}*`);
    if (settings.address) L.push(settings.address);
    if (inv.doc_type === 'tax_invoice' && settings.gstin) L.push(`GSTIN: ${settings.gstin}`);
    L.push('────────────────────');
    L.push(`No: *${inv.invoice_number}*`);
    L.push(`Date: ${new Date(inv.issued_at).toLocaleDateString('en-IN')}`);
    if (inv.customer_name) L.push(`Bill to: ${inv.customer_name}`);
    L.push('────────────────────');
    for (const it of lines) {
      L.push(`• ${it.name}${it.hsn ? ` (HSN ${it.hsn})` : ''}`);
      L.push(`   ${it.qty} × ${cur}${it.rate} = ${cur}${it.line_total}${it.gst_rate ? `  [GST ${it.gst_rate}%]` : ''}`);
    }
    L.push('────────────────────');
    if (inv.doc_type === 'tax_invoice') {
      L.push(`Taxable: ${cur}${Number(inv.taxable_value).toFixed(2)}`);
      if (Number(inv.igst) > 0) L.push(`IGST: ${cur}${Number(inv.igst).toFixed(2)}`);
      else {
        L.push(`CGST: ${cur}${Number(inv.cgst).toFixed(2)}`);
        L.push(`SGST: ${cur}${Number(inv.sgst).toFixed(2)}`);
      }
      L.push(`Total GST: ${cur}${Number(inv.total_tax).toFixed(2)}`);
    }
    if (Number(inv.discount) > 0) L.push(`Discount: -${cur}${Number(inv.discount).toFixed(2)}`);
    L.push(`*TOTAL: ${cur}${Number(inv.total).toFixed(2)}*`);
    L.push('────────────────────');
    if (inv.doc_type === 'delivery_challan') L.push('_Not a tax invoice — for delivery of goods only._');
    else if (inv.doc_type === 'bill_of_supply') L.push('_Bill of Supply — no GST charged._');
    L.push('_This is a computer-generated document._');
    return L.join('\n');
  }

  private pdfSettings(s: InvoiceSettings) {
    return { legalName: s.legalName, gstin: s.gstin, address: s.address, state: s.state, termsNote: s.termsNote, footerNote: s.footerNote };
  }

  /** Regenerate the PDF buffer for an existing invoice (for portal download). */
  async getInvoicePdfBuffer(schema: string, id: string): Promise<{ buffer: Buffer; filename: string } | null> {
    const inv = await this.connectionManager.executeInTenantContext(schema, async (qr) =>
      (await qr.query(`SELECT * FROM invoices WHERE id = $1`, [id]))[0]);
    if (!inv) return null;
    const settings = await this.getSettings(schema);
    const buffer = await buildInvoicePdf(inv, this.pdfSettings(settings));
    return { buffer, filename: `${String(inv.invoice_number).replace(/[^\w.-]/g, '_')}.pdf` };
  }

  /**
   * Create the document, generate a PDF, and deliver to the customer:
   * the text via the window-aware smart pipeline, plus the PDF document
   * (best-effort) when reachable. Returns a copy + the PDF media id for the admin.
   */
  async generateAndSend(
    tenant: { id: string; schemaName: string; phoneNumberId?: string; accessToken?: string },
    orderId: string, docType: DocType, opts?: { customNumber?: string },
  ): Promise<{ ok: boolean; text?: string; invoiceNumber?: string; reason?: string; pdfMediaId?: string | null; pdfFilename?: string }> {
    const schema = tenant.schemaName;
    const settings = await this.getSettings(schema);
    if (docType === 'tax_invoice' && !settings.gstin) {
      return { ok: false, reason: 'No GSTIN configured. Set it in Settings → Commerce → Invoicing before issuing a GST invoice.' };
    }
    const inv = await this.createInvoiceForOrder(schema, orderId, docType, opts?.customNumber);
    if (!inv) return { ok: false, reason: 'Order not found.' };

    const text = this.renderText(inv, settings);

    // Resolve the tenant's WhatsApp sender creds when the caller didn't pass them
    // (the portal/webview paths don't carry phoneNumberId/accessToken) so the PDF
    // can actually be uploaded and delivered, not just the text.
    let phoneNumberId = tenant.phoneNumberId;
    let accessToken = tenant.accessToken;
    if ((!phoneNumberId || !accessToken) && this.smartNotification) {
      const creds = await this.smartNotification.getCreds(tenant.id).catch(() => null);
      if (creds) { phoneNumberId = phoneNumberId || creds.phoneNumberId; accessToken = accessToken || creds.accessToken; }
    }

    // Generate the PDF and upload it to WhatsApp media (best-effort).
    let pdfMediaId: string | null = null;
    const pdfFilename = `${String(inv.invoice_number).replace(/[^\w.-]/g, '_')}.pdf`;
    try {
      if (this.whatsappApi && phoneNumberId && accessToken) {
        const pdf = await buildInvoicePdf(inv, this.pdfSettings(settings));
        pdfMediaId = await this.whatsappApi.uploadMediaBuffer(phoneNumberId, accessToken, pdf, 'application/pdf', pdfFilename);
      }
    } catch (err: any) {
      this.logger.warn(`invoice PDF generation failed: ${err.message}`);
    }

    // Deliver to the customer: text (window-aware) + PDF document (best-effort).
    if (inv.customer_phone) {
      const phone = String(inv.customer_phone).replace(/^\+/, '');
      if (this.smartNotification) {
        await this.smartNotification.notify({
          tenantId: tenant.id, schema, recipientPhone: phone, audience: 'customer', channel: 'utility',
          summary: `${DOC_LABEL[docType]} ${inv.invoice_number}`, detail: text, recipientName: inv.customer_name,
        }).catch(() => undefined);
      }
      if (pdfMediaId && this.whatsappApi && phoneNumberId && accessToken) {
        await this.whatsappApi.sendDocument(phoneNumberId, accessToken, phone, { id: pdfMediaId }, pdfFilename, `${DOC_LABEL[docType]} ${inv.invoice_number}`).catch(() => undefined);
      }
    }
    return { ok: true, text, invoiceNumber: inv.invoice_number, pdfMediaId, pdfFilename };
  }
}
