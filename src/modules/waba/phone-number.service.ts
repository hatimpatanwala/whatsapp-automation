import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { MetaCloudApiClient } from './meta-cloud-api.client';

@Injectable()
export class PhoneNumberService {
  constructor(
    @InjectRepository(PhoneNumber)
    private readonly phoneRepo: Repository<PhoneNumber>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly metaApi: MetaCloudApiClient,
  ) {}

  async findAll(wabaAccountId?: string): Promise<PhoneNumber[]> {
    const where: any = {};
    if (wabaAccountId) where.wabaAccountId = wabaAccountId;
    return this.phoneRepo.find({ where, relations: ['tenant', 'wabaAccount'] });
  }

  async findById(id: string): Promise<PhoneNumber> {
    const phone = await this.phoneRepo.findOne({ where: { id }, relations: ['tenant', 'wabaAccount'] });
    if (!phone) throw new NotFoundException('Phone number not found');
    return phone;
  }

  async findByPhoneNumberId(phoneNumberId: string): Promise<PhoneNumber | null> {
    return this.phoneRepo.findOne({ where: { phoneNumberId }, relations: ['tenant', 'wabaAccount'] });
  }

  async findByTenantId(tenantId: string): Promise<PhoneNumber | null> {
    return this.phoneRepo.findOne({ where: { tenantId }, relations: ['wabaAccount'] });
  }

  async findByDisplayNumber(displayNumber: string): Promise<PhoneNumber | null> {
    // Try exact match, then with/without leading +
    const normalized = displayNumber.startsWith('+') ? displayNumber : `+${displayNumber}`;
    const withoutPlus = displayNumber.startsWith('+') ? displayNumber.substring(1) : displayNumber;
    return this.phoneRepo.findOne({
      where: [
        { phoneNumber: normalized },
        { phoneNumber: withoutPlus },
      ],
    });
  }

  async assignToTenant(phoneId: string, tenantId: string): Promise<PhoneNumber> {
    const phone = await this.findById(phoneId);
    if (phone.tenantId && phone.tenantId !== tenantId) {
      throw new ConflictException('Phone number is already assigned to another tenant');
    }
    await this.phoneRepo.update(phoneId, { tenantId });

    // Also update the tenant record so webhook processor can resolve tenant by phone_number_id
    await this.tenantRepo.update(tenantId, {
      phoneNumberId: phone.phoneNumberId,
      wabaId: phone.wabaAccount?.wabaId ?? phone.wabaAccountId,
    });

    return this.findById(phoneId);
  }

  async unassignFromTenant(phoneId: string): Promise<PhoneNumber> {
    const phone = await this.findById(phoneId);

    // Clear the tenant's phone_number_id if it matches this phone
    if (phone.tenantId) {
      const tenant = await this.tenantRepo.findOne({ where: { id: phone.tenantId } });
      if (tenant && tenant.phoneNumberId === phone.phoneNumberId) {
        await this.tenantRepo.update(phone.tenantId, { phoneNumberId: null, wabaId: null });
      }
    }

    await this.phoneRepo.update(phoneId, { tenantId: null });
    return this.findById(phoneId);
  }

  async register(phoneId: string, pin: string): Promise<PhoneNumber> {
    const phone = await this.findById(phoneId);
    await this.metaApi.registerPhoneNumber(phone.phoneNumberId, pin);
    await this.phoneRepo.update(phoneId, {
      registrationStatus: 'registered',
      status: 'active',
      lastOnboardedAt: new Date(),
    });
    return this.findById(phoneId);
  }

  async requestVerificationCode(phoneId: string, codeMethod: 'SMS' | 'VOICE'): Promise<void> {
    const phone = await this.findById(phoneId);
    await this.metaApi.requestVerificationCode(phone.phoneNumberId, codeMethod);
    await this.phoneRepo.update(phoneId, { codeVerificationStatus: 'code_sent' });
  }

  async verifyCode(phoneId: string, code: string): Promise<PhoneNumber> {
    const phone = await this.findById(phoneId);
    await this.metaApi.verifyCode(phone.phoneNumberId, code);
    await this.phoneRepo.update(phoneId, { codeVerificationStatus: 'verified' });
    return this.findById(phoneId);
  }

  async updateStatus(phoneId: string, status: 'active' | 'inactive'): Promise<PhoneNumber> {
    const phone = await this.findById(phoneId);

    // Activating is only meaningful once the number is actually registered &
    // verified on Meta. Otherwise flipping the local flag to "active" is
    // misleading (the number can't send/receive) and removes it from the
    // auto-retry cron. Block it with a clear explanation instead.
    if (status === 'active') {
      const registered = !!phone.phoneNumberId && phone.registrationStatus === 'registered';
      if (!registered) {
        throw new BadRequestException(
          'This number is not registered on WhatsApp yet, so it can\'t be activated here. ' +
          'It must be registered and verified (OTP) from the tenant\'s Settings → WhatsApp page first. ' +
          `Current state: ${phone.phoneNumberId ? 'added to WABA but not verified' : 'not yet added to a WABA'} ` +
          `(registration: ${phone.registrationStatus}, verification: ${phone.codeVerificationStatus}).`,
        );
      }
    }

    await this.phoneRepo.update(phoneId, { status });
    return this.findById(phoneId);
  }

  async updateQualityRating(phoneNumberId: string, rating: string): Promise<void> {
    await this.phoneRepo.update(
      { phoneNumberId },
      { qualityRating: rating },
    );
  }

  async syncFromMeta(wabaAccountId: string, metaPhoneData: any): Promise<PhoneNumber> {
    const existing = await this.phoneRepo.findOne({ where: { phoneNumberId: metaPhoneData.id } });
    const data: Partial<PhoneNumber> = {
      wabaAccountId,
      phoneNumber: metaPhoneData.display_phone_number,
      phoneNumberId: metaPhoneData.id,
      displayName: metaPhoneData.verified_name,
      verifiedName: metaPhoneData.verified_name,
      qualityRating: metaPhoneData.quality_rating || 'GREEN',
      messagingLimit: metaPhoneData.messaging_limit || 'TIER_1K',
      nameStatus: metaPhoneData.name_status || 'NONE',
      isOfficialBusinessAccount: metaPhoneData.is_official_business_account || false,
    };

    if (existing) {
      await this.phoneRepo.update(existing.id, data);
      return this.findById(existing.id);
    }
    const phone = this.phoneRepo.create({ ...data, status: 'pending_registration' });
    return this.phoneRepo.save(phone);
  }
}
