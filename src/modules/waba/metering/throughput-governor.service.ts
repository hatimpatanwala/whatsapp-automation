import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../config/redis.module';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';

/**
 * Dynamic throughput governor.
 * Adjusts messaging rates based on Meta's quality signals, tier limits, and rate limit errors.
 *
 * When Meta returns error 130429 (rate limit), the governor reduces throughput for that number.
 * When quality rating degrades, throughput is proactively reduced to avoid restrictions.
 */
@Injectable()
export class ThroughputGovernorService {
  private readonly logger = new Logger(ThroughputGovernorService.name);

  private readonly tierLimits: Record<string, number> = {
    TIER_1K: 80,
    TIER_10K: 500,
    TIER_100K: 1000,
    TIER_UNLIMITED: 2000,
  };

  constructor(
    @InjectRepository(PhoneNumber)
    private readonly phoneRepo: Repository<PhoneNumber>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async getCurrentThroughput(phoneNumberId: string): Promise<number> {
    // Check if number is currently throttled
    const throttleKey = `throttle:${phoneNumberId}`;
    const throttled = await this.redis.get(throttleKey);
    if (throttled) return parseInt(throttled, 10);

    // Get number's tier limit
    const phone = await this.phoneRepo.findOne({ where: { phoneNumberId } });
    const baseThroughput = this.tierLimits[phone?.messagingLimit || 'TIER_1K'] || 80;

    // Quality-based reduction
    if (phone?.qualityRating === 'YELLOW') return Math.floor(baseThroughput * 0.5);
    if (phone?.qualityRating === 'RED') return Math.floor(baseThroughput * 0.1);

    return baseThroughput;
  }

  async handleRateLimitError(phoneNumberId: string, retryAfterMs?: number): Promise<void> {
    const backoffSeconds = Math.ceil((retryAfterMs || 60000) / 1000);
    const currentRate = await this.getCurrentThroughput(phoneNumberId);
    const reducedRate = Math.max(10, Math.floor(currentRate * 0.5));

    await this.redis.setex(`throttle:${phoneNumberId}`, backoffSeconds, String(reducedRate));
    this.logger.warn(
      `Throttled ${phoneNumberId} to ${reducedRate} msg/sec for ${backoffSeconds}s (was ${currentRate})`,
    );
  }

  async handleQualityChange(phoneNumberId: string, newRating: string): Promise<void> {
    const throughput = await this.getCurrentThroughput(phoneNumberId);
    this.logger.warn(
      `Throughput adjusted for ${phoneNumberId}: ${throughput} msg/sec (quality: ${newRating})`,
    );

    if (newRating === 'RED') {
      // Aggressive throttle for RED quality — persist for 1 hour
      const reducedRate = Math.max(5, Math.floor(throughput * 0.1));
      await this.redis.setex(`throttle:${phoneNumberId}`, 3600, String(reducedRate));
    }
  }

  async clearThrottle(phoneNumberId: string): Promise<void> {
    await this.redis.del(`throttle:${phoneNumberId}`);
    this.logger.log(`Throttle cleared for ${phoneNumberId}`);
  }

  async getThrottleStatus(phoneNumberId: string): Promise<{
    isThrottled: boolean;
    currentRate: number;
    ttl: number;
  }> {
    const throttleKey = `throttle:${phoneNumberId}`;
    const rate = await this.redis.get(throttleKey);
    const ttl = rate ? await this.redis.ttl(throttleKey) : 0;
    const currentRate = await this.getCurrentThroughput(phoneNumberId);

    return {
      isThrottled: !!rate,
      currentRate,
      ttl,
    };
  }
}
