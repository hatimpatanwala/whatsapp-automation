import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';

@Injectable()
export class WabaService {
  constructor(
    @InjectRepository(WabaAccount)
    private readonly wabaRepo: Repository<WabaAccount>,
  ) {}

  async findAll(): Promise<WabaAccount[]> {
    return this.wabaRepo.find({ relations: ['phoneNumbers'] });
  }

  async findById(id: string): Promise<WabaAccount> {
    const waba = await this.wabaRepo.findOne({ where: { id }, relations: ['phoneNumbers'] });
    if (!waba) throw new NotFoundException('WABA account not found');
    return waba;
  }

  async findByWabaId(wabaId: string): Promise<WabaAccount> {
    const waba = await this.wabaRepo.findOne({ where: { wabaId }, relations: ['phoneNumbers'] });
    if (!waba) throw new NotFoundException('WABA account not found');
    return waba;
  }

  async create(data: Partial<WabaAccount>): Promise<WabaAccount> {
    const waba = this.wabaRepo.create(data);
    return this.wabaRepo.save(waba);
  }

  async update(id: string, data: Partial<WabaAccount>): Promise<WabaAccount> {
    await this.wabaRepo.update(id, data);
    return this.findById(id);
  }

  async markPending(id: string): Promise<void> {
    await this.wabaRepo.update(id, { status: 'pending' } as any);
  }

  async syncFromMeta(wabaId: string, metaData: any): Promise<WabaAccount> {
    const businessId = metaData.business?.id || metaData.on_behalf_of_business_info?.id || metaData.owner_business_info?.id;
    const existing = await this.wabaRepo.findOne({ where: { wabaId } });
    if (existing) {
      await this.wabaRepo.update(existing.id, {
        name: metaData.name,
        accountReviewStatus: metaData.business_verification_status || metaData.status || existing.accountReviewStatus,
        paymentMethodAttached: metaData.primary_funding_id != null,
      });
      return this.findById(existing.id);
    }
    return this.create({
      wabaId,
      name: metaData.name,
      businessId,
      messagingLimitTier: 'TIER_1K',
      accountReviewStatus: metaData.business_verification_status || metaData.status || 'approved',
      paymentMethodAttached: metaData.primary_funding_id != null,
    });
  }
}
