import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { ConversationSession } from '../../../database/entities/public/conversation-session.entity';
import { ConversationCost } from '../../../database/entities/public/conversation-cost.entity';
import { MetaPricing } from '../../../database/entities/public/meta-pricing.entity';
import { TenantUsageMonthly } from '../../../database/entities/public/tenant-usage-monthly.entity';
import { TenantQuotaConfig } from '../../../database/entities/public/tenant-quota-config.entity';
import { Subscription } from '../../../database/entities/public/subscription.entity';
import { REDIS_CLIENT } from '../../../config/redis.module';

export type ConversationCategory = 'marketing' | 'utility' | 'authentication' | 'service';

export interface TrackConversationInput {
  tenantId: string;
  phoneNumberId: string;
  customerPhone: string;
  category: ConversationCategory;
  origin: 'business_initiated' | 'user_initiated';
  countryCode?: string;
  waConversationId?: string;
}

export interface TrackResult {
  session: ConversationSession;
  isNew: boolean;
  cost: { metaCost: number; platformCost: number; tenantCharge: number; currency: string };
  quota: { used: number; limit: number; pct: number; softLimitReached: boolean; hardLimitReached: boolean };
}

/**
 * Enhanced conversation accounting with:
 * - Country-based pricing from meta_pricing table
 * - Per-tenant quota tracking with configurable limits
 * - Monthly usage aggregation
 * - Overage calculation
 */
@Injectable()
export class ConversationAccountingService {
  private readonly logger = new Logger(ConversationAccountingService.name);

  // Fallback India pricing (INR) if meta_pricing table is empty
  private readonly fallbackPricing: Record<ConversationCategory, number> = {
    marketing: 0.7096,
    utility: 0.3548,
    authentication: 0.3075,
    service: 0.3548,
  };

