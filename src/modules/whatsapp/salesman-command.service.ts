import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { WhatsAppApiService } from './whatsapp-api.service';

/**
 * Salesman WhatsApp entry — the mirror of the admin command flow for field reps.
 * When a message arrives from a registered salesman's number (they text "hi"),
 * we reply with a CTA button that opens their tokenized Sales App webview
 * (`/m/sales`), where they take orders, collect payments and see pending bills.
 * The salesman never types commands — the whole workflow lives in the webview.
 */
@Injectable()
export class SalesmanCommandService {
  private readonly logger = new Logger(SalesmanCommandService.name);

  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly whatsappApi: WhatsAppApiService,
    private readonly config: ConfigService,
  ) {}

  /** Resolve an active salesman for this tenant by the sender's phone number. */
  async findByPhone(schema: string, from: string): Promise<{ id: string; name: string; access_token: string } | null> {
    const digits = (from || '').replace(/\D/g, '');
    if (!digits) return null;
    try {
      return await this.cm.executeInTenantContext(schema, async (qr) => {
        const rows = await qr.query(
          `SELECT id, name, access_token FROM "${schema}".salesmen
           WHERE is_active = true
             AND (regexp_replace(phone, '[^0-9]', '', 'g') = $1
                  OR right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = right($1, 10))
           LIMIT 1`,
          [digits],
        );
        return rows[0] || null;
      });
    } catch (e: any) {
      // salesmen table may not exist on a very old schema — treat as "not a salesman".
      this.logger.debug(`salesman lookup skipped for ${schema}: ${e?.message}`);
      return null;
    }
  }

  /** Reply to a salesman with the button that opens their field app. */
  async sendApp(tenant: any, salesman: { name: string; access_token: string }, to: string): Promise<void> {
    const base = (this.config.get<string>('FRONTEND_URL', '') || '').replace(/\/$/, '');
    const url = `${base}/m/sales?t=${tenant.schemaName}&token=${salesman.access_token}`;
    const first = (salesman.name || '').split(' ')[0] || 'there';
    await this.whatsappApi.sendCtaUrl(
      tenant.phoneNumberId,
      tenant.accessToken,
      to,
      `👋 Hi ${first}! Tap below to open your Sales App — take orders for your customers, collect payments (cash / cheque / UPI) and check pending bills & promises.`,
      '🧾 Open Sales App',
      url,
      '🛍️ Salesman Field App',
      'Your personal link — do not share it.',
    ).catch((e: any) => this.logger.error(`Failed to send salesman app link: ${e?.message}`));
  }
}
