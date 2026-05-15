import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { REDIS_CLIENT } from '../../config/redis.module';

@Injectable()
export class TenantService {
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async findBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { slug } });
    if (!tenant) throw new NotFoundException(`Tenant ${slug} not found`);
    return tenant;
  }

  async findByPhoneNumberId(phoneNumberId: string): Promise<Tenant | null> {
    // Check cache first (gracefully handle Redis errors)
    try {
      const cached = await this.redis.get(`tenant:phone:${phoneNumberId}`);
      if (cached) return JSON.parse(cached);
    } catch {}

    const tenant = await this.tenantRepository.findOne({
      where: { phoneNumberId, status: 'active' },
    });

    if (tenant) {
      try {
        await this.redis.setex(`tenant:phone:${phoneNumberId}`, this.CACHE_TTL, JSON.stringify(tenant));
      } catch {}
    }

    return tenant;
  }

  async findAll(): Promise<Tenant[]> {
    return this.tenantRepository.find({ order: { createdAt: 'DESC' } });
  }

  async update(id: string, data: Partial<Tenant>): Promise<Tenant> {
    await this.tenantRepository.update(id, data);
    const tenant = await this.findById(id);

    // Invalidate cache (gracefully handle Redis errors)
    if (tenant.phoneNumberId) {
      try { await this.redis.del(`tenant:phone:${tenant.phoneNumberId}`); } catch {}
    }

    return tenant;
  }

  async suspend(id: string): Promise<void> {
    await this.tenantRepository.update(id, { status: 'suspended' });
    const tenant = await this.findById(id);
    if (tenant.phoneNumberId) {
      try { await this.redis.del(`tenant:phone:${tenant.phoneNumberId}`); } catch {}
    }
  }

  async activate(id: string): Promise<void> {
    await this.tenantRepository.update(id, { status: 'active' });
  }
}
