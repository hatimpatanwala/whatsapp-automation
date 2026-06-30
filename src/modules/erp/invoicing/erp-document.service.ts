import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { buildErpInvoicePdf, ErpPdfSettings } from './erp-invoice-pdf';
import { buildErpDocPdf } from './erp-doc-pdf';
import { firstRow } from '../common/sql-result.util';

/**
 * Renders ERP documents (invoices) to PDF.
 *
 * PDFs are generated synchronously on demand with pdfkit (in-memory, fast) —
 * matching the existing GST invoice flow (whatsapp/invoice.service.ts). There is
 * no persistent S3 copy: HTTP download streams the buffer, and WhatsApp delivery
 * (handled by AdminCommandService, which owns the WhatsApp client) uploads this
 * buffer to WhatsApp media then sends it as a document. Keeping WhatsApp out of
 * this service avoids a circular module dependency with WhatsAppModule.
 */
@Injectable()
export class ErpDocumentService {
  constructor(private readonly cm: TenantConnectionManager) {}

  /** Build the invoice PDF as a Buffer + a safe filename + the invoice row. */
  async getInvoicePdf(schema: string, invoiceId: string): Promise<{ buffer: Buffer; filename: string; invoice: any }> {
    const { invoice, settings } = await this.cm.executeInTenantContext(schema, async (qr) => {
      const invoice = (await qr.query(`SELECT * FROM "${schema}".invoices WHERE id = $1 LIMIT 1`, [invoiceId]))[0];
      if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
      const settings = await this.loadSettings(qr, schema);
      return { invoice, settings };
    });

    const buffer = await buildErpInvoicePdf(invoice, settings);
    const filename = `${String(invoice.invoice_number).replace(/[^\w.-]/g, '_')}.pdf`;
    return { buffer, filename, invoice };
  }

  /** Offer PDF (line items + lead party). */
  async getOfferPdf(schema: string, offerId: string): Promise<{ buffer: Buffer; filename: string; doc: any }> {
    const { doc, settings, items, lead } = await this.cm.executeInTenantContext(schema, async (qr) => {
      const doc = firstRow(await qr.query(`SELECT * FROM "${schema}".offers WHERE id = $1 AND removed = false`, [offerId]));
      if (!doc) throw new NotFoundException('Offer not found');
      const items = await qr.query(`SELECT * FROM "${schema}".offer_items WHERE offer_id = $1 ORDER BY sort_order`, [offerId]);
      const lead = doc.lead_id ? firstRow(await qr.query(`SELECT first_name, last_name, phone FROM "${schema}".leads WHERE id = $1`, [doc.lead_id])) : null;
      return { doc, settings: await this.loadSettings(qr, schema), items, lead };
    });
    const buffer = await buildErpDocPdf({
      docTitle: 'OFFER', number: doc.offer_number, date: doc.created_at,
      party: lead ? { label: 'For', name: [lead.first_name, lead.last_name].filter(Boolean).join(' '), phone: lead.phone } : undefined,
      items, subtotal: doc.subtotal, discount: doc.discount, totalTax: doc.total_tax, total: doc.total,
      currency: doc.currency, statusLabel: doc.status, note: doc.note,
    }, settings);
    return { buffer, filename: `${String(doc.offer_number).replace(/[^\w.-]/g, '_')}.pdf`, doc };
  }

  /** Purchase order PDF (line items + supplier party). */
  async getSupplierOrderPdf(schema: string, soId: string): Promise<{ buffer: Buffer; filename: string; doc: any }> {
    const { doc, settings, items, supplier } = await this.cm.executeInTenantContext(schema, async (qr) => {
      const doc = firstRow(await qr.query(`SELECT * FROM "${schema}".supplier_orders WHERE id = $1 AND removed = false`, [soId]));
      if (!doc) throw new NotFoundException('Purchase order not found');
      const items = await qr.query(`SELECT * FROM "${schema}".supplier_order_items WHERE supplier_order_id = $1 ORDER BY sort_order`, [soId]);
      const supplier = doc.supplier_id ? firstRow(await qr.query(`SELECT company, phone FROM "${schema}".suppliers WHERE id = $1`, [doc.supplier_id])) : null;
      return { doc, settings: await this.loadSettings(qr, schema), items, supplier };
    });
    const buffer = await buildErpDocPdf({
      docTitle: 'PURCHASE ORDER', number: doc.order_number, date: doc.created_at,
      party: supplier ? { label: 'Supplier', name: supplier.company, phone: supplier.phone } : undefined,
      items, subtotal: doc.subtotal, discount: doc.discount, totalTax: doc.total_tax, total: doc.total,
      currency: doc.currency, statusLabel: doc.status, note: doc.note,
    }, settings);
    return { buffer, filename: `${String(doc.order_number).replace(/[^\w.-]/g, '_')}.pdf`, doc };
  }

