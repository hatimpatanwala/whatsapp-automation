import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { WhatsAppApiService } from './whatsapp-api.service';
import { SmartNotificationService } from './smart-notification.service';
import { ErpDocumentService } from '../erp/invoicing/erp-document.service';

/**
 * Delivers ERP PDFs (invoice, e-way bill) into a WhatsApp chat as a document.
 *
 * This is the reliable way to hand a file to a user who is inside the WhatsApp
 * in-app browser: that WebView cannot download files (it ignores the `download`
 * attribute and punts blob/`_blank` links to the external browser, ejecting the
 * user and 401-ing on the fresh, cookie-less context). Instead we generate the
 * PDF server-side, upload it to WhatsApp media, and send it as a document so it
 * lands natively in the user's chat. The desktop portal still downloads inline.
 */
@Injectable()
export class DocDeliveryService {
  private readonly logger = new Logger(DocDeliveryService.name);

  constructor(
    private readonly whatsappApi: WhatsAppApiService,
    private readonly smartNotification: SmartNotificationService,
    private readonly documents: ErpDocumentService,
  ) {}

  /** Send an invoice PDF to a WhatsApp number. Returns the filename that was sent. */
  async sendInvoice(tenantId: string, schema: string, phone: string, invoiceId: string): Promise<{ sent: true; filename: string }> {
    const { buffer, filename, invoice } = await this.documents.getInvoicePdf(schema, invoiceId);
    await this.deliver(tenantId, phone, buffer, filename, `Invoice ${invoice.invoice_number || ''}`.trim());
    return { sent: true, filename };
  }

  /** Send an e-way bill PDF to a WhatsApp number. Returns the filename that was sent. */
  async sendEway(tenantId: string, schema: string, phone: string, ewayId: string): Promise<{ sent: true; filename: string }> {
    const { buffer, filename, eway } = await this.documents.getEwayPdf(schema, ewayId);
    await this.deliver(tenantId, phone, buffer, filename, `E-way bill ${eway.eway_number || ''}`.trim());
    return { sent: true, filename };
  }

  /** Resolve the tenant's sender creds, upload the buffer, and send it as a document. */
  private async deliver(tenantId: string, phone: string, buffer: Buffer, filename: string, caption: string): Promise<void> {
    const to = String(phone || '').replace(/[^0-9]/g, '');
    if (!to) throw new BadRequestException('No WhatsApp number to send this document to.');
    const creds = await this.smartNotification.getCreds(tenantId).catch(() => null);
    if (!creds?.phoneNumberId || !creds?.accessToken) {
      throw new BadRequestException('WhatsApp is not connected for this business.');
    }
    const mediaId = await this.whatsappApi.uploadMediaBuffer(creds.phoneNumberId, creds.accessToken, buffer, 'application/pdf', filename);
    if (!mediaId) throw new BadRequestException('Could not prepare the PDF for WhatsApp. Please try again.');
    await this.whatsappApi.sendDocument(creds.phoneNumberId, creds.accessToken, to, { id: mediaId }, filename, caption);
    this.logger.log(`Delivered ${filename} to ${to}`);
  }
}
