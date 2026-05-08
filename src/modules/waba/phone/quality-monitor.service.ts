import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QualityScore } from '../../../database/entities/public/quality-score.entity';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class QualityMonitorService {
  private readonly logger = new Logger(QualityMonitorService.name);

  constructor(
    @InjectRepository(QualityScore)
    private readonly qualityRepo: Repository<QualityScore>,
    @InjectRepository(PhoneNumber)
    private readonly phoneRepo: Repository<PhoneNumber>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Record a quality score change from Meta webhook.
   */
  async recordQualityChange(phoneNumberId: string, data: {
    currentRating: string;
    eventType: string;
    reason?: string;
  }): Promise<void> {
    const phone = await this.phoneRepo.findOne({ where: { phoneNumberId } });
    if (!phone) {
      this.logger.warn(`Quality update for unknown phone: ${phoneNumberId}`);
      return;
    }

    const previousRating = phone.qualityRating;

    // Record the score change
    const score = this.qualityRepo.create({
      phoneNumberId: phone.id,
      qualityRating: data.currentRating,
      previousRating,
      reason: data.reason,
    });
    await this.qualityRepo.save(score);

    // Update phone's current rating
    await this.phoneRepo.update(phone.id, { qualityRating: data.currentRating });

    // Emit events for degradation
    if (this.isDowngrade(previousRating, data.currentRating)) {
      this.logger.warn(`Quality downgrade for ${phone.phoneNumber}: ${previousRating} → ${data.currentRating}`);
      this.eventEmitter.emit('phone.quality_downgrade', {
        phoneId: phone.id,
        phoneNumber: phone.phoneNumber,
        tenantId: phone.tenantId,
        previousRating,
        currentRating: data.currentRating,
        reason: data.reason,
      });
    }
  }

  /**
   * Get quality history for a phone number.
   */
  async getQualityHistory(phoneId: string, limit = 30): Promise<QualityScore[]> {
    return this.qualityRepo.find({
      where: { phoneNumberId: phoneId },
      order: { recordedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get current quality summary for all phones.
   */
  async getQualitySummary(): Promise<{
    total: number;
    green: number;
    yellow: number;
    red: number;
  }> {
    const phones = await this.phoneRepo.find({ where: { status: 'active' } });
    return {
      total: phones.length,
      green: phones.filter(p => p.qualityRating === 'GREEN').length,
      yellow: phones.filter(p => p.qualityRating === 'YELLOW').length,
      red: phones.filter(p => p.qualityRating === 'RED').length,
    };
  }

  private isDowngrade(previous: string, current: string): boolean {
    const order: Record<string, number> = { GREEN: 3, YELLOW: 2, RED: 1 };
    return (order[current] || 0) < (order[previous] || 0);
  }
}
