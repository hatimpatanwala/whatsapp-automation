import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Generates System User Tokens from user-provided access tokens.
 *
 * Flow (per Meta docs):
 * 1. User grants permissions via Embedded Signup → we get a short-lived user token
 * 2. Exchange short-lived token for a long-lived token (60-day)
 * 3. Use the long-lived token to create a System User in the business
 * 4. Assign WABA permissions to the System User
 * 5. Generate a System User Access Token (never expires)
 *
 * The system user token is what we use for all API calls — it doesn't expire
 * and isn't tied to a specific user's Facebook session.
 */
@Injectable()
export class SystemTokenService {
  private readonly logger = new Logger(SystemTokenService.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly graphApiVersion: string;
  private readonly systemUserId: string;

  constructor(private readonly config: ConfigService) {
    this.appId = this.config.get<string>('META_APP_ID', '');
    this.appSecret = this.config.get<string>('META_APP_SECRET', '');
    this.graphApiVersion = this.config.get<string>('META_GRAPH_API_VERSION', 'v21.0');
    this.systemUserId = this.config.get<string>('META_SYSTEM_USER_ID', '');
  }

  /**
   * Exchange a short-lived user token for a long-lived token (60-day expiry).
   */
  async exchangeForLongLivedToken(shortLivedToken: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`;
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: shortLivedToken,
    });

    const response = await fetch(`${url}?${params}`);
    const data = await response.json() as any;

    if (!response.ok) {
      this.logger.error(`Long-lived token exchange failed: ${JSON.stringify(data.error)}`);
      throw new Error(data.error?.message || 'Failed to exchange for long-lived token');
    }

    return data;
  }

  /**
   * Generate a System User Access Token for API operations.
   *
   * If META_SYSTEM_USER_ID is configured, assigns WABA permissions to that system user
   * and generates a token. Otherwise, falls back to using the long-lived user token.
   */
  async generateSystemUserToken(
    longLivedToken: string,
    businessId: string,
    wabaId: string,
  ): Promise<{ token: string; isSystemUser: boolean }> {
    if (!this.systemUserId) {
      this.logger.warn('META_SYSTEM_USER_ID not configured — using long-lived user token as fallback');
      return { token: longLivedToken, isSystemUser: false };
    }

    try {
      // Step 1: Assign WABA to system user with full permissions
      await this.assignWabaToSystemUser(businessId, wabaId, longLivedToken);

      // Step 2: Generate system user access token
      const token = await this.generateTokenForSystemUser(businessId, longLivedToken);

      return { token, isSystemUser: true };
    } catch (err: any) {
      this.logger.warn(`System user token generation failed: ${err.message}. Falling back to long-lived token.`);
      return { token: longLivedToken, isSystemUser: false };
    }
  }

  /**
   * Assign WABA permissions to the platform's system user.
   */
  private async assignWabaToSystemUser(
    businessId: string,
    wabaId: string,
    adminToken: string,
  ): Promise<void> {
    // Assign the WABA asset to system user with MANAGE permission
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${this.systemUserId}/assigned_pages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        page_id: wabaId,
        tasks: ['MANAGE'],
      }),
    });

    if (!response.ok) {
      // Try alternative: assign via business asset
      await this.assignViaBusinessAsset(businessId, wabaId, adminToken);
    }
  }

  /**
   * Alternative WABA assignment via business asset endpoint.
   */
  private async assignViaBusinessAsset(
    businessId: string,
    wabaId: string,
    adminToken: string,
  ): Promise<void> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${businessId}/client_whatsapp_business_accounts`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        whatsapp_business_account_id: wabaId,
        permitted_tasks: ['MANAGE'],
      }),
    });

    const data = await response.json() as any;
    if (!response.ok) {
      this.logger.warn(`Business asset assignment failed: ${JSON.stringify(data.error)}`);
      // Non-fatal — the user token may already have sufficient permissions
    }
  }

  /**
   * Generate a token for the system user.
   */
  private async generateTokenForSystemUser(
    businessId: string,
    adminToken: string,
  ): Promise<string> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${this.systemUserId}/access_tokens`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        business_app: this.appId,
        scope: 'whatsapp_business_management,whatsapp_business_messaging',
        appsecret_proof: await this.computeAppSecretProof(adminToken),
      }),
    });

    const data = await response.json() as any;
    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to generate system user token');
    }

    return data.access_token;
  }

  /**
   * Compute appsecret_proof for API calls.
   */
  private async computeAppSecretProof(token: string): Promise<string> {
    const { createHmac } = await import('crypto');
    return createHmac('sha256', this.appSecret).update(token).digest('hex');
  }
}
