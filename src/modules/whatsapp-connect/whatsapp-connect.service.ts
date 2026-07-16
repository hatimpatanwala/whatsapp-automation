import { BadRequestException, Injectable } from '@nestjs/common';
import { BaileysSessionService } from './baileys-session.service';
import { ErpDocumentService } from '../erp/invoicing/erp-document.service';

/**
 * Ties Smart Connect (Baileys) to the existing PDF builders: reuses the exact
 * invoice/receipt PDF buffers the ERP already produces and pushes them through the
 * tenant's linked personal WhatsApp.
 */
@Injectable()
export class WhatsappConnectService {
  constructor(
    private readonly baileys: BaileysSessionService,
    private readonly docs: ErpDocumentService,
  ) {}

  private normalizePhone(raw?: string): string {
    const digits = String(raw || '').replace(/[^\d]/g, '');
    if (!digits) throw new BadRequestException('No WhatsApp number for this recipient — pass a phone.');
    // Default to India country code when a bare 10-digit number is given.
    return digits.length === 10 ? `91${digits}` : digits;
  }

  async sendInvoice(schema: string, tenantId: string, invoiceId: string, phoneOverride?: string) {
    const { buffer, filename, invoice } = await this.docs.getInvoicePdf(schema, invoiceId);
    const phone = this.normalizePhone(phoneOverride || invoice?.customer_phone);
    const num = invoice?.invoice_number || '';
    const total = invoice?.total != null ? `₹${Number(invoice.total).toLocaleString('en-IN')}` : '';
    const caption = `Invoice ${num}${total ? ` for ${total}` : ''}. Thank you for your business!`;
    await this.baileys.sendDocument(tenantId, phone, buffer, filename, caption);
    return { sent: true, phone, filename };
  }

  async sendReceipt(schema: string, tenantId: string, paymentId: string, phoneOverride?: string) {
    const { buffer, filename, payment } = await this.docs.getPaymentReceiptPdf(schema, paymentId);
    const phone = this.normalizePhone(phoneOverride || payment?.customer_phone);
    const amt = payment?.amount != null ? `₹${Number(payment.amount).toLocaleString('en-IN')}` : '';
    const caption = `Payment receipt${amt ? ` for ${amt}` : ''} received. Thank you!`;
    await this.baileys.sendDocument(tenantId, phone, buffer, filename, caption);
    return { sent: true, phone, filename };
  }
}
