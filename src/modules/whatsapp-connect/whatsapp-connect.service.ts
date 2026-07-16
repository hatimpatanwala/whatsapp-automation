import { BadRequestException, Injectable } from '@nestjs/common';
import { BaileysSessionService } from './baileys-session.service';
import { ErpDocumentService } from '../erp/invoicing/erp-document.service';
import { DocDeliveryService } from '../whatsapp/doc-delivery.service';
import { SmartNotificationService } from '../whatsapp/smart-notification.service';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

export type SendChannel = 'official' | 'wa.me' | 'smart-connect';

export interface SendResult {
  sent: boolean;
  channel: SendChannel;
  phone: string;
  filename?: string;
  /** Present when channel === 'wa.me': the frontend opens this click-to-chat link. */
  waLink?: string;
}

/**
 * Ties WhatsApp document sending to the SAFEST available channel:
 *   1. Official WhatsApp Business API (compliant, zero ban risk) when the tenant has
 *      connected it — the recommended path.
 *   2. wa.me click-to-chat (also zero ban risk; the user taps send) otherwise.
 *   3. Smart Connect (unofficial Baileys) ONLY when explicitly requested — carries a
 *      ban risk, throttled, opt-in.
 */
@Injectable()
export class WhatsappConnectService {
  constructor(
    private readonly baileys: BaileysSessionService,
    private readonly docs: ErpDocumentService,
    private readonly docDelivery: DocDeliveryService,
    private readonly smartNotification: SmartNotificationService,
    private readonly cm: TenantConnectionManager,
  ) {}

  private normalizePhone(raw?: string): string {
    const digits = String(raw || '').replace(/[^\d]/g, '');
    if (!digits) throw new BadRequestException('No WhatsApp number for this recipient — pass a phone.');
    return digits.length === 10 ? `91${digits}` : digits;
  }

  private async hasOfficialWhatsapp(tenantId: string): Promise<boolean> {
    const creds = await this.smartNotification.getCreds(tenantId).catch(() => null);
    return !!(creds?.phoneNumberId && creds?.accessToken);
  }

  /** What channels can this tenant use right now (drives the UI's send button). */
  async channels(tenantId: string) {
    const [official, smartStatus] = await Promise.all([
      this.hasOfficialWhatsapp(tenantId),
      this.baileys.status(tenantId).catch(() => ({ enabled: false, linked: false } as any)),
    ]);
    return {
      official,                              // compliant, recommended
      waMe: true,                            // always available, zero risk
      smartConnectEnabled: !!smartStatus.enabled, // unofficial channel turned on by ops
      smartConnectLinked: !!smartStatus.linked,
    };
  }

  private waLink(phone: string, text: string): string {
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  private async invoiceMeta(schema: string, invoiceId: string) {
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT customer_phone, invoice_number, total FROM "${schema}".invoices WHERE id = $1`, [invoiceId]),
    );
    if (!rows?.[0]) throw new BadRequestException('Invoice not found');
    return rows[0];
  }

  private async paymentMeta(schema: string, paymentId: string) {
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT p.amount, i.customer_phone, i.invoice_number
         FROM "${schema}".payments p LEFT JOIN "${schema}".invoices i ON i.id = p.invoice_id
         WHERE p.id = $1`,
        [paymentId],
      ),
    );
    if (!rows?.[0]) throw new BadRequestException('Payment not found');
    return rows[0];
  }

  /** Safe-first invoice send: official WABA if connected, else a wa.me link. */
  async sendInvoiceSafe(schema: string, tenantId: string, invoiceId: string, phoneOverride?: string): Promise<SendResult> {
    const meta = await this.invoiceMeta(schema, invoiceId);
    const phone = this.normalizePhone(phoneOverride || meta.customer_phone);
    if (await this.hasOfficialWhatsapp(tenantId)) {
      const r = await this.docDelivery.sendInvoice(tenantId, schema, phone, invoiceId);
      return { sent: true, channel: 'official', phone, filename: r.filename };
    }
    const total = meta.total != null ? `₹${Number(meta.total).toLocaleString('en-IN')}` : '';
    const text = `Hi, please find your invoice ${meta.invoice_number || ''}${total ? ` for ${total}` : ''}.`;
    return { sent: false, channel: 'wa.me', phone, waLink: this.waLink(phone, text) };
  }

  /** Safe-first receipt send: official WABA if connected, else a wa.me link. */
  async sendReceiptSafe(schema: string, tenantId: string, paymentId: string, phoneOverride?: string): Promise<SendResult> {
    const meta = await this.paymentMeta(schema, paymentId);
    const phone = this.normalizePhone(phoneOverride || meta.customer_phone);
    if (await this.hasOfficialWhatsapp(tenantId)) {
      const r = await this.docDelivery.sendReceipt(tenantId, schema, phone, paymentId);
      return { sent: true, channel: 'official', phone, filename: r.filename };
    }
    const amt = meta.amount != null ? `₹${Number(meta.amount).toLocaleString('en-IN')}` : '';
    const text = `Hi, we've received your payment${amt ? ` of ${amt}` : ''}${meta.invoice_number ? ` for invoice ${meta.invoice_number}` : ''}. Thank you!`;
    return { sent: false, channel: 'wa.me', phone, waLink: this.waLink(phone, text) };
  }

  // ── Unofficial Smart Connect (opt-in, ban risk) — explicit only ────────────────
  async sendInvoiceViaSmartConnect(schema: string, tenantId: string, invoiceId: string, phoneOverride?: string) {
    const { buffer, filename, invoice } = await this.docs.getInvoicePdf(schema, invoiceId);
    const phone = this.normalizePhone(phoneOverride || invoice?.customer_phone);
    const total = invoice?.total != null ? `₹${Number(invoice.total).toLocaleString('en-IN')}` : '';
    await this.baileys.sendDocument(tenantId, phone, buffer, filename, `Invoice ${invoice?.invoice_number || ''}${total ? ` for ${total}` : ''}`.trim());
    return { sent: true, channel: 'smart-connect' as const, phone, filename };
  }

  async sendReceiptViaSmartConnect(schema: string, tenantId: string, paymentId: string, phoneOverride?: string) {
    const { buffer, filename, payment } = await this.docs.getPaymentReceiptPdf(schema, paymentId);
    const phone = this.normalizePhone(phoneOverride || payment?.customer_phone);
    await this.baileys.sendDocument(tenantId, phone, buffer, filename, `Payment receipt`);
    return { sent: true, channel: 'smart-connect' as const, phone, filename };
  }
}
