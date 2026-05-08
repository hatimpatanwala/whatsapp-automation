import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';

export interface RateLimitConfig {
  messagesPerSecond: number;
  messagesPerMinute: number;
  messagesPerHour: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
  window: string;
}

const DEFAULT_LIMITS: RateLimitConfig = {
  messagesPerSecond: 80,
  messagesPerMinute: 1000,
  messagesPerHour: 10000,
};

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  /**
   * Check and consume a rate limit token for the tenant.
   * Uses sliding window counters in Redis.
   */
  async checkRateLimit(tenantId: string, limits?: Partial<RateLimitConfig>): Promise<RateLimitResult> {
    const config = { ...DEFAULT_LIMITS, ...limits };
    const now = Date.now();

    // Check per-second limit
    const secResult = await this.checkWindow(tenantId, 'sec', 1000, config.messagesPerSecond, now);
    if (!secResult.allowed) return secResult;

    // Check per-minute limit
    const minResult = await this.checkWindow(tenantId, 'min', 60000, config.messagesPerMinute, now);
    if (!minResult.allowed) return minResult;

    // Check per-hour limit
    const hourResult = await this.checkWindow(tenantId, 'hour', 3600000, config.messagesPerHour, now);
    if (!hourResult.allowed) return hourResult;

    // All checks passed, consume a token from all windows
    await this.consume(tenantId, now);

    return { allowed: true, remaining: Math.min(secResult.remaining, minResult.remaining, hourResult.remaining) - 1, window: 'all' };
  }

  /**
   * Get current rate limit status without consuming a token.
   */
  async getStatus(tenantId: string): Promise<{
    perSecond: { used: number; limit: number };
    perMinute: { used: number; limit: number };
    perHour: { used: number; limit: number };
  }> {
    const now = Date.now();
    const config = DEFAULT_LIMITS;

    const secUsed = await this.getWindowCount(tenantId, 'sec', 1000, now);
    const minUsed = await this.getWindowCount(tenantId, 'min', 60000, now);
    const hourUsed = await this.getWindowCount(tenantId, 'hour', 3600000, now);

    return {
      perSecond: { used: secUsed, limit: config.messagesPerSecond },
      perMinute: { used: minUsed, limit: config.messagesPerMinute },
      perHour: { used: hourUsed, limit: config.messagesPerHour },
    };
  }

  /**
   * Override rate limits for a specific tenant (admin action).
   */
  async setTenantLimits(tenantId: string, limits: Partial<RateLimitConfig>): Promise<void> {
    await this.redis.set(`ratelimit:config:${tenantId}`, JSON.stringify(limits), 'EX', 86400 * 30);
  }

  /**
   * Get custom tenant limits if set.
   */
  async getTenantLimits(tenantId: string): Promise<RateLimitConfig> {
    const cached = await this.redis.get(`ratelimit:config:${tenantId}`);
    if (cached) {
      return { ...DEFAULT_LIMITS, ...JSON.parse(cached) };
    }
    return DEFAULT_LIMITS;
  }

  private async checkWindow(
    tenantId: string, window: string, windowMs: number, limit: number, now: number,
  ): Promise<RateLimitResult> {
    const key = `ratelimit:${tenantId}:${window}`;
    const windowStart = now - windowMs;

    // Count requests in current window using sorted set
    const count = await this.redis.zcount(key, windowStart, now);

    if (count >= limit) {
      // Find when the oldest entry in this window will expire
      const oldest = await this.redis.zrangebyscore(key, windowStart, now, 'LIMIT', 0, 1);
      const retryAfterMs = oldest.length > 0 ? (parseInt(oldest[0]) + windowMs - now) : windowMs;

      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(retryAfterMs, 100),
        window,
      };
    }

    return { allowed: true, remaining: limit - count, window };
  }

  private async consume(tenantId: string, now: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

    // Add to all windows
    pipeline.zadd(`ratelimit:${tenantId}:sec`, now, member);
    pipeline.zadd(`ratelimit:${tenantId}:min`, now, member);
    pipeline.zadd(`ratelimit:${tenantId}:hour`, now, member);

    // Trim old entries
    pipeline.zremrangebyscore(`ratelimit:${tenantId}:sec`, 0, now - 1000);
    pipeline.zremrangebyscore(`ratelimit:${tenantId}:min`, 0, now - 60000);
    pipeline.zremrangebyscore(`ratelimit:${tenantId}:hour`, 0, now - 3600000);

    // Set expiry on keys
    pipeline.expire(`ratelimit:${tenantId}:sec`, 2);
    pipeline.expire(`ratelimit:${tenantId}:min`, 120);
    pipeline.expire(`ratelimit:${tenantId}:hour`, 7200);

    await pipeline.exec();
  }

  private async getWindowCount(tenantId: string, window: string, windowMs: number, now: number): Promise<number> {
    return this.redis.zcount(`ratelimit:${tenantId}:${window}`, now - windowMs, now);
  }
}
