import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { MetaToken } from '../../database/entities/public/meta-token.entity';
import { MetaTokenService } from '../waba/meta-token.service';

export interface RegisterNumberResult {
  status: 'already_business' | 'already_occupied' | 'registered' | 'needs_verification';
  phone: string;
  message: string;
  phoneId?: string;
  needsVerification?: boolean;
  instructions?: string[];
}

export interface BusinessProfileDto {
  businessName: string;
  businessCategory: string;
  businessDescription?: string;
  businessAddress?: string;
  logoUrl?: string;
}

/**
 * Onboarding status progression (simplified):
 *   pending → whatsapp_connected → profile_complete → completed
 *
 * Architecture:
 *   - The PLATFORM owns the shared WABA (Business Phone System / BPS)
 *   - User provides their phone number
 *   - Platform registers that number under its shared WABA via Meta Cloud API
 *   - Number is assigned exclusively to the tenant (no other tenant can use it)
 *   - User does NOT need a Facebook/Meta account
 */
export type OnboardingStep = 'pending' | 'phone_verified' | 'whatsapp_connected' | 'profile_complete' | 'completed';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly graphApiVersion: string;

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumberRepository: Repository<PhoneNumber>,
    @InjectRepository(MetaToken)
    private readonly metaTokenRepository: Repository<MetaToken>,
    @InjectRepository(WabaAccount)
    private readonly wabaAccountRepository: Repository<WabaAccount>,
    private readonly metaTokenService: MetaTokenService,
    private readonly configService: ConfigService,
  ) {
    this.graphApiVersion = this.configService.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  async getStatus(tenantId: string) {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: [
        'id', 'onboardingStatus', 'whatsappPhone', 'phoneNumberId',
        'wabaId', 'businessName', 'businessCategory', 'businessDescription',
        'businessAddress', 'logoUrl',
      ],
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return {
      currentStep: tenant.onboardingStatus as OnboardingStep,
      phone: tenant.whatsappPhone || null,
      hasWhatsAppConfig: !!tenant.phoneNumberId && !!tenant.wabaId,
      businessName: tenant.businessName || null,
      businessCategory: tenant.businessCategory || null,
      businessDescription: tenant.businessDescription || null,
      businessAddress: tenant.businessAddress || null,
      logoUrl: tenant.logoUrl || null,
    };
  }

  /**
   * Step 1: Register a phone number under the platform's shared WABA.
   *
   * Flow:
   * 1. Normalize & validate the phone number
   * 2. Check if it's already in our pool (assigned to another tenant or this tenant)
   * 3. Try to register on Meta via POST /{waba_id}/phone_numbers
   * 4. Parse Meta response:
   *    - Success → save with phoneNumberId, mark needs_verification
   *    - "already registered" error → tell user to delete WA Business / remove from other BSP
   *    - Other error → save locally for admin to fix later
   */
  async registerNumber(tenantId: string, phone: string): Promise<RegisterNumberResult> {
    // Normalize phone
    const normalized = phone.replace(/[\s\-()]/g, '');
    if (!/^\+?\d{10,15}$/.test(normalized)) {
      throw new BadRequestException('Invalid phone number format. Use international format, e.g. +91XXXXXXXXXX');
    }
    const fullPhone = normalized.startsWith('+') ? normalized : `+${normalized}`;

    // Check 1: Is this number already in our pool?
    const existingInPool = await this.phoneNumberRepository.findOne({
      where: { phoneNumber: fullPhone },
    });

    if (existingInPool) {
      if (existingInPool.tenantId === tenantId) {
        // Already assigned to this tenant — ensure tenant record is in sync
        // If phone_number_id is missing, try to resolve it from Meta
        if (!existingInPool.phoneNumberId && existingInPool.wabaAccountId) {
          await this.syncPhoneNumberIdFromMeta(existingInPool);
        }
        await this.updateTenantWithPhone(tenantId, fullPhone, existingInPool);
        return {
          status: 'registered',
          phone: fullPhone,
          message: 'This number is already registered to your account.',
          phoneId: existingInPool.id,
        };
      }
      if (existingInPool.tenantId) {
        return {
          status: 'already_occupied',
          phone: fullPhone,
          message: 'This number is already in use by another account on the platform.',
        };
      }
      // Exists but unassigned — assign to this tenant
      await this.phoneNumberRepository.update(existingInPool.id, {
        tenantId,
        status: 'active',
      });

      // If phone_number_id is missing, try to resolve it from Meta
      if (!existingInPool.phoneNumberId && existingInPool.wabaAccountId) {
        await this.syncPhoneNumberIdFromMeta(existingInPool);
      }

      await this.updateTenantWithPhone(tenantId, fullPhone, existingInPool);
      return {
        status: 'registered',
        phone: fullPhone,
        message: 'Number activated and assigned to your account!',
        phoneId: existingInPool.id,
      };
    }

    // Check 2: Get the platform's shared WABA
    const platformWaba = await this.getPlatformWaba();
    if (!platformWaba) {
      throw new BadRequestException(
        'Platform WhatsApp Business Account is not configured. Please contact support.',
      );
    }

    // Check 3: Get the platform's access token
    const accessToken = await this.metaTokenService.getActiveToken(platformWaba.id);
    if (!accessToken) {
      throw new BadRequestException(
        'Platform access token is not configured. Please contact the administrator.',
      );
    }

    // Step 4: Try to register the number on Meta — this is the single source of truth.
    // Meta will tell us if the number is already on another WABA, has WA Business, etc.
    const registrationResult = await this.registerPhoneOnMeta(
      fullPhone,
      platformWaba.wabaId,
      accessToken,
    );

    // If Meta said the number is already taken (on another WABA, WA Business app, or BSP)
    if (registrationResult.alreadyTaken) {
      return {
        status: 'already_business',
        phone: fullPhone,
        message: registrationResult.errorMessage!,
        instructions: registrationResult.instructions,
      };
    }

    // Step 5: Save to our pool and assign to tenant
    const phoneRecord = this.phoneNumberRepository.create({
      wabaAccountId: platformWaba.id,
      phoneNumber: fullPhone,
      phoneNumberId: registrationResult.phoneNumberId || null,
      displayName: fullPhone,
      status: registrationResult.phoneNumberId ? 'pending_verification' : 'pending_registration',
      registrationStatus: registrationResult.phoneNumberId ? 'pending' : 'not_started',
      tenantId,
    });
    await this.phoneNumberRepository.save(phoneRecord);

    // Step 6: Update tenant record
    await this.updateTenantWithPhone(tenantId, fullPhone, phoneRecord);

    this.logger.log(`Phone ${fullPhone} registered under platform WABA for tenant ${tenantId}`);

    // If we got a phoneNumberId back, the number needs OTP verification
    if (registrationResult.phoneNumberId) {
      return {
        status: 'needs_verification',
        phone: fullPhone,
        message: 'Number added to our platform! Please verify it with the SMS code sent to this number.',
        phoneId: phoneRecord.id,
        needsVerification: true,
      };
    }

    // Meta API failed but we saved locally — admin can fix
    return {
      status: 'registered',
      phone: fullPhone,
      message: 'Number saved. It will be activated once the administrator completes setup on Meta.',
      phoneId: phoneRecord.id,
    };
  }

  /**
   * Request a verification code for a phone number (SMS or voice call).
   */
  async requestVerificationCode(tenantId: string, phoneId: string, method: 'sms' | 'voice' = 'sms') {
    const phone = await this.phoneNumberRepository.findOne({
      where: { id: phoneId, tenantId },
    });
    if (!phone) throw new NotFoundException('Phone number not found');
    if (!phone.phoneNumberId) throw new BadRequestException('Phone number has no Meta ID yet. Contact administrator.');

    const platformWaba = await this.getPlatformWaba();
    const accessToken = await this.metaTokenService.getActiveToken(platformWaba!.id);

    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${phone.phoneNumberId}/request_code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ code_method: method.toUpperCase(), language: 'en_US' }),
        },
      );
      const data = await response.json() as any;
      if (!response.ok) {
        throw new BadRequestException(data.error?.message || 'Failed to request verification code');
      }

      await this.phoneNumberRepository.update(phone.id, {
        codeVerificationStatus: 'code_sent',
      });

      return { sent: true, method, message: `Verification code sent via ${method.toUpperCase()}` };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`Verification code request failed: ${err.message}`);
      throw new BadRequestException('Failed to request verification code. Please try again.');
    }
  }

  /**
   * Verify the phone number with the code received via SMS/voice.
   * On success, marks the number as active.
   */
  async verifyNumber(tenantId: string, phoneId: string, code: string) {
    const phone = await this.phoneNumberRepository.findOne({
      where: { id: phoneId, tenantId },
    });
    if (!phone) throw new NotFoundException('Phone number not found');
    if (!phone.phoneNumberId) throw new BadRequestException('Phone number has no Meta ID yet. Contact administrator.');

    const platformWaba = await this.getPlatformWaba();
    const accessToken = await this.metaTokenService.getActiveToken(platformWaba!.id);

    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${phone.phoneNumberId}/verify_code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ code }),
        },
      );
      const data = await response.json() as any;
      if (!response.ok) {
        throw new BadRequestException(data.error?.message || 'Invalid verification code');
      }

      // Mark phone as verified and active
      await this.phoneNumberRepository.update(phone.id, {
        status: 'active',
        registrationStatus: 'registered',
        codeVerificationStatus: 'verified',
      });

      // Also update tenant with the phoneNumberId if not already set
      const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
      if (tenant && !tenant.phoneNumberId) {
        await this.tenantRepository.update(tenantId, {
          phoneNumberId: phone.phoneNumberId,
        });
      }

      return { verified: true, message: 'Phone number verified and activated!' };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`Verification failed: ${err.message}`);
      throw new BadRequestException('Verification failed. Please check the code and try again.');
    }
  }

  /**
   * Save business profile information.
   */
  async saveBusinessProfile(tenantId: string, dto: BusinessProfileDto) {
    if (!dto.businessName?.trim()) {
      throw new BadRequestException('Business name is required');
    }

    await this.tenantRepository.update(tenantId, {
      businessName: dto.businessName,
      businessCategory: dto.businessCategory,
      businessDescription: dto.businessDescription || null,
      businessAddress: dto.businessAddress || null,
      logoUrl: dto.logoUrl || null,
      name: dto.businessName,
      onboardingStatus: 'profile_complete',
    });

    this.logger.log(`Business profile saved for tenant ${tenantId}`);
    return { saved: true };
  }

  /**
   * Mark onboarding as completed.
   */
  async completeOnboarding(tenantId: string) {
    await this.tenantRepository.update(tenantId, {
      onboardingStatus: 'completed',
    });
    this.logger.log(`Onboarding completed for tenant ${tenantId}`);
    return { completed: true };
  }

  /**
   * Skip onboarding (allow user to set up later from settings).
   */
  async skipOnboarding(tenantId: string) {
    await this.tenantRepository.update(tenantId, {
      onboardingStatus: 'completed',
    });
    return { skipped: true };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async getPlatformWaba(): Promise<WabaAccount | null> {
    return this.wabaAccountRepository.findOne({
      where: { status: 'active' },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Register a phone number under the platform's shared WABA via Meta Cloud API.
   * POST /{waba_id}/phone_numbers
   *
   * This is the SINGLE source of truth for detecting:
   * - Numbers already on another WABA (WATI, Gupshup, Interakt, etc.)
   * - Numbers with WhatsApp Business app
   * - Numbers with regular WhatsApp (these can be registered — user gets OTP)
   * - Clean numbers with no WhatsApp (these can be registered — user gets OTP)
   */
  private async registerPhoneOnMeta(
    phone: string,
    wabaId: string,
    accessToken: string,
  ): Promise<{
    phoneNumberId: string | null;
    alreadyTaken: boolean;
    errorMessage?: string;
    instructions?: string[];
  }> {
    try {
      const rawNumber = phone.replace(/^\+/, '');
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
            migrate_phone_number: false,
          }),
        },
      );
      const data = await response.json() as any;

      if (response.ok && data.id) {
        this.logger.log(`Phone ${phone} registered on Meta WABA ${wabaId}, phone_number_id: ${data.id}`);
        return { phoneNumberId: data.id, alreadyTaken: false };
      }

      // Parse Meta error to give meaningful feedback
      const errorMsg = data.error?.message || '';
      const errorCode = data.error?.code;
      const errorSubcode = data.error?.error_subcode;

      this.logger.warn(`Meta registration failed for ${phone}: [${errorCode}/${errorSubcode}] ${errorMsg}`);

      // Detect "already registered" scenarios
      if (this.isAlreadyRegisteredError(errorMsg, errorCode, errorSubcode)) {
        return {
          phoneNumberId: null,
          alreadyTaken: true,
          errorMessage: 'This phone number is already registered with WhatsApp Business on another platform.',
          instructions: [
            'If you have WhatsApp Business app: Open WhatsApp Business → Settings → Account → Delete Account',
            'If your number is on WATI, Gupshup, Interakt, or another BSP: Remove the number from that platform\'s dashboard first',
            'After removing, wait 5 minutes for Meta to release the number',
            'Then come back here and try registering again',
          ],
        };
      }

      // Detect "regular WhatsApp" — this should NOT happen for POST (regular WA numbers CAN be registered)
      // But if Meta returns a specific conflict for regular WA:
      if (this.isRegularWhatsAppError(errorMsg, errorCode, errorSubcode)) {
        return {
          phoneNumberId: null,
          alreadyTaken: true,
          errorMessage: 'This phone number has regular WhatsApp installed. You need to delete it before using WhatsApp Business API.',
          instructions: [
            'Open WhatsApp on your phone',
            'Go to Settings → Account → Delete my account',
            'Wait 5 minutes after deletion',
            'Come back here and register the number again',
            'Note: You will lose your WhatsApp chat history on this number',
          ],
        };
      }

      // Other Meta API errors — save locally for admin to fix
      this.logger.warn(`Unrecognized Meta error for ${phone}: ${JSON.stringify(data)}`);
      return { phoneNumberId: null, alreadyTaken: false };
    } catch (err: any) {
      this.logger.warn(`Meta phone registration network error: ${err.message}`);
      return { phoneNumberId: null, alreadyTaken: false };
    }
  }

  /**
   * Detect if Meta error means the number is already registered on another WABA/BSP.
   */
  private isAlreadyRegisteredError(msg: string, code?: number, subcode?: number): boolean {
    const lowerMsg = msg.toLowerCase();
    // Common Meta error patterns for already-registered numbers
    if (lowerMsg.includes('already registered')) return true;
    if (lowerMsg.includes('already being used')) return true;
    if (lowerMsg.includes('belongs to another')) return true;
    if (lowerMsg.includes('already connected')) return true;
    if (lowerMsg.includes('phone number is associated')) return true;
    if (lowerMsg.includes('migrate_phone_number')) return true;
    // Meta error code 100 with subcode 2388093 = phone already in use by another business
    if (code === 100 && subcode === 2388093) return true;
    // Error code 368 = temporarily blocked (often means number is in use)
    if (code === 368) return true;
    return false;
  }

  /**
   * Detect if Meta error means the number has regular WhatsApp (not Business).
   * Note: In most cases, regular WhatsApp numbers CAN be registered via Cloud API
   * and the user just gets an OTP. This handles edge cases where Meta explicitly blocks it.
   */
  private isRegularWhatsAppError(msg: string, code?: number, subcode?: number): boolean {
    const lowerMsg = msg.toLowerCase();
    if (lowerMsg.includes('whatsapp account exists') && !lowerMsg.includes('business')) return true;
    if (lowerMsg.includes('delete your whatsapp account')) return true;
    return false;
  }

  /**
   * Extract country code from a raw phone number (without +).
   * Uses a simple heuristic based on well-known country codes.
   */
  private extractCountryCode(rawNumber: string): string {
    // Check 3-digit codes first, then 2-digit, then 1-digit
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
    // Fallback: assume first 2 digits
    return rawNumber.substring(0, 2);
  }

  /**
   * Try to resolve the Meta phone_number_id by listing phone numbers on the WABA
   * and matching by display phone number. Updates the phone record if found.
   */
  private async syncPhoneNumberIdFromMeta(phoneRecord: PhoneNumber): Promise<void> {
    try {
      const waba = await this.wabaAccountRepository.findOne({ where: { id: phoneRecord.wabaAccountId } });
      if (!waba) return;

      const accessToken = await this.metaTokenService.getActiveToken(waba.id);
      if (!accessToken) return;

      const response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${waba.wabaId}/phone_numbers`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const data = await response.json() as any;
      if (!data.data) return;

      // Normalize the stored phone for matching
      const normalized = phoneRecord.phoneNumber.replace(/[^0-9]/g, '');

      for (const metaPhone of data.data) {
        const metaDisplay = (metaPhone.display_phone_number || '').replace(/[^0-9]/g, '');
        if (metaDisplay === normalized || normalized.endsWith(metaDisplay) || metaDisplay.endsWith(normalized)) {
          await this.phoneNumberRepository.update(phoneRecord.id, {
            phoneNumberId: metaPhone.id,
            displayName: metaPhone.verified_name || phoneRecord.displayName,
            qualityRating: metaPhone.quality_rating || phoneRecord.qualityRating,
          });
          phoneRecord.phoneNumberId = metaPhone.id;
          this.logger.log(`Synced phone_number_id=${metaPhone.id} from Meta for phone ${phoneRecord.phoneNumber}`);
          return;
        }
      }
      this.logger.warn(`Could not find Meta phone_number_id for ${phoneRecord.phoneNumber} on WABA ${waba.wabaId}`);
    } catch (err: any) {
      this.logger.error(`Failed to sync phone_number_id from Meta: ${err.message}`);
    }
  }

  private async updateTenantWithPhone(tenantId: string, phone: string, phoneRecord: PhoneNumber) {
    // Re-fetch the phone record to get the latest data (in case it was just updated)
    const freshPhone = await this.phoneNumberRepository.findOne({
      where: { id: phoneRecord.id },
      relations: ['wabaAccount'],
    });
    const record = freshPhone || phoneRecord;

    const updateData: Partial<Tenant> = {
      whatsappPhone: phone,
      onboardingStatus: 'whatsapp_connected' as any,
    };
    if (record.phoneNumberId) {
      updateData.phoneNumberId = record.phoneNumberId;
    }
    if (record.wabaAccountId) {
      const wabaId = record.wabaAccount?.wabaId
        || (await this.wabaAccountRepository.findOne({ where: { id: record.wabaAccountId } }))?.wabaId;
      if (wabaId) {
        updateData.wabaId = wabaId;
      }
    }
    this.logger.log(
      `Updating tenant ${tenantId} with phone data: phoneNumberId=${record.phoneNumberId}, wabaId=${updateData.wabaId}, phone=${phone}`,
    );
    await this.tenantRepository.update(tenantId, updateData);
  }
}
