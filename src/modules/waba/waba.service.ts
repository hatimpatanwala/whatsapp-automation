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

  async remove(id: string): Promise<void> {
    // Ensure it exists (throws NotFoundException otherwise)
    await this.findById(id);
    // FKs are NO ACTION, so child rows must be removed first. Do it atomically.
    await this.wabaRepo.manager.transaction(async (em) => {
      await em.query('DELETE FROM public.meta_tokens WHERE waba_account_id = $1', [id]);
      await em.query('DELETE FROM public.template_registry WHERE waba_account_id = $1', [id]);
      await em.query('DELETE FROM public.phone_numbers WHERE waba_account_id = $1', [id]);
      await em.query('DELETE FROM public.waba_accounts WHERE id = $1', [id]);
    });
  }

  async syncFromMeta(wabaId: string, metaData: any): Promise<WabaAccount> {
    const existing = await this.wabaRepo.findOne({ where: { wabaId } });
    if (existing) {
      await this.wabaRepo.update(existing.id, {
        name: metaData.name || existing.name,
      });
      return this.findById(existing.id);
    }
    return this.create({
      wabaId,
      name: metaData.name || wabaId,
      messagingLimitTier: 'TIER_1K',
      accountReviewStatus: 'approved',
    });
  }
}