  /** Credit/Debit note PDF (sale/purchase return). */
  async getReturnNotePdf(schema: string, table: 'credit_notes' | 'debit_notes', id: string): Promise<{ buffer: Buffer; filename: string; doc: any }> {
    const { doc, settings, party } = await this.cm.executeInTenantContext(schema, async (qr) => {
      const doc = firstRow(await qr.query(`SELECT * FROM "${schema}".${table} WHERE id = $1 AND removed = false`, [id]));
      if (!doc) throw new NotFoundException('Note not found');
      let party: any;
      if (table === 'credit_notes') party = doc.customer_name ? { label: 'Customer', name: doc.customer_name, phone: doc.customer_phone } : undefined;
      else if (doc.supplier_id) { const s = firstRow(await qr.query(`SELECT company, phone FROM "${schema}".suppliers WHERE id = $1`, [doc.supplier_id])); party = s ? { label: 'Supplier', name: s.company, phone: s.phone } : undefined; }
      return { doc, settings: await this.loadSettings(qr, schema), party };
    });
    const isCredit = table === 'credit_notes';
    const buffer = await buildErpDocPdf({
      docTitle: isCredit ? 'CREDIT NOTE' : 'DEBIT NOTE', number: doc.note_number, date: doc.created_at, party,
      items: Array.isArray(doc.items) ? doc.items : JSON.parse(doc.items || '[]'),
      subtotal: doc.subtotal, discount: doc.discount, totalTax: doc.total_tax, total: doc.total,
      currency: doc.currency, statusLabel: doc.status, note: doc.reason,
    }, settings);
    return { buffer, filename: `${String(doc.note_number).replace(/[^\w.-]/g, '_')}.pdf`, doc };
  }

  /** Payment receipt PDF for a single payment against an invoice. */
  async getPaymentReceiptPdf(schema: string, paymentId: string): Promise<{ buffer: Buffer; filename: string; payment: any }> {
    const { payment, settings } = await this.cm.executeInTenantContext(schema, async (qr) => {
      const payment = firstRow(await qr.query(
        `SELECT p.*, i.invoice_number, i.customer_name, i.customer_phone, i.total AS invoice_total, i.balance_due
         FROM "${schema}".payments p LEFT JOIN "${schema}".invoices i ON i.id = p.invoice_id WHERE p.id = $1`, [paymentId]));
      if (!payment) throw new NotFoundException('Payment not found');
      return { payment, settings: await this.loadSettings(qr, schema) };
    });
    const buffer = await buildErpDocPdf({
      docTitle: 'PAYMENT RECEIPT',
      number: payment.ref || `RCPT-${String(payment.id).slice(0, 8)}`,
      date: payment.created_at,
      party: payment.customer_name ? { label: 'Received From', name: payment.customer_name, phone: payment.customer_phone } : undefined,
      items: [{ description: `Payment against ${payment.invoice_number || 'invoice'} (${payment.method || 'manual'})`, quantity: 1, unitPrice: Number(payment.amount), lineTotal: Number(payment.amount) }],
      total: payment.amount, currency: payment.currency,
      statusLabel: 'Received', statusColor: '#16a34a',
      extraRows: payment.invoice_total !== undefined ? [
        { label: 'Invoice Total', value: `${payment.currency === 'INR' || !payment.currency ? 'Rs.' : payment.currency + ' '} ${Number(payment.invoice_total).toFixed(2)}` },
        { label: 'Balance Due', value: `${payment.currency === 'INR' || !payment.currency ? 'Rs.' : payment.currency + ' '} ${Number(payment.balance_due).toFixed(2)}` },
      ] : undefined,
    }, settings);
    return { buffer, filename: `receipt-${String(payment.id).slice(0, 8)}.pdf`, payment };
  }

  /** Pull the business header fields from the tenant settings KV table. */
  private async loadSettings(qr: QueryRunner, schema: string): Promise<ErpPdfSettings> {
    const rows = await qr.query(
      `SELECT key, value FROM "${schema}".settings
       WHERE key IN ('business_name','invoice_legal_name','invoice_address','invoice_gstin','erp_currency','currency')`,
    );
    const m: Record<string, any> = {};
    for (const r of rows) m[r.key] = r.value;
    return {
      businessName: m.invoice_legal_name || m.business_name || 'Your Business',
      address: m.invoice_address || undefined,
      gstin: m.invoice_gstin || undefined,
      currency: m.erp_currency || m.currency || 'INR',
    };
  }
}
