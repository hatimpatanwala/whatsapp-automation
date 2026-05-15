import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { Subscription } from '../../database/entities/public/subscription.entity';
import { SubscriptionPlan } from '../../database/entities/public/subscription-plan.entity';
import { TenantMigrationService } from '../../database/tenant-migration.service';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepository: Repository<SubscriptionPlan>,
    private readonly migrationService: TenantMigrationService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async provisionTenant(dto: CreateTenantDto): Promise<Tenant> {
    // Check if slug exists
    const existing = await this.tenantRepository.findOne({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(`Tenant with slug "${dto.slug}" already exists`);
    }

    const schemaName = `tenant_${dto.slug.replace(/-/g, '_')}`;

    // 1. Create tenant record
    const tenant = this.tenantRepository.create({
      name: dto.name,
      slug: dto.slug,
      schemaName,
      phoneNumberId: dto.phoneNumberId,
      wabaId: dto.wabaId,
      accessToken: dto.accessToken,
      webhookSecret: dto.webhookSecret,
      settings: dto.settings || {},
    });
    await this.tenantRepository.save(tenant);
    this.logger.log(`Tenant record created: ${tenant.slug}`);

    // 2. Create schema
    await this.migrationService.createTenantSchema(schemaName);

    // 3. Run all migrations
    await this.migrationService.runMigrationsForSchema(schemaName);
    this.logger.log(`Migrations completed for schema: ${schemaName}`);

    // 4. Create default subscription
    const selectedPlan = dto.plan || 'starter';
    const now = new Date();
    const validUntil = selectedPlan === 'trial'
      ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days
      : null;

    // Look up the plan entity for limits and planId
    const tierMap: Record<string, string> = { trial: 'trial', starter: 'starter', pro: 'professional', growth: 'growth', enterprise: 'enterprise' };
    const planEntity = await this.planRepository.findOne({
      where: { tier: tierMap[selectedPlan] || 'starter', isActive: true },
    });

    const planLimits = planEntity
      ? {
          maxProducts: planEntity.limits?.productLimit ?? 50,
          maxConversations: planEntity.limits?.conversationLimit ?? 1000,
          maxCampaignsPerMonth: planEntity.limits?.campaignLimit ?? 5,
        }
      : this.getFallbackPlanLimits(selectedPlan);

    const subscription = this.subscriptionRepository.create({
      tenantId: tenant.id,
      plan: selectedPlan,
      planId: planEntity?.id ?? null,
      ...planLimits,
      validFrom: now,
      validUntil,
      status: 'active',
    });
    await this.subscriptionRepository.save(subscription);

    // 5. Create owner user in tenant schema
    if (dto.ownerPassword && (dto.ownerPhone || dto.ownerEmail)) {
      const passwordHash = await bcrypt.hash(dto.ownerPassword, 12);
      const phone = dto.ownerPhone || null;
      await this.connectionManager.executeInTenantContext(schemaName, async (qr) => {
        await qr.query(
          `INSERT INTO users (phone, name, password_hash, role, email) VALUES ($1, $2, $3, $4, $5)`,
          [phone, dto.ownerName || dto.name, passwordHash, 'owner', dto.ownerEmail],
        );
      });
      this.logger.log(`Owner user created for tenant: ${tenant.slug}`);
    }

    return tenant;
  }

  private getFallbackPlanLimits(plan: string): { maxProducts: number; maxConversations: number; maxCampaignsPerMonth: number } {
    switch (plan) {
      case 'trial':
        return { maxProducts: 20, maxConversations: 100, maxCampaignsPerMonth: 2 };
      case 'starter':
        return { maxProducts: 50, maxConversations: 1000, maxCampaignsPerMonth: 5 };
      case 'pro':
        return { maxProducts: 500, maxConversations: 10000, maxCampaignsPerMonth: 20 };
      case 'enterprise':
        return { maxProducts: 10000, maxConversations: 100000, maxCampaignsPerMonth: 100 };
      default:
        return { maxProducts: 50, maxConversations: 1000, maxCampaignsPerMonth: 5 };
    }
  }

  async deprovisionTenant(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) return;

    await this.migrationService.dropTenantSchema(tenant.schemaName);
    await this.tenantRepository.update(tenantId, { status: 'deleted' });
    this.logger.log(`Tenant deprovisioned: ${tenant.slug}`);
  }
}
