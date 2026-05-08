import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { MetaCloudApiClient } from './meta-cloud-api.client';

@Injectable()
export class PhoneNumberService {
  constructor(
    @InjectRepository(PhoneNumber)
    private readonly phoneRepo: Repository<PhoneNumber>,
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
    return this.findById(phoneId);
  }

  async unassignFromTenant(phoneId: string): Promise<PhoneNumber> {
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
