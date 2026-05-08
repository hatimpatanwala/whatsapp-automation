import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';

/**
 * Composite risk scoring per tenant.
 * Aggregates signals from quality ratings, abuse reports, delivery metrics,
 * content violations, and payment behavior into a single risk score.
 * Used for WABA pool allocation decisions and quarantine triggers.
 */
@Entity({ name: 'tenant_risk_scores', schema: 'public' })
@Index('idx_risk_tenant', ['tenantId'], { unique: true })
@Index('idx_risk_level', ['riskLevel'])
export class TenantRiskScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** Composite score 0-100 (higher = riskier) */
  @Column({ name: 'risk_score', default: 0 })
  riskScore: number;

  /** Risk level derived from score: low (0-25), medium (26-50), high (51-75), critical (76-100) */
  @Column({ name: 'risk_level', length: 15, default: 'low' })
  riskLevel: string;

  // ─── Individual signal scores (0-100 each) ─────────────────────────

  /** Quality signal: based on phone number quality ratings */
  @Column({ name: 'quality_signal', default: 0 })
  qualitySignal: number;

  /** Abuse signal: spam reports, blocks, complaints */
  @Column({ name: 'abuse_signal', default: 0 })
  abuseSignal: number;

  /** Delivery signal: low delivery/read rates */
  @Column({ name: 'delivery_signal', default: 0 })
  deliverySignal: number;

  /** Content signal: template rejections, policy violations */
  @Column({ name: 'content_signal', default: 0 })
  contentSignal: number;

  /** Payment signal: overdue invoices, chargebacks */
  @Column({ name: 'payment_signal', default: 0 })
  paymentSignal: number;

  /** Volume signal: sudden spikes in messaging volume */
  @Column({ name: 'volume_signal', default: 0 })
  volumeSignal: number;

  // ─── Actions and flags ─────────────────────────────────────────────

  /** Whether tenant has been moved to quarantine WABA */
  @Column({ name: 'is_quarantined', default: false })
  isQuarantined: boolean;

  @Column({ name: 'quarantined_at', type: 'timestamptz', nullable: true })
  quarantinedAt: Date;

  @Column({ name: 'quarantine_reason', type: 'text', nullable: true })
  quarantineReason: string;

  /** Whether messaging is suspended due to risk */
  @Column({ name: 'is_suspended', default: false })
  isSuspended: boolean;

  /** Detailed breakdown stored for audit */
  @Column({ name: 'score_breakdown', type: 'jsonb', default: '{}' })
  scoreBreakdown: Record<string, any>;

  /** History of risk score changes (last 30) */
  @Column({ name: 'score_history', type: 'jsonb', default: '[]' })
  scoreHistory: Array<{ score: number; level: string; timestamp: string }>;

  @Column({ name: 'last_scored_at', type: 'timestamptz', nullable: true })
  lastScoredAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
