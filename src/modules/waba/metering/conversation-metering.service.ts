import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { ConversationSession } from '../../../database/entities/public/conversation-session.entity';
import { ConversationCost } from '../../../database/entities/public/conversation-cost.entity';
import { Subscription } from '../../../database/entities/public/subscription.entity';
import { AuditLogService } from '../audit-log.service';
import { WalletService } from '../../billing/wallet.service';

export type ConversationCategory = 'marketing' | 'utility' | 'authentication' | 'service';
export type ConversationOrigin = 'business_initiated' | 'user_initiated';

export interface MeterConversationInput {
  tenantId: string;
  phoneNumberId: string;
  customerPhone: string;
  category: ConversationCategory;
  origin: ConversationOrigin;
  waConversationId?: string;
}

export interface MeteringResult {
  session: ConversationSession;
  isNew: boolean;
  quotaExceeded: boolean;
  softLimitReached: boolean;
}

// Default India pricing (INR) per conversation - fallback when MetaPricing table has no data
// TODO: Sync from Meta's pricing API periodically and use MetaPricing entity
const META_PRICING_INR: Record<ConversationCategory, { business: number; user: number }> = {
  marketing: { business: 0.7096, user: 0 },
  utility: { business: 0.3548, user: 0 },
  authentication: { business: 0.3075, user: 0 },
  service: { business: 0, user: 0.3548 },
};

@Injectable()
export class ConversationMeteringService {
  private readonly logger = new Logger(ConversationMeteringService.name);

  constructor(
    @InjectRepository(ConversationSession)
    private readonly sessionRepo: Repository<ConversationSession>,
    @InjectRepository(ConversationCost)
    private readonly costRepo: Repository<ConversationCost>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    private readonly auditService: AuditLogService,
    @Optional()
    private readonly walletService?: WalletService,
  ) {}

  /**
   * Main metering entry point. Called when a message is sent/received.
   * Finds or creates a 24h conversation session, records cost, checks quotas.
   */
  async meterConversation(input: MeterConversationInput): Promise<MeteringResult> {
    const lockKey = `meter:lock:${input.tenantId}:${input.customerPhone}`;
    const lock = await this.redis.set(lockKey, '1', 'EX', 10, 'NX');

    try {
      if (!lock) {
        // Another process is metering this conversation, wait briefly
        await new Promise(resolve => setTimeout(resolve, 100));
        // Return existing session
        const existing = await this.findActiveSession(input.tenantId, input.customerPhone);
        if (existing) {
          return { session: existing, isNew: false, quotaExceeded: false, softLimitReached: false };
        }
      }

      // Check for existing open session within 24h window
      const existingSession = await this.findActiveSession(input.tenantId, input.customerPhone);

      if (existingSession) {
        // Increment message count on existing session
        await this.sessionRepo.increment({ id: existingSession.id }, 'messageCount', 1);
        existingSession.messageCount++;
        return { session: existingSession, isNew: false, quotaExceeded: false, softLimitReached: false };
      }

      // Check quota before creating new session
      const quotaCheck = await this.checkQuota(input.tenantId, input.category);

      // If hard limit reached and tenant did NOT allow exceeding, block new conversation
      if (quotaCheck.hardLimitReached) {
        const subscription = await this.subscriptionRepo.findOne({
          where: { tenantId: input.tenantId, status: 'active' },
        });
        const allowExceed = (subscription as any)?.allowExceed ?? false;
        if (!allowExceed) {
          return {
            session: null as any,
            isNew: false,
            quotaExceeded: true,
            softLimitReached: true,
          };
        }
      }

      // Create new 24h session
      const session = await this.createSession(input);

      // Record cost for tracking (no wallet debit — subscription-based billing only)
      await this.recordCost(session, input);

      // Increment quota counters
      await this.incrementQuota(input.tenantId, input.category);

      // Cache the active session
      await this.cacheSession(input.tenantId, input.customerPhone, session.id);

      return {
        session,
        isNew: true,
        quotaExceeded: quotaCheck.hardLimitReached,
        softLimitReached: quotaCheck.softLimitReached,
      };
    } finally {
      await this.redis.del(lockKey);
    }
  }

  /**
   * Find an active (open, non-expired) session for this tenant+customer.
   */
  async findActiveSession(tenantId: string, customerPhone: string): Promise<ConversationSession | null> {
    // Check cache first
    const cachedId = await this.redis.get(`session:active:${tenantId}:${customerPhone}`);
    if (cachedId) {
      const session = await this.sessionRepo.findOne({ where: { id: cachedId, status: 'open' } });
      if (session && new Date() < new Date(session.expiresAt)) return session;
      // Cache stale, remove it
      await this.redis.del(`session:active:${tenantId}:${customerPhone}`);
    }

    return this.sessionRepo.findOne({
      where: {
        tenantId,
        customerPhone,
        status: 'open',
        expiresAt: MoreThan(new Date()),
      },
      order: { startedAt: 'DESC' },
    });
  }