  constructor(
    @InjectRepository(ConversationSession)
    private readonly sessionRepo: Repository<ConversationSession>,
    @InjectRepository(ConversationCost)
    private readonly costRepo: Repository<ConversationCost>,
    @InjectRepository(MetaPricing)
    private readonly pricingRepo: Repository<MetaPricing>,
    @InjectRepository(TenantUsageMonthly)
    private readonly usageRepo: Repository<TenantUsageMonthly>,
    @InjectRepository(TenantQuotaConfig)
    private readonly quotaConfigRepo: Repository<TenantQuotaConfig>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  /**
   * Track a conversation: find/create 24h session, calculate cost, check quota.
   */
  async trackConversation(input: TrackConversationInput): Promise<TrackResult> {
    const lockKey = `accounting:lock:${input.tenantId}:${input.customerPhone}`;
    const lockAcquired = await this.redis.set(lockKey, '1', 'EX', 10, 'NX');

    try {
      // Check for existing active session
      const existingSession = await this.findActiveSession(input.tenantId, input.customerPhone);
      if (existingSession) {
        await this.sessionRepo.increment({ id: existingSession.id }, 'messageCount', 1);
        existingSession.messageCount++;

        return {
          session: existingSession,
          isNew: false,
          cost: { metaCost: 0, platformCost: 0, tenantCharge: 0, currency: 'INR' },
          quota: await this.getQuotaStatus(input.tenantId),
        };
      }

      // Check quota before creating new session
      const quotaStatus = await this.getQuotaStatus(input.tenantId);

      // Create new 24h session
      const now = new Date();
      const session = this.sessionRepo.create({
        tenantId: input.tenantId,
        phoneNumberId: input.phoneNumberId,
        customerPhone: input.customerPhone,
        conversationIdMeta: input.waConversationId,
        category: input.category,
        origin: input.origin,
        startedAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        status: 'open',
        messageCount: 1,
        isBillable: true,
      });
      await this.sessionRepo.save(session);

      // Calculate cost using country-based pricing
      const cost = await this.calculateCost(input.category, input.origin, input.countryCode);

      // Record cost
      const billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await this.costRepo.save(this.costRepo.create({
        conversationSessionId: session.id,
        tenantId: input.tenantId,
        category: input.category,
        metaCost: cost.metaCost,
        platformCost: cost.platformCost,
        tenantCharge: cost.tenantCharge,
        currency: cost.currency,
        billingPeriod,
      }));

      // Increment subscription counter
      await this.subscriptionRepo
        .createQueryBuilder()
        .update()
        .set({ conversationsUsed: () => 'conversations_used + 1' })
        .where('tenant_id = :tenantId AND status = :status', { tenantId: input.tenantId, status: 'active' })
        .execute();

      // Update monthly usage
      await this.updateMonthlyUsage(input.tenantId, billingPeriod, input.category, cost);

      // Cache session
      await this.redis.set(
        `session:active:${input.tenantId}:${input.customerPhone}`,
        session.id,
        'EX',
        86400,
      );

      // Refresh quota status
      const updatedQuota = await this.getQuotaStatus(input.tenantId);

      return {
        session,
        isNew: true,
        cost,
        quota: updatedQuota,
      };
    } finally {
      if (lockAcquired) await this.redis.del(lockKey);
    }
  }

  /**
   * Get quota status for a tenant.
   */
  async getQuotaStatus(tenantId: string): Promise<{
    used: number;
    limit: number;
    pct: number;
    softLimitReached: boolean;
    hardLimitReached: boolean;
  }> {
    // Check cache
    const cached = await this.redis.get(`quota:status:${tenantId}`);
    if (cached) return JSON.parse(cached);

    const subscription = await this.subscriptionRepo.findOne({
      where: { tenantId, status: 'active' },
    });

    if (!subscription) {
      return { used: 0, limit: 0, pct: 100, softLimitReached: true, hardLimitReached: true };
    }

    // Check for custom quota config
    const quotaConfig = await this.quotaConfigRepo.findOne({ where: { tenantId } });
    const limit = quotaConfig?.maxConversations || subscription.maxConversations;
    const softPct = quotaConfig?.softLimitPct || 80;
    const hardPct = quotaConfig?.hardLimitPct || 100;

    const used = subscription.conversationsUsed;
    const pct = limit > 0 ? Math.round((used / limit) * 100) : 100;

    const result = {
      used,
      limit,
      pct,
      softLimitReached: pct >= softPct,
      hardLimitReached: pct >= hardPct,
    };

    // Cache for 60 seconds
    await this.redis.set(`quota:status:${tenantId}`, JSON.stringify(result), 'EX', 60);

    return result;
  }

  /**
   * Get detailed usage for a tenant for a billing period.
   */
  async getDetailedUsage(tenantId: string, billingPeriod?: string): Promise<TenantUsageMonthly | null> {
    const period = billingPeriod || this.currentPeriod();
    return this.usageRepo.findOne({ where: { tenantId, billingPeriod: period } });
  }

  /**
   * Reconcile monthly usage from raw session/cost data.
   * Called by cron or manually by admin.
   */
  async reconcileMonth(tenantId: string, billingPeriod: string): Promise<TenantUsageMonthly> {
    const [year, month] = billingPeriod.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    // Count sessions by category
    const sessions = await this.sessionRepo.find({
      where: { tenantId, startedAt: Between(periodStart, periodEnd) },
    });

    const byCategory = { service: 0, utility: 0, marketing: 0, authentication: 0 };
    sessions.forEach(s => {
      if (byCategory[s.category as ConversationCategory] !== undefined) {
        byCategory[s.category as ConversationCategory]++;
      }
    });

    // Sum costs
    const costs = await this.costRepo.find({
      where: { tenantId, billingPeriod },
    });

    const metaTotal = costs.reduce((sum, c) => sum + Number(c.metaCost), 0);
    const platformTotal = costs.reduce((sum, c) => sum + Number(c.platformCost), 0);
    const tenantTotal = costs.reduce((sum, c) => sum + Number(c.tenantCharge), 0);

    // Get quota info
    const subscription = await this.subscriptionRepo.findOne({ where: { tenantId, status: 'active' } });
    const quotaLimit = subscription?.maxConversations || 0;
    const total = sessions.length;
    const overageCount = Math.max(0, total - quotaLimit);

    // Upsert monthly record
    let usage = await this.usageRepo.findOne({ where: { tenantId, billingPeriod } });
    if (!usage) {
      usage = this.usageRepo.create({ tenantId, billingPeriod });
    }

    usage.serviceConversations = byCategory.service;
    usage.utilityConversations = byCategory.utility;
    usage.marketingConversations = byCategory.marketing;
    usage.authenticationConversations = byCategory.authentication;
    usage.totalConversations = total;
    usage.metaCostTotal = metaTotal;
    usage.platformRevenue = platformTotal;
    usage.tenantChargeTotal = tenantTotal;
    usage.quotaLimit = quotaLimit;
    usage.overageCount = overageCount;
    usage.softLimitHit = total >= Math.floor(quotaLimit * 0.8);
    usage.hardLimitHit = total >= quotaLimit;
    usage.isReconciled = true;
    usage.reconciledAt = new Date();

    return this.usageRepo.save(usage);
  }

  // ─── Internal helpers ──────────────────────────────────────────────────

  private async findActiveSession(tenantId: string, customerPhone: string): Promise<ConversationSession | null> {
    const cachedId = await this.redis.get(`session:active:${tenantId}:${customerPhone}`);
    if (cachedId) {
      const session = await this.sessionRepo.findOne({ where: { id: cachedId, status: 'open' } });
      if (session && new Date() < new Date(session.expiresAt)) return session;
      await this.redis.del(`session:active:${tenantId}:${customerPhone}`);
    }

    return this.sessionRepo.findOne({
      where: { tenantId, customerPhone, status: 'open' },
      order: { startedAt: 'DESC' },
    });
  }

  private async calculateCost(
    category: ConversationCategory,
    origin: string,
    countryCode?: string,
  ): Promise<{ metaCost: number; platformCost: number; tenantCharge: number; currency: string }> {
    // Try country-based pricing
    if (countryCode) {
      const pricing = await this.pricingRepo.findOne({
        where: { countryCode, category, isActive: true },
        order: { effectiveFrom: 'DESC' },
      });

      if (pricing) {
        const metaCost = Number(pricing.metaCostLocal);
        const markupPct = Number(pricing.markupPct);
        const platformCost = metaCost * (markupPct / 100);
        return {
          metaCost,
          platformCost,
          tenantCharge: metaCost + platformCost,
          currency: pricing.localCurrency,
        };
      }
    }

    // Fallback to hardcoded India pricing
    const metaCost = this.fallbackPricing[category] || 0;
    const platformCost = metaCost * 0.15; // 15% markup
    return {
      metaCost,
      platformCost,
      tenantCharge: metaCost + platformCost,
      currency: 'INR',
    };
  }

  private async updateMonthlyUsage(
    tenantId: string,
    billingPeriod: string,
    category: ConversationCategory,
    cost: { metaCost: number; platformCost: number; tenantCharge: number },
  ) {
    let usage = await this.usageRepo.findOne({ where: { tenantId, billingPeriod } });
    if (!usage) {
      usage = this.usageRepo.create({
        tenantId,
        billingPeriod,
        currency: 'INR',
      });
    }

    // Increment category
    switch (category) {
      case 'service': usage.serviceConversations++; break;
      case 'utility': usage.utilityConversations++; break;
      case 'marketing': usage.marketingConversations++; break;
      case 'authentication': usage.authenticationConversations++; break;
    }
    usage.totalConversations++;
    usage.metaCostTotal = Number(usage.metaCostTotal) + cost.metaCost;
    usage.platformRevenue = Number(usage.platformRevenue) + cost.platformCost;
    usage.tenantChargeTotal = Number(usage.tenantChargeTotal) + cost.tenantCharge;

    await this.usageRepo.save(usage);
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
