import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WabaAccount } from '../../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { TenantRiskScore } from '../../../database/entities/public/tenant-risk-score.entity';
import { TenantQuotaConfig } from '../../../database/entities/public/tenant-quota-config.entity';

export interface AllocationResult {
  wabaAccountId: string;
  wabaId: string;
  reason: string;
}

export interface WabaPool {
  account: WabaAccount;
  phoneCount: number;
  capacity: number;
  utilization: number;
}

/**
 * Pool-based WABA allocation service.
 *
 * Architecture:
 *   - Multiple WABA accounts organized in tiers (starter, growth, enterprise, quarantine)
 *   - Each WABA has a phone number capacity based on its messaging tier
 *   - New numbers are allocated to the least-utilized WABA in the appropriate tier
 *   - High-risk tenants are moved to quarantine WABAs to protect other tenants
 *
 * Tier capacity limits (Meta messaging tiers):
 *   TIER_1K   → up to 50 numbers (starter pool)
 *   TIER_10K  → up to 100 numbers (growth pool)
 *   TIER_100K → up to 200 numbers (enterprise pool)
 *   TIER_UNLIMITED → up to 500 numbers
 */
@Injectable()
export class WabaAllocationService {
  private readonly logger = new Logger(WabaAllocationService.name);

  private readonly tierCapacity: Record<string, number> = {
    TIER_1K: 50,
    TIER_10K: 100,
    TIER_100K: 200,
    TIER_UNLIMITED: 500,
  };

  constructor(
    @InjectRepository(WabaAccount)
    private readonly wabaRepo: Repository<WabaAccount>,
    @InjectRepository(PhoneNumber)
    private readonly phoneRepo: Repository<PhoneNumber>,
    @InjectRepository(TenantRiskScore)
    private readonly riskRepo: Repository<TenantRiskScore>,
    @InjectRepository(TenantQuotaConfig)
    private readonly quotaRepo: Repository<TenantQuotaConfig>,
  ) {}

  /**
   * Allocate a WABA account for a new phone number.
   * Strategy: pick the least-utilized WABA in the appropriate tier for the tenant.
   */
  async allocateWaba(tenantId: string): Promise<AllocationResult> {
    // Check risk score — quarantine high-risk tenants
    const risk = await this.riskRepo.findOne({ where: { tenantId } });
    if (risk?.isQuarantined || (risk?.riskLevel === 'critical')) {
      const quarantineWaba = await this.findQuarantineWaba();
      if (quarantineWaba) {
        return {
          wabaAccountId: quarantineWaba.id,
          wabaId: quarantineWaba.wabaId,
          reason: 'Allocated to quarantine pool due to high risk score',
        };
      }
    }

    // Determine tier based on tenant's plan
    const quota = await this.quotaRepo.findOne({ where: { tenantId } });
    const targetTier = this.planToTier(quota?.planTier || 'starter');

    // Get available WABAs sorted by utilization
    const pools = await this.getWabaPools(targetTier);

    if (pools.length === 0) {
      // Fallback: try any active WABA
      const fallback = await this.wabaRepo.findOne({
        where: { status: 'active' },
        order: { createdAt: 'ASC' },
      });

      if (!fallback) {
        throw new Error('No WABA accounts available for allocation');
      }

      return {
        wabaAccountId: fallback.id,
        wabaId: fallback.wabaId,
        reason: 'Fallback allocation — no tier-specific WABAs available',
      };
    }

    // Pick least utilized
    const best = pools[0];
    return {
      wabaAccountId: best.account.id,
      wabaId: best.account.wabaId,
      reason: `Allocated to ${targetTier} pool (utilization: ${Math.round(best.utilization * 100)}%)`,
    };
  }

  /**
   * Move a tenant's numbers to quarantine WABA.
   * Called when risk score exceeds critical threshold.
   */
  async quarantineTenant(tenantId: string, reason: string): Promise<void> {
    const quarantineWaba = await this.findQuarantineWaba();
    if (!quarantineWaba) {
      this.logger.warn('No quarantine WABA available — skipping quarantine');
      return;
    }

    const phones = await this.phoneRepo.find({ where: { tenantId } });
    for (const phone of phones) {
      if (phone.wabaAccountId !== quarantineWaba.id) {
        await this.phoneRepo.update(phone.id, { wabaAccountId: quarantineWaba.id });
        this.logger.warn(`Moved phone ${phone.phoneNumber} to quarantine WABA for tenant ${tenantId}: ${reason}`);
      }
    }
  }

  /**
   * Get pool status for admin dashboard.
   */
  async getPoolStatus(): Promise<Array<WabaPool & { tier: string }>> {
    const wabas = await this.wabaRepo.find({ where: { status: 'active' } });
    const result: Array<WabaPool & { tier: string }> = [];

    for (const waba of wabas) {
      const phoneCount = await this.phoneRepo.count({ where: { wabaAccountId: waba.id } });
      const capacity = this.tierCapacity[waba.messagingLimitTier] || 50;

      result.push({
        account: waba,
        phoneCount,
        capacity,
        utilization: phoneCount / capacity,
        tier: this.getTierLabel(waba),
      });
    }

    return result.sort((a, b) => a.utilization - b.utilization);
  }

  private async getWabaPools(targetTier: string): Promise<WabaPool[]> {
    const wabas = await this.wabaRepo.find({ where: { status: 'active' } });
    const pools: WabaPool[] = [];

    for (const waba of wabas) {
      // Skip quarantine WABAs
      if (waba.settings?.isQuarantine) continue;

      // Match tier
      const wabaTier = this.getTierLabel(waba);
      if (wabaTier !== targetTier && targetTier !== 'any') continue;

      const phoneCount = await this.phoneRepo.count({ where: { wabaAccountId: waba.id } });
      const capacity = this.tierCapacity[waba.messagingLimitTier] || 50;

      if (phoneCount < capacity) {
        pools.push({ account: waba, phoneCount, capacity, utilization: phoneCount / capacity });
      }
    }

    return pools.sort((a, b) => a.utilization - b.utilization);
  }

  private async findQuarantineWaba(): Promise<WabaAccount | null> {
    const wabas = await this.wabaRepo.find({ where: { status: 'active' } });
    return wabas.find(w => w.settings?.isQuarantine) || null;
  }

  private planToTier(planTier: string): string {
    const mapping: Record<string, string> = {
      starter: 'starter',
      growth: 'growth',
      professional: 'enterprise',
      enterprise: 'enterprise',
    };
    return mapping[planTier] || 'starter';
  }

  private getTierLabel(waba: WabaAccount): string {
    if (waba.settings?.isQuarantine) return 'quarantine';
    if (waba.settings?.tier) return waba.settings.tier;

    // Infer from messaging limit
    switch (waba.messagingLimitTier) {
      case 'TIER_1K': return 'starter';
      case 'TIER_10K': return 'growth';
      case 'TIER_100K':
      case 'TIER_UNLIMITED': return 'enterprise';
      default: return 'starter';
    }
  }
}
