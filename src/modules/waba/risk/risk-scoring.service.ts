import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../config/redis.module';
import { TenantRiskScore } from '../../../database/entities/public/tenant-risk-score.entity';
import { NumberHealth } from '../../../database/entities/public/number-health.entity';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { Subscription } from '../../../database/entities/public/subscription.entity';
import { WabaAllocationService } from '../allocation/waba-allocation.service';

export interface RiskAssessment {
  tenantId: string;
  riskScore: number;
  riskLevel: string;
  signals: Record<string, number>;
  actions: string[];
}

/**
 * Composite risk scoring service.
 * Aggregates signals from multiple sources into a single risk score per tenant.
 *
 * Signal weights:
 *   quality (25%) — phone number quality ratings
 *   abuse   (25%) — spam reports, blocks
 *   delivery(15%) — low delivery rates
 *   content (15%) — template rejections, policy violations
 *   payment (10%) — overdue invoices
 *   volume  (10%) — sudden spikes
 */
@Injectable()
export class RiskScoringService {
  private readonly logger = new Logger(RiskScoringService.name);

  private readonly weights = {
    quality: 0.25,
    abuse: 0.25,
    delivery: 0.15,
    content: 0.15,
    payment: 0.10,
    volume: 0.10,
  };

  constructor(
    @InjectRepository(TenantRiskScore)
    private readonly riskRepo: Repository<TenantRiskScore>,
    @InjectRepository(NumberHealth)
    private readonly healthRepo: Repository<NumberHealth>,
    @InjectRepository(PhoneNumber)
    private readonly phoneRepo: Repository<PhoneNumber>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    private readonly allocationService: WabaAllocationService,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  /**
   * Score a tenant based on all available signals.
   */
  async scoreTenant(tenantId: string): Promise<RiskAssessment> {
    const signals = {
      quality: await this.calculateQualitySignal(tenantId),
      abuse: await this.calculateAbuseSignal(tenantId),
      delivery: await this.calculateDeliverySignal(tenantId),
      content: await this.calculateContentSignal(tenantId),
      payment: await this.calculatePaymentSignal(tenantId),
      volume: await this.calculateVolumeSignal(tenantId),
    };

    // Weighted composite score
    const riskScore = Math.round(
      signals.quality * this.weights.quality +
      signals.abuse * this.weights.abuse +
      signals.delivery * this.weights.delivery +
      signals.content * this.weights.content +
      signals.payment * this.weights.payment +
      signals.volume * this.weights.volume,
    );

    const riskLevel = this.scoreToLevel(riskScore);
    const actions = this.determineActions(riskScore, riskLevel, signals);

    // Upsert risk score
    let risk = await this.riskRepo.findOne({ where: { tenantId } });
    if (!risk) {
      risk = this.riskRepo.create({ tenantId });
    }

    const previousScore = risk.riskScore;
    risk.riskScore = riskScore;
    risk.riskLevel = riskLevel;
    risk.qualitySignal = signals.quality;
    risk.abuseSignal = signals.abuse;
    risk.deliverySignal = signals.delivery;
    risk.contentSignal = signals.content;
    risk.paymentSignal = signals.payment;
    risk.volumeSignal = signals.volume;
    risk.scoreBreakdown = signals;
    risk.lastScoredAt = new Date();

    // Append to history (keep last 30)
    const history = risk.scoreHistory || [];
    history.push({ score: riskScore, level: riskLevel, timestamp: new Date().toISOString() });
    risk.scoreHistory = history.slice(-30);

    await this.riskRepo.save(risk);

    // Execute automated actions
    if (riskLevel === 'critical' && !risk.isQuarantined) {
      await this.executeQuarantine(tenantId, risk, riskScore);
    }

    if (risk.isQuarantined && riskScore <= 30) {
      await this.executeUnquarantine(tenantId, risk, riskScore);
    }

    return { tenantId, riskScore, riskLevel, signals, actions };
  }

  /**
   * Get risk summary for all tenants (admin dashboard).
   */
  async getRiskSummary(): Promise<{
    total: number;
    byLevel: Record<string, number>;
    quarantined: number;
    highRiskTenants: TenantRiskScore[];
  }> {
    const all = await this.riskRepo.find({ order: { riskScore: 'DESC' } });
    const byLevel: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    all.forEach(r => { byLevel[r.riskLevel] = (byLevel[r.riskLevel] || 0) + 1; });

    return {
      total: all.length,
      byLevel,
      quarantined: all.filter(r => r.isQuarantined).length,
      highRiskTenants: all.filter(r => r.riskScore > 50).slice(0, 10),
    };
  }

  /**
   * Get risk score for a specific tenant.
   */
  async getTenantRisk(tenantId: string): Promise<TenantRiskScore | null> {
    return this.riskRepo.findOne({ where: { tenantId } });
  }

  // ─── Signal calculators ────────────────────────────────────────────────

  private async calculateQualitySignal(tenantId: string): Promise<number> {
    const phones = await this.phoneRepo.find({ where: { tenantId } });
    if (phones.length === 0) return 0;

    const healthRecords = await Promise.all(
      phones.map(p => this.healthRepo.findOne({ where: { phoneNumberId: p.id } })),
    );

    const validRecords = healthRecords.filter(Boolean);
    if (validRecords.length === 0) return 0;

    let signal = 0;
    for (const h of validRecords) {
      if (h.qualityRating === 'YELLOW') signal += 30;
      if (h.qualityRating === 'RED') signal += 70;
    }

    return Math.min(100, Math.round(signal / validRecords.length));
  }

  private async calculateAbuseSignal(tenantId: string): Promise<number> {
    const phones = await this.phoneRepo.find({ where: { tenantId } });
    const healthRecords = await Promise.all(
      phones.map(p => this.healthRepo.findOne({ where: { phoneNumberId: p.id } })),
    );

    let totalSpam = 0;
    let totalBlocks = 0;
    for (const h of healthRecords.filter(Boolean)) {
      totalSpam += h.spamReports24h;
      totalBlocks += h.blocks24h;
    }

    // Scale: 0 reports = 0, 10+ reports = 100
    return Math.min(100, (totalSpam * 10) + (totalBlocks * 5));
  }

  private async calculateDeliverySignal(tenantId: string): Promise<number> {
    const phones = await this.phoneRepo.find({ where: { tenantId } });
    const healthRecords = await Promise.all(
      phones.map(p => this.healthRepo.findOne({ where: { phoneNumberId: p.id } })),
    );

    const validRecords = healthRecords.filter(h => h && h.messagesSent24h > 0);
    if (validRecords.length === 0) return 0;

    const avgDeliveryRate = validRecords.reduce((sum, h) => sum + Number(h.deliveryRate), 0) / validRecords.length;

    // Low delivery = high risk. 100% delivery = 0 risk, <70% = 100 risk
    if (avgDeliveryRate >= 95) return 0;
    if (avgDeliveryRate >= 90) return 20;
    if (avgDeliveryRate >= 80) return 50;
    if (avgDeliveryRate >= 70) return 75;
    return 100;
  }

  private async calculateContentSignal(tenantId: string): Promise<number> {
    const phones = await this.phoneRepo.find({ where: { tenantId } });
    const healthRecords = await Promise.all(
      phones.map(p => this.healthRepo.findOne({ where: { phoneNumberId: p.id } })),
    );

    let totalRejections = 0;
    for (const h of healthRecords.filter(Boolean)) {
      totalRejections += h.templateRejections30d;
    }

    // Scale: 0 rejections = 0, 5+ = 100
    return Math.min(100, totalRejections * 20);
  }

  private async calculatePaymentSignal(tenantId: string): Promise<number> {
    // Check subscription status
    const subscription = await this.subscriptionRepo.findOne({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });

    if (!subscription) return 50; // No subscription = moderate risk
    if (subscription.status === 'active') return 0;
    if (subscription.status === 'past_due') return 60;
    if (subscription.status === 'suspended') return 90;
    return 20;
  }

  private async calculateVolumeSignal(tenantId: string): Promise<number> {
    const now = new Date();
    const hourKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}:${String(now.getHours()).padStart(2, '0')}`;
    const currentHour = await this.redis.get(`volume:${tenantId}:${hourKey}`);
    const avgHourly = await this.redis.get(`volume:${tenantId}:avg`);

    if (!currentHour || !avgHourly) return 0;

    const current = parseInt(currentHour, 10);
    const avg = Math.max(parseInt(avgHourly, 10), 1);
    const ratio = current / avg;

    if (ratio > 5) return 100; // 5x spike
    if (ratio > 3) return 60;
    if (ratio > 2) return 30;
    return 0;
  }

  private scoreToLevel(score: number): string {
    if (score <= 25) return 'low';
    if (score <= 50) return 'medium';
    if (score <= 75) return 'high';
    return 'critical';
  }

  private determineActions(score: number, level: string, signals: Record<string, number>): string[] {
    const actions: string[] = [];

    if (level === 'critical') {
      actions.push('QUARANTINE: Move to isolated WABA pool');
      actions.push('NOTIFY: Alert super admin');
    }

    if (level === 'high') {
      actions.push('THROTTLE: Reduce messaging rate limit');
      actions.push('REVIEW: Flag for manual review');
    }

    if (signals.abuse > 50) {
      actions.push('INVESTIGATE: High abuse signals detected');
    }

    if (signals.payment > 50) {
      actions.push('BILLING: Follow up on payment');
    }

    return actions;
  }

  private async executeUnquarantine(tenantId: string, risk: TenantRiskScore, score: number) {
    try {
      risk.isQuarantined = false;
      risk.quarantineReason = `Auto-unquarantine: risk score improved to ${score}`;
      await this.riskRepo.save(risk);
      this.logger.log(`Tenant ${tenantId} unquarantined — risk score improved to ${score}`);
    } catch (err: any) {
      this.logger.error(`Failed to unquarantine tenant ${tenantId}: ${err.message}`);
    }
  }

  private async executeQuarantine(tenantId: string, risk: TenantRiskScore, score: number) {
    try {
      await this.allocationService.quarantineTenant(tenantId, `Risk score ${score} (critical)`);
      risk.isQuarantined = true;
      risk.quarantinedAt = new Date();
      risk.quarantineReason = `Auto-quarantine: risk score ${score}`;
      await this.riskRepo.save(risk);
      this.logger.warn(`Tenant ${tenantId} quarantined — risk score ${score}`);
    } catch (err: any) {
      this.logger.error(`Failed to quarantine tenant ${tenantId}: ${err.message}`);
    }
  }
}