  /**
   * Check if tenant is within quota for the given category.
   */
  async checkQuota(tenantId: string, category: ConversationCategory): Promise<{
    allowed: boolean;
    softLimitReached: boolean;
    hardLimitReached: boolean;
    usage: number;
    limit: number;
  }> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { tenantId, status: 'active' },
    });

    if (!subscription) {
      return { allowed: false, softLimitReached: true, hardLimitReached: true, usage: 0, limit: 0 };
    }

    const totalUsed = subscription.conversationsUsed;
    const totalLimit = subscription.maxConversations;
    const softPct = 80; // Default soft limit at 80%
    const hardPct = 100;

    const softThreshold = Math.floor(totalLimit * softPct / 100);
    const hardThreshold = Math.floor(totalLimit * hardPct / 100);

    return {
      allowed: totalUsed < hardThreshold,
      softLimitReached: totalUsed >= softThreshold,
      hardLimitReached: totalUsed >= hardThreshold,
      usage: totalUsed,
      limit: totalLimit,
    };
  }

  /**
   * Get usage summary for a tenant in a given period.
   */
  async getUsageSummary(tenantId: string, periodStart?: Date, periodEnd?: Date): Promise<{
    total: number;
    byCategory: Record<ConversationCategory, number>;
    totalCostInr: number;
  }> {
    const qb = this.sessionRepo.createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId });

    if (periodStart) qb.andWhere('s.started_at >= :start', { start: periodStart });
    if (periodEnd) qb.andWhere('s.started_at <= :end', { end: periodEnd });

    const sessions = await qb.getMany();

    const byCategory: Record<ConversationCategory, number> = {
      marketing: 0, utility: 0, authentication: 0, service: 0,
    };
    sessions.forEach(s => {
      byCategory[s.category as ConversationCategory]++;
    });

    // Get costs
    const costQb = this.costRepo.createQueryBuilder('c')
      .select('SUM(c.tenant_charge)', 'total')
      .where('c.tenant_id = :tenantId', { tenantId });
    if (periodStart) costQb.andWhere('c.created_at >= :start', { start: periodStart });
    if (periodEnd) costQb.andWhere('c.created_at <= :end', { end: periodEnd });
    const costResult = await costQb.getRawOne();

    return {
      total: sessions.length,
      byCategory,
      totalCostInr: parseFloat(costResult?.total || '0'),
    };
  }

  /**
   * Close expired sessions (called by cron job).
   */
  async closeExpiredSessions(): Promise<number> {
    const result = await this.sessionRepo.update(
      { status: 'open', expiresAt: LessThan(new Date()) },
      { status: 'closed' },
    );
    return result.affected || 0;
  }

  private async createSession(input: MeterConversationInput): Promise<ConversationSession> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    const session = this.sessionRepo.create({
      tenantId: input.tenantId,
      phoneNumberId: input.phoneNumberId,
      customerPhone: input.customerPhone,
      conversationIdMeta: input.waConversationId,
      category: input.category,
      origin: input.origin,
      startedAt: now,
      expiresAt,
      status: 'open',
      messageCount: 1,
      isBillable: this.isBillable(input.category, input.origin),
    });

    return this.sessionRepo.save(session);
  }

  private async recordCost(session: ConversationSession, input: MeterConversationInput): Promise<void> {
    if (!session.isBillable) return;

    const pricing = META_PRICING_INR[input.category];
    const metaCost = input.origin === 'business_initiated' ? pricing.business : pricing.user;
    const platformMarkup = metaCost * 0.15; // 15% platform markup
    const totalCost = metaCost + platformMarkup;

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const cost = this.costRepo.create({
      conversationSessionId: session.id,
      tenantId: input.tenantId,
      category: input.category,
      metaCost: metaCost,
      platformCost: platformMarkup,
      tenantCharge: totalCost,
      currency: 'INR',
      billingPeriod: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    });

    await this.costRepo.save(cost);

    // Note: Per-conversation wallet billing is disabled.
    // Conversations are counted against the subscription quota.
    // Tenants pay via subscription plans, not per-conversation charges.
  }

  private async incrementQuota(tenantId: string, category: ConversationCategory): Promise<void> {
    // Use Redis atomic counter for real-time quota enforcement (avoids check-then-increment race)
    const monthKey = `quota:count:${tenantId}:${new Date().toISOString().slice(0, 7)}`;
    const count = await this.redis.incr(monthKey);
    if (count === 1) {
      // First increment this month — set TTL to 32 days
      await this.redis.expire(monthKey, 86400 * 32);
    }

    // Periodically sync Redis counter back to DB (every 10 conversations)
    if (count % 10 === 0) {
      await this.subscriptionRepo
        .createQueryBuilder()
        .update(Subscription)
        .set({ conversationsUsed: count })
        .where('tenant_id = :tenantId AND status = :status', { tenantId, status: 'active' })
        .execute();
    }
  }

  private async cacheSession(tenantId: string, customerPhone: string, sessionId: string): Promise<void> {
    // Cache for 24 hours
    await this.redis.set(`session:active:${tenantId}:${customerPhone}`, sessionId, 'EX', 86400);
  }

  private isBillable(category: ConversationCategory, origin: ConversationOrigin): boolean {
    // Free entry point conversations (click-to-WhatsApp ads) are not billable
    // Service conversations initiated by users within 24h of last business msg are free
    if (category === 'service' && origin === 'user_initiated') return true;
    return true; // All other conversations are billable
  }
}
