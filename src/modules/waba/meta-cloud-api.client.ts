import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaTokenService } from './meta-token.service';

interface MetaApiResponse<T = any> {
  data?: T;
  error?: { message: string; type: string; code: number };
}

@Injectable()
export class MetaCloudApiClient {
  private readonly logger = new Logger(MetaCloudApiClient.name);
  private readonly graphApiVersion: string;
  private readonly graphApiBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly tokenService: MetaTokenService,
  ) {
    this.graphApiVersion = this.config.get<string>('META_GRAPH_API_VERSION', 'v21.0');
    this.graphApiBaseUrl = `https://graph.facebook.com/${this.graphApiVersion}`;
  }

  async getWabaInfo(wabaId: string, accessToken: string): Promise<any> {
    return this.request('GET', `/${wabaId}`, accessToken, null, {
      fields: 'name',
    });
  }

  async getPhoneNumbers(wabaId: string, accessToken: string): Promise<any[]> {
    try {
      const response = await this.request('GET', `/${wabaId}/phone_numbers`, accessToken, null, {
        fields: 'id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,is_official_business_account',
      });
      return response.data || [];
    } catch (error: any) {
      // Meta returns "(#100) Tried accessing nonexisting field (phone_numbers)" when the
      // supplied ID is NOT a WhatsApp Business Account (e.g. a Facebook App ID or Business
      // Portfolio ID). Translate this into an actionable error instead of a cryptic 500.
      if (/nonexisting field \(phone_numbers\)/i.test(error?.message || '')) {
        throw new Error(
          `The ID "${wabaId}" is not a WhatsApp Business Account (WABA) ID — Meta does not expose ` +
          `phone numbers on it. You most likely entered a Facebook App ID or Business Portfolio ID. ` +
          `Find your WABA ID in WhatsApp Manager (business.facebook.com/wa/manage) → Account tools → ` +
          `Settings, or in Meta Business Settings → Accounts → WhatsApp accounts. It is a 15–16 digit ` +
          `number labelled "WhatsApp Business Account ID".`,
        );
      }
      throw error;
    }
  }

  async registerPhoneNumber(phoneNumberId: string, pin: string): Promise<void> {
    const token = await this.getSystemToken();
    await this.request('POST', `/${phoneNumberId}/register`, token, {
      messaging_product: 'whatsapp',
      pin,
    });
  }

  async requestVerificationCode(phoneNumberId: string, codeMethod: 'SMS' | 'VOICE'): Promise<void> {
    const token = await this.getSystemToken();
    await this.request('POST', `/${phoneNumberId}/request_code`, token, {
      code_method: codeMethod,
      language: 'en',
    });
  }

  async verifyCode(phoneNumberId: string, code: string): Promise<void> {
    const token = await this.getSystemToken();
    await this.request('POST', `/${phoneNumberId}/verify_code`, token, { code });
  }

  async sendMessage(phoneNumberId: string, accessToken: string, payload: any): Promise<any> {
    return this.request('POST', `/${phoneNumberId}/messages`, accessToken, payload);
  }

  async getTemplates(wabaId: string, accessToken: string): Promise<any[]> {
    const response = await this.request('GET', `/${wabaId}/message_templates`, accessToken, null, {
      fields: 'name,category,language,status,components,quality_score',
      limit: '100',
    });
    return response.data || [];
  }

  async createTemplate(wabaId: string, accessToken: string, templateData: any): Promise<any> {
    return this.request('POST', `/${wabaId}/message_templates`, accessToken, templateData);
  }

  async deleteTemplate(wabaId: string, accessToken: string, templateName: string): Promise<void> {
    await this.request('DELETE', `/${wabaId}/message_templates`, accessToken, null, {
      name: templateName,
    });
  }

  async getBusinessProfile(phoneNumberId: string, accessToken: string): Promise<any> {
    const response = await this.request('GET', `/${phoneNumberId}/whatsapp_business_profile`, accessToken, null, {
      fields: 'about,address,description,email,profile_picture_url,websites,vertical',
    });
    return response.data?.[0] || {};
  }

  async updateBusinessProfile(phoneNumberId: string, accessToken: string, profile: any): Promise<void> {
    await this.request('POST', `/${phoneNumberId}/whatsapp_business_profile`, accessToken, {
      messaging_product: 'whatsapp',
      ...profile,
    });
  }

  /**
   * Request a new display name (verified_name) for a registered number.
   * Meta reviews display-name changes on live numbers before they take effect.
   * Throws if the change can't be requested (caller treats this as best-effort).
   */
  async requestDisplayName(phoneNumberId: string, accessToken: string, newDisplayName: string): Promise<void> {
    await this.request('POST', `/${phoneNumberId}`, accessToken, {
      new_display_name: newDisplayName,
    });
  }

  private async getSystemToken(): Promise<string> {
    // For platform-level operations, use the first active WABA's token
    // In production, this should resolve to the correct WABA based on context
    return this.tokenService.getActiveToken('system', 'system_user').catch(() => {
      return this.config.get<string>('META_SYSTEM_USER_TOKEN', '');
    });
  }

  private async request(method: string, path: string, accessToken: string, body?: any, params?: Record<string, string>): Promise<any> {
    const url = new URL(`${this.graphApiBaseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
      const response = await fetch(url.toString(), options);
      const data = await response.json();

      if (!response.ok) {
        this.logger.error(`Meta API error: ${JSON.stringify(data.error)}`, `${method} ${path}`);
        throw new Error(data.error?.message || `Meta API request failed with status ${response.status}`);
      }

      return data;
    } catch (error: any) {
      this.logger.error(`Meta API request failed: ${error?.message}`, error?.stack);
      throw error;
    }
  }
}
