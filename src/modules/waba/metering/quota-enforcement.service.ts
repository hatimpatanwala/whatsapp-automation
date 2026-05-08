import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { Subscription } from '../../../database/entities/public/subscription.entity';
import { Tenant } from '../../../database/entities/public/tenant.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface QuotaStatus {
  tenantId: string;
  allowed: boolean;
  reason?: string;
  usage: number;
  limit: number;
  percentage: number;
  softLimitReached: boolean;
  hardLimitReached: boolean;
  overageAllowed: boolean;
}

@Injectable()
export class QuotaEnforcementService {
  private readonly logger = new Logger(QuotaEnforcementService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Check if a tenant can send a message (called before each outbound message).
   */
  async canSendMessage(tenantId: string): Promise<QuotaStatus> {
    // Check cache first
    const cached = await this.redis.get(`quota:status:${tenantId}`);
    if (cached) {
      const status = JSON.parse(cached) as QuotaStatus;
      if (status.hardLimitReached && !status.overageAllowed) {
        return status;
      }
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      return this.buildStatus(tenantId, false, 'Tenant not found', 0, 0);
    }

    // Check if messaging is paused
    if ((tenant as any).isMessagingPaused) {
      return this.buildStatus(tenantId, false, `Messaging paused: ${(tenant as any).pauseReason || 'admin action'}`, 0, 0);
    }

    const subscription = await this.subscriptionRepo.findOne({
      where: { tenantId, status: 'active' },
    });

    if (!subscription) {
      return this.buildStatus(tenantId, false, 'No active subscription', 0, 0);
    }

    // Check expiry
    if (subscription.validUntil && new Date() > new Date(subscription.validUntil)) {
      return this.buildStatus(tenantId, false, 'Subscription expired', subscription.conversationsUsed, subscription.maxConversations);
    }

    const usage = subscription.conversationsUsed;
    const limit = subscription.maxConversations;
    const percentage = limit > 0 ? Math.round((usage / limit) * 100) : 100;
    const softLimitReached = percentage >= 80;
    const hardLimitReached = percentage >= 100;
    const allowExceed = subscription.allowExceed ?? false;

    const status: QuotaStatus = {
      tenantId,
      allowed: true,
      usage,
      limit,
      percentage,
      softLimitReached,
      hardLimitReached,
      overageAllowed: allowExceed,
    };

    if (softLimitReached && !hardLimitReached) {
      status.reason = 'Approaching conversation limit (80%)';
      this.eventEmitter.emit('quota.soft_limit', { tenantId, usage, limit, percentage });
    }

    if (hardLimitReached) {
      if (allowExceed) {
        // Tenant opted in to exceed — allow but flag it
        status.allowed = true;
        status.reason = 'Conversation limit exceeded (overage allowed by tenant)';
        this.eventEmitter.emit('quota.exceeded_with_allow', { tenantId, usage, limit });
      } else {
        // Tenant did NOT allow exceeding — hard block
        status.allowed = false;
        status.reason = 'Conversation limit reached. Upgrade your plan or enable exceed in settings.';
        this.eventEmitter.emit('quota.hard_limit', { tenantId, usage, limit });
      }
    }

    // Cache for 60 seconds
    await this.redis.set(`quota:status:${tenantId}`, JSON.stringify(status), 'EX', 60);

    return status;
  }

  /**
   * Pause messaging for a tenant (admin action or auto-triggered).
   */
  async pauseMessaging(tenantId: string, reason: string): Promise<void> {
    await this.tenantRepo.update(tenantId, {
      settings: () => `settings || '{"isMessagingPaused": true, "pauseReason": "${reason}", "pausedAt": "${new Date().toISOString()}"}'::jsonb`,
    } as any);
    await this.redis.del(`quota:status:${tenantId}`);
    this.logger.warn(`Messaging paused for tenant ${tenantId}: ${reason}`);
  }

  /**
   * Resume messaging for a tenant.
   */
  async resumeMessaging(tenantId: string): Promise<void> {
    await this.tenantRepo.update(tenantId, {
      settings: () => `settings - 'isMessagingPaused' - 'pauseReason' - 'pausedAt'`,
    } as any);
    await this.redis.del(`quota:status:${tenantId}`);
    this.logger.log(`Messaging resumed for tenant ${tenantId}`);
  }

  /**
   * Reset monthly quotas for all tenants (called by monthly cron).
   */
  async resetMonthlyQuotas(): Promise<number> {
    const result = await this.subscriptionRepo
      .createQueryBuilder()
      .update(Subscription)
      .set({ conversationsUsed: 0 })
      .where('status = :status', { status: 'active' })
      .execute();

    // Clear all cached quota statuses (using SCAN instead of KEYS to avoid blocking Redis)
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'quota:status:*', 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');

    this.logger.log(`Monthly quota reset completed for ${result.affected} subscriptions`);
    return result.affected || 0;
  }

  /**
   * Add top-up conversations to a tenant.
   */
  async addTopup(tenantId: string, additionalConversations: number): Promise<void> {
    await this.subscriptionRepo
      .createQueryBuilder()
      .update(Subscription)
      .set({ maxConversations: () => `max_conversations + ${additionalConversations}` })
      .where('tenant_id = :tenantId AND status = :status', { tenantId, status: 'active' })
      .execute();
    await this.redis.del(`quota:status:${tenantId}`);
  }

  private buildStatus(
    tenantId: string, allowed: boolean, reason: string, usage: number, limit: number,
  ): QuotaStatus {
    return {
      tenantId,
      allowed,
      reason,
      usage,
      limit,
      percentage: limit > 0 ? Math.round((usage / limit) * 100) : 0,
      softLimitReached: false,
      hardLimitReached: !allowed,
      overageAllowed: false,
    };
  }
}
