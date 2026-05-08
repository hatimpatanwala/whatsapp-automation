import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DetectionResult {
  /** What state was detected */
  state: 'fresh' | 'regular_wa' | 'business_wa' | 'other_bsp' | 'unknown';
  /** Whether registration succeeded (got a phone_number_id back) */
  registered: boolean;
  /** Meta phone_number_id if registration succeeded */
  phoneNumberId: string | null;
  /** Raw Meta error code */
  errorCode?: number;
  /** Raw Meta error subcode */
  errorSubcode?: number;
  /** Raw error message from Meta */
  errorMessage?: string;
  /** Detected BSP provider name if identifiable */
  detectedProvider?: string;
  /** Human-readable summary */
  summary: string;
}

/**
 * Detects the current state of a phone number on the WhatsApp network
 * by attempting to register it under the platform's shared WABA.
 *
 * Meta's POST /{waba_id}/phone_numbers is the single source of truth.
 * The error response reveals whether the number is:
 *   - Fresh (no WhatsApp at all) → registration succeeds
 *   - Regular WhatsApp user → registration usually succeeds (user gets OTP)
 *   - WhatsApp Business app user → error code 100/2388093
 *   - Registered on another BSP/WABA → error code 100/2388093 or 368
 */
@Injectable()
export class NumberStateDetectorService {
  private readonly logger = new Logger(NumberStateDetectorService.name);
  private readonly graphApiVersion: string;

  constructor(private readonly configService: ConfigService) {
    this.graphApiVersion = this.configService.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  /**
   * Attempt to register a phone number on Meta and interpret the result.
   */
  async detectViaRegistration(
    phone: string,
    wabaId: string,
    accessToken: string,
    verifiedName?: string,
  ): Promise<DetectionResult> {
    const rawNumber = phone.replace(/^\+/, '');

    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${wabaId}/phone_numbers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            cc: this.extractCountryCode(rawNumber),
            phone_number: rawNumber,
            verified_name: verifiedName || 'Business',
            migrate_phone_number: false,
          }),
        },
      );

      const data = await response.json() as any;

      // Success — number registered (fresh or regular WA user)
      if (response.ok && data.id) {
        this.logger.log(`Phone ${phone} registered successfully, phone_number_id: ${data.id}`);
        return {
          state: 'fresh',
          registered: true,
          phoneNumberId: data.id,
          summary: 'Number registered successfully. OTP verification required.',
        };
      }

      // Parse the error
      const errorMsg = data.error?.message || '';
      const errorCode = data.error?.code;
      const errorSubcode = data.error?.error_subcode;

      this.logger.warn(`Meta detection for ${phone}: [${errorCode}/${errorSubcode}] ${errorMsg}`);

      // Classify the error
      if (this.isAlreadyOnAnotherBsp(errorMsg, errorCode, errorSubcode)) {
        const provider = this.detectProvider(errorMsg);
        return {
          state: 'other_bsp',
          registered: false,
          phoneNumberId: null,
          errorCode,
          errorSubcode,
          errorMessage: errorMsg,
          detectedProvider: provider,
          summary: `Number is registered on another BSP${provider ? ` (${provider})` : ''}. Must be removed from that platform first.`,
        };
      }

      if (this.isBusinessWaApp(errorMsg, errorCode, errorSubcode)) {
        return {
          state: 'business_wa',
          registered: false,
          phoneNumberId: null,
          errorCode,
          errorSubcode,
          errorMessage: errorMsg,
          summary: 'Number has WhatsApp Business app installed. Must delete the app account first.',
        };
      }

      if (this.isRegularWa(errorMsg, errorCode, errorSubcode)) {
        return {
          state: 'regular_wa',
          registered: false,
          phoneNumberId: null,
          errorCode,
          errorSubcode,
          errorMessage: errorMsg,
          summary: 'Number has regular WhatsApp. Must delete WhatsApp account first.',
        };
      }

      // Unknown error
      return {
        state: 'unknown',
        registered: false,
        phoneNumberId: null,
        errorCode,
        errorSubcode,
        errorMessage: errorMsg,
        summary: `Registration failed with unexpected error: ${errorMsg}`,
      };
    } catch (err: any) {
      this.logger.error(`Network error during detection for ${phone}: ${err.message}`);
      return {
        state: 'unknown',
        registered: false,
        phoneNumberId: null,
        errorMessage: err.message,
        summary: `Network error: ${err.message}`,
      };
    }
  }

  private isAlreadyOnAnotherBsp(msg: string, code?: number, subcode?: number): boolean {
    const lower = msg.toLowerCase();
    if (lower.includes('already registered')) return true;
    if (lower.includes('already being used')) return true;
    if (lower.includes('belongs to another')) return true;
    if (lower.includes('already connected')) return true;
    if (lower.includes('phone number is associated')) return true;
    if (lower.includes('migrate_phone_number')) return true;
    if (code === 100 && subcode === 2388093) return true;
    if (code === 368) return true;
    return false;
  }

  private isBusinessWaApp(msg: string, code?: number, subcode?: number): boolean {
    const lower = msg.toLowerCase();
    if (lower.includes('whatsapp business') && lower.includes('delete')) return true;
    if (lower.includes('business app') && lower.includes('account')) return true;
    return false;
  }

  private isRegularWa(msg: string, code?: number, subcode?: number): boolean {
    const lower = msg.toLowerCase();
    if (lower.includes('whatsapp account exists') && !lower.includes('business')) return true;
    if (lower.includes('delete your whatsapp account')) return true;
    return false;
  }

  /**
   * Try to identify the BSP from the error message.
   * Meta sometimes includes hints in the error.
   */
  private detectProvider(errorMsg: string): string | undefined {
    const lower = errorMsg.toLowerCase();
    const providers: Record<string, string[]> = {
      wati: ['wati'],
      gupshup: ['gupshup'],
      interakt: ['interakt'],
      twilio: ['twilio'],
      infobip: ['infobip'],
      messagebird: ['messagebird', 'bird'],
      vonage: ['vonage'],
      sinch: ['sinch'],
      '360dialog': ['360dialog', '360 dialog'],
      respond_io: ['respond.io'],
    };

    for (const [provider, keywords] of Object.entries(providers)) {
      if (keywords.some(kw => lower.includes(kw))) return provider;
    }
    return undefined;
  }

  private extractCountryCode(rawNumber: string): string {
    const threeCodes = ['880', '971', '966', '234', '263'];
    const twoCodes = ['91', '44', '55', '27', '52', '49', '33', '62', '92', '63', '81', '82', '39', '34', '61'];
    const oneCodes = ['1', '7'];

    for (const cc of threeCodes) {
      if (rawNumber.startsWith(cc)) return cc;
    }
    for (const cc of twoCodes) {
      if (rawNumber.startsWith(cc)) return cc;
    }
    for (const cc of oneCodes) {
      if (rawNumber.startsWith(cc)) return cc;
    }
    return rawNumber.substring(0, 2);
  }
}
