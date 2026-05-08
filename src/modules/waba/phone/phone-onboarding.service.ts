import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { Tenant } from '../../../database/entities/public/tenant.entity';
import { MetaCloudApiClient } from '../meta-cloud-api.client';
import { MetaTokenService } from '../meta-token.service';
import { AuditLogService } from '../audit-log.service';

export interface OnboardingStatus {
  phoneId: string;
  step: 'pending' | 'code_requested' | 'code_verified' | 'registered' | 'profile_set' | 'webhook_subscribed' | 'complete';
  details: Record<string, any>;
}

@Injectable()
export class PhoneOnboardingService {
  private readonly logger = new Logger(PhoneOnboardingService.name);

  constructor(
    @InjectRepository(PhoneNumber)
    private readonly phoneRepo: Repository<PhoneNumber>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly metaApi: MetaCloudApiClient,
    private readonly tokenService: MetaTokenService,
    private readonly auditService: AuditLogService,
  ) {}

  /**
   * Get the current onboarding status for a phone number.
   */
  async getOnboardingStatus(phoneId: string): Promise<OnboardingStatus> {
    const phone = await this.phoneRepo.findOne({ where: { id: phoneId } });
    if (!phone) throw new BadRequestException('Phone number not found');

    let step: OnboardingStatus['step'] = 'pending';
    if (phone.codeVerificationStatus === 'code_sent') step = 'code_requested';
    if (phone.codeVerificationStatus === 'verified') step = 'code_verified';
    if (phone.registrationStatus === 'registered') step = 'registered';
    if (phone.webhookSubscribed) step = 'webhook_subscribed';
    if (phone.status === 'active' && phone.registrationStatus === 'registered' && phone.webhookSubscribed) {
      step = 'complete';
    }

    return {
      phoneId,
      step,
      details: {
        phoneNumber: phone.phoneNumber,
        displayName: phone.displayName,
        qualityRating: phone.qualityRating,
        registrationStatus: phone.registrationStatus,
        codeVerificationStatus: phone.codeVerificationStatus,
        webhookSubscribed: phone.webhookSubscribed,
        tenantId: phone.tenantId,
      },
    };
  }

  /**
   * Full onboarding flow: assign phone to tenant, register, set profile, subscribe webhooks.
   */
  async startOnboarding(phoneId: string, tenantId: string): Promise<OnboardingStatus> {
    const phone = await this.phoneRepo.findOne({ where: { id: phoneId }, relations: ['wabaAccount'] });
    if (!phone) throw new BadRequestException('Phone number not found');

    // Assign to tenant
    if (!phone.tenantId) {
      await this.phoneRepo.update(phoneId, { tenantId });

      // Update tenant with phone number reference
      await this.tenantRepo.update(tenantId, {
        phoneNumberId: phone.phoneNumberId,
        wabaId: phone.wabaAccount?.wabaId,
      });

      await this.auditService.log({
        tenantId,
        actorType: 'admin',
        actorId: 'system',
        action: 'phone.onboard_start',
        resourceType: 'phone_number',
        resourceId: phoneId,
      });
    }

    return this.getOnboardingStatus(phoneId);
  }

  /**
   * Step: Request verification code via SMS or Voice.
   */
  async requestCode(phoneId: string, method: 'SMS' | 'VOICE' = 'SMS'): Promise<void> {
    const phone = await this.phoneRepo.findOne({ where: { id: phoneId }, relations: ['wabaAccount'] });
    if (!phone) throw new BadRequestException('Phone number not found');

    const accessToken = await this.tokenService.getActiveToken(phone.wabaAccountId);

    await this.metaApi.requestVerificationCode(phone.phoneNumberId, method);
    await this.phoneRepo.update(phoneId, { codeVerificationStatus: 'code_sent' });

    this.logger.log(`Verification code requested for ${phone.phoneNumber} via ${method}`);
  }

  /**
   * Step: Verify the received code.
   */
  async verifyCode(phoneId: string, code: string): Promise<void> {
    const phone = await this.phoneRepo.findOne({ where: { id: phoneId } });
    if (!phone) throw new BadRequestException('Phone number not found');

    await this.metaApi.verifyCode(phone.phoneNumberId, code);
    await this.phoneRepo.update(phoneId, { codeVerificationStatus: 'verified' });

    this.logger.log(`Code verified for ${phone.phoneNumber}`);
  }

  /**
   * Step: Register the phone number with a 2FA PIN.
   */
  async register(phoneId: string, pin: string): Promise<void> {
    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
      throw new BadRequestException('PIN must be exactly 6 digits');
    }

    const phone = await this.phoneRepo.findOne({ where: { id: phoneId } });
    if (!phone) throw new BadRequestException('Phone number not found');

    await this.metaApi.registerPhoneNumber(phone.phoneNumberId, pin);
    await this.phoneRepo.update(phoneId, {
      registrationStatus: 'registered',
      status: 'active',
      isPinEnabled: true,
      lastOnboardedAt: new Date(),
    });

    this.logger.log(`Phone ${phone.phoneNumber} registered successfully`);
  }

  /**
   * Step: Set business profile for the phone number.
   */
  async setBusinessProfile(phoneId: string, profile: {
    about?: string;
    description?: string;
    address?: string;
    email?: string;
    websites?: string[];
    vertical?: string;
  }): Promise<void> {
    const phone = await this.phoneRepo.findOne({ where: { id: phoneId } });
    if (!phone) throw new BadRequestException('Phone number not found');

    const accessToken = await this.tokenService.getActiveToken(phone.wabaAccountId);
    await this.metaApi.updateBusinessProfile(phone.phoneNumberId, accessToken, profile);

    this.logger.log(`Business profile updated for ${phone.phoneNumber}`);
  }

  /**
   * Complete onboarding: mark phone as fully onboarded.
   */
  async completeOnboarding(phoneId: string): Promise<OnboardingStatus> {
    const phone = await this.phoneRepo.findOne({ where: { id: phoneId } });
    if (!phone) throw new BadRequestException('Phone number not found');

    await this.phoneRepo.update(phoneId, {
      status: 'active',
      webhookSubscribed: true,
    });

    await this.auditService.log({
      tenantId: phone.tenantId,
      actorType: 'admin',
      actorId: 'system',
      action: 'phone.onboard_complete',
      resourceType: 'phone_number',
      resourceId: phoneId,
    });

    return this.getOnboardingStatus(phoneId);
  }
}
