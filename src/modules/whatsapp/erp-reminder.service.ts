import { Injectable, Logger, Optional } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { WhatsAppApiService } from './whatsapp-api.service';
import { SmartNotificationService } from './smart-notification.service';

/**
 * Payment reminders over WhatsApp — the Vyapar "payment reminder" feature, native
 * to this platform. Sends a friendly reminder to the customer on an unpaid/partial
 * invoice and stamps `last_reminder_at`. Credentials (WABA phone + token) are taken
 * from the live admin context when available, else resolved via SmartNotificationService.
 *
 * Note: WhatsApp's 24-hour customer-care window applies — a free-form reminder
 * reaches customers who messaged in the last 24h; outside that, a template is
 * required (a future enhancement).
 */
@Injectable()
export class ErpReminderService {
  private readonly logger = new Logger(ErpReminderService.name);

  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly whatsappApi: WhatsAppApiService,
    @Optional() private readonly notifications?: SmartNotificationService,
  ) {}

  private message(inv: any): string {
    const sym = inv.currency === 'INR' || !inv.currency ? '₹' : inv.currency + ' ';
    const name = inv.customer_name ? ` ${inv.customer_name}` : '';
    return `Hi${name}, a gentle reminder for invoice *${inv.invoice_number}* — balance due *${sym}${inv.balance_due}*. Please make the payment at your convenience. Thank you! 🙏`;
  }

  /** Resolve sending credentials from explicit args or the tenant's WABA. */
  private async creds(tenantId: string, phoneNumberId?: string, accessToken?: string) {
    if (phoneNumberId && accessToken) return { phoneNumberId, accessToken };
    return this.notifications ? this.notifications.getCreds(tenantId) : null;
  }

  /** Remind for a single invoice. */
  async remindInvoice(tenantId: string, schema: string, invoiceId: string, phoneNumberId?: string, accessToken?: string) {
    const c = await this.creds(tenantId, phoneNumberId, accessToken);
    if (!c) return { sent: 0, reason: 'WhatsApp number not connected' };
    const inv = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT invoice_number, customer_name, customer_phone, balance_due, currency, payment_status
                FROM "${schema}".invoices WHERE id = $1`, [invoiceId]).then((r) => r[0]));
    if (!inv) return { sent: 0, reason: 'Invoice not found' };
    if (inv.payment_status === 'paid') return { sent: 0, reason: 'Already paid' };
    if (!inv.customer_phone) return { sent: 0, reason: 'No customer phone on invoice' };
    await this.whatsappApi.sendTextMessage(c.phoneNumberId, c.accessToken, inv.customer_phone, this.message(inv));
    await this.cm.executeInTenantContext(schema, (qr) => qr.query(`UPDATE "${schema}".invoices SET last_reminder_at = NOW() WHERE id = $1`, [invoiceId]));
    return { sent: 1, invoiceNumber: inv.invoice_number };
  }

  /**
   * Remind every customer with an outstanding invoice. With `onlyStale`, skips
   * invoices reminded in the last 3 days (used by the daily auto-reminder cron);
   * without it, reminds all (manual "remind all").
   */
  async remindOverdue(tenantId: string, schema: string, phoneNumberId?: string, accessToken?: string, onlyStale = false) {
    const c = await this.creds(tenantId, phoneNumberId, accessToken);
    if (!c) return { sent: 0, reason: 'WhatsApp number not connected' };
    const staleClause = onlyStale
      ? `AND (last_reminder_at IS NULL OR last_reminder_at < NOW() - INTERVAL '3 days')`
      : '';
    const invoices = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT id, invoice_number, customer_name, customer_phone, balance_due, currency
                FROM "${schema}".invoices
                WHERE year IS NOT NULL AND payment_status <> 'paid' AND customer_phone IS NOT NULL
                ${staleClause}
                ORDER BY balance_due DESC LIMIT 50`));
    let sent = 0;
    for (const inv of invoices) {
      try {
        await this.whatsappApi.sendTextMessage(c.phoneNumberId, c.accessToken, inv.customer_phone, this.message(inv));
        await this.cm.executeInTenantContext(schema, (qr) => qr.query(`UPDATE "${schema}".invoices SET last_reminder_at = NOW() WHERE id = $1`, [inv.id]));
        sent++;
      } catch (e: any) {
        this.logger.warn(`Reminder failed for ${inv.invoice_number}: ${e.message}`);
      }
    }
    return { sent, total: invoices.length };
  }
}
