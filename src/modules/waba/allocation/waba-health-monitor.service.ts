import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NumberHealth } from '../../../database/entities/public/number-health.entity';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * Monitors phone number health and WABA pool metrics.
 * Updates NumberHealth records based on webhook events and periodic checks.
 */
@Injectable()
export class WabaHealthMonitorService {
  private readonly logger = new Logger(WabaHealthMonitorService.name);

  constructor(
    @InjectRepository(NumberHealth)
    private readonly healthRepo: Repository<NumberHealth>,
    @InjectRepository(PhoneNumber)
    private readonly phoneRepo: Repository<PhoneNumber>,
  ) {}

  /**
   * Record a quality rating change from Meta webhook.
   */
  async recordQualityUpdate(phoneNumberId: string, newRating: string, event?: string) {
    let health = await this.healthRepo.findOne({ where: { phoneNumberId } });

    if (!health) {
      health = this.healthRepo.create({
        phoneNumberId,
        qualityRating: newRating,
        qualityHistory: [],
      });
    }

    const previousRating = health.qualityRating;
    health.previousQualityRating = previousRating;
    health.qualityRating = newRating;
    health.qualityChangedAt = new Date();

    // Append to history (keep last 30)
    const history = health.qualityHistory || [];
    history.push({ rating: newRating, timestamp: new Date().toISOString(), event });
    health.qualityHistory = history.slice(-30);

    // Recalculate health score
    health.healthScore = this.calculateHealthScore(health);

    await this.healthRepo.save(health);

    this.logger.log(`Quality update for ${phoneNumberId}: ${previousRating} → ${newRating}`);

    return health;
  }

  /**
   * Record delivery metrics from status webhooks.
   */
  async recordDeliveryMetric(phoneNumberId: string, status: 'sent' | 'delivered' | 'read' | 'failed') {
    let health = await this.healthRepo.findOne({ where: { phoneNumberId } });

    if (!health) {
      health = this.healthRepo.create({ phoneNumberId, qualityHistory: [] });
    }

    switch (status) {
      case 'sent': health.messagesSent24h++; break;
      case 'delivered': health.messagesDelivered24h++; break;
      case 'read': health.messagesRead24h++; break;
      case 'failed': health.messagesFailed24h++; break;
    }

    // Recalculate rates
    if (health.messagesSent24h > 0) {
      health.deliveryRate = Number(((health.messagesDelivered24h / health.messagesSent24h) * 100).toFixed(2));
      health.readRate = Number(((health.messagesRead24h / health.messagesSent24h) * 100).toFixed(2));
    }

    health.healthScore = this.calculateHealthScore(health);
    await this.healthRepo.save(health);
  }

  /**
   * Record abuse signals.
   */
  async recordAbuseSignal(phoneNumberId: string, type: 'spam_report' | 'block' | 'template_rejection') {
    let health = await this.healthRepo.findOne({ where: { phoneNumberId } });
    if (!health) {
      health = this.healthRepo.create({ phoneNumberId, qualityHistory: [] });
    }

    switch (type) {
      case 'spam_report': health.spamReports24h++; break;
      case 'block': health.blocks24h++; break;
      case 'template_rejection': health.templateRejections30d++; break;
    }

    health.healthScore = this.calculateHealthScore(health);
    await this.healthRepo.save(health);
  }

  /**
   * Get health summary for admin dashboard.
   */
  async getHealthSummary(): Promise<{
    total: number;
    green: number;
    yellow: number;
    red: number;
    throttled: number;
    avgHealthScore: number;
  }> {
    const allHealth = await this.healthRepo.find();

    return {
      total: allHealth.length,
      green: allHealth.filter(h => h.qualityRating === 'GREEN').length,
      yellow: allHealth.filter(h => h.qualityRating === 'YELLOW').length,
      red: allHealth.filter(h => h.qualityRating === 'RED').length,
      throttled: allHealth.filter(h => h.isThrottled).length,
      avgHealthScore: allHealth.length > 0
        ? Math.round(allHealth.reduce((sum, h) => sum + h.healthScore, 0) / allHealth.length)
        : 100,
    };
  }

  /**
   * Reset rolling 24h counters. Run daily at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async resetDailyCounters() {
    await this.healthRepo.update({}, {
      messagesSent24h: 0,
      messagesDelivered24h: 0,
      messagesRead24h: 0,
      messagesFailed24h: 0,
      spamReports24h: 0,
      blocks24h: 0,
    });
    this.logger.log('Reset daily health counters');
  }

  private calculateHealthScore(health: NumberHealth): number {
    let score = 100;

    // Quality rating impact
    if (health.qualityRating === 'YELLOW') score -= 20;
    if (health.qualityRating === 'RED') score -= 50;

    // Delivery rate impact
    if (health.deliveryRate < 95) score -= 10;
    if (health.deliveryRate < 90) score -= 15;
    if (health.deliveryRate < 80) score -= 25;

    // Abuse signals impact
    score -= Math.min(health.spamReports24h * 5, 20);
    score -= Math.min(health.blocks24h * 3, 15);
    score -= Math.min(health.templateRejections30d * 2, 10);

    // Throttle impact
    if (health.isThrottled) score -= 15;

    return Math.max(0, Math.min(100, score));
  }
}
