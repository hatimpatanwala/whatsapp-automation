import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaTokenService } from '../meta-token.service';
import { PlatformConfigService } from '../../platform-config/platform-config.service';

/**
 * Attaches the PLATFORM's credit line to a customer's WABA (Tech-Provider credit
 * sharing), so all of that WABA's WhatsApp messaging is billed to the platform.
 *
 * Important: attaching the credit line means the PLATFORM pays Meta directly —
 * the customer is NEVER charged by Meta. We pass no reseller markup / partner
 * billing parameters, so nothing is billed onward to the customer here.
 *
 * Endpoint: POST /{credit_line_id}/whatsapp_credit_sharing_and_attach
 *   - waba_id:        the customer's WhatsApp Business Account id
 *   - waba_currency:  the currency the platform is billed in
 * Requires a platform (credit-line-owning business) token with business_management.
 */
@Injectable()
export class CreditLineService {
  private readonly logger = new Logger(CreditLineService.name);
  private readonly graphApiVersion: string;

  constructor(
    private readonly config: ConfigService,
    private readonly tokenService: MetaTokenService,
    private readonly platformConfig: PlatformConfigService,
  ) {
    this.graphApiVersion = this.config.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  /**
   * Attach the platform credit line to a customer WABA. Tolerant: returns a
   * structured result and never throws — billing setup must not break onboarding.
   * Skips silently (attached:false, reason) when sharing is disabled or unconfigured.
   */
  async attachPlatformCreditLine(
    customerMetaWabaId: string,
  ): Promise<{ attached: boolean; allocationConfigId?: string; reason?: string }> {
    const { enabled, creditLineId, currency } = await this.platformConfig.getCreditLineConfig();
    if (!enabled) return { attached: false, reason: 'Credit-line sharing is disabled.' };
    if (!creditLineId) return { attached: false, reason: 'No platform credit line id configured.' };

    const token = await this.resolvePlatformToken();
    if (!token) return { attached: false, reason: 'No platform system-user token available.' };

    try {
      const url = new URL(
        `https://graph.facebook.com/${this.graphApiVersion}/${creditLineId}/whatsapp_credit_sharing_and_attach`,
      );
      url.searchParams.set('waba_id', customerMetaWabaId);
      url.searchParams.set('waba_currency', currency);

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as any;
      this.logger.log(
        `Credit-line attach for WABA ${customerMetaWabaId} → HTTP ${res.status} ${JSON.stringify(data)}`,
      );

      if (res.ok && (data.allocation_config_id || data.receiving_business_id || data.success)) {
        return { attached: true, allocationConfigId: data.allocation_config_id };
      }
      const reason = data?.error?.message || `Unexpected response (HTTP ${res.status})`;
      this.logger.warn(`Credit-line attach not applied for WABA ${customerMetaWabaId}: ${reason}`);
      return { attached: false, reason };
    } catch (err: any) {
      this.logger.warn(`Credit-line attach error for WABA ${customerMetaWabaId}: ${err.message}`);
      return { attached: false, reason: err.message };
    }
  }

  /**
   * Resolve a token belonging to the platform's credit-line-owning business.
   * Prefers the platform system-user token (env), then the shared "system" token
   * stored in meta_tokens — mirroring MetaCloudApiClient's resolution.
   */
  private async resolvePlatformToken(): Promise<string | null> {
    const envToken = this.config.get<string>('META_SYSTEM_USER_TOKEN', '');
    if (envToken) return envToken;
    try {
      const tok = await this.tokenService.getActiveToken('system', 'system_user');
      return tok || null;
    } catch {
      return null;
    }
  }
}
