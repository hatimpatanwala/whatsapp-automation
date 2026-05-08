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
 * Per-tenant quota configuration.
 * Defines plan limits, soft/hard thresholds, billing model, and rate limits.
 * One active config per tenant — updated when plan changes.
 */
@Entity({ name: 'tenant_quota_configs', schema: 'public' })
@Index('idx_quota_tenant', ['tenantId'], { unique: true })
export class TenantQuotaConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** Plan tier name (starter, growth, professional, enterprise) */
  @Column({ name: 'plan_tier', length: 30, default: 'starter' })
  planTier: string;

  /** Max conversations per billing cycle */
  @Column({ name: 'max_conversations', default: 500 })
  maxConversations: number;

  /** Max marketing conversations per month (subset of max) */
  @Column({ name: 'max_marketing', default: 100 })
  maxMarketing: number;

  /** Max phone numbers allowed */
  @Column({ name: 'max_phone_numbers', default: 1 })
  maxPhoneNumbers: number;

  /** Soft limit percentage (triggers warning) */
  @Column({ name: 'soft_limit_pct', default: 80 })
  softLimitPct: number;

  /** Hard limit percentage (blocks new conversations) */
  @Column({ name: 'hard_limit_pct', default: 100 })
  hardLimitPct: number;

  /** Billing model: 'prepaid' or 'postpaid' */
  @Column({ name: 'billing_model', length: 15, default: 'postpaid' })
  billingModel: string;

  /** Whether tenant can exceed hard limit (overage charges apply) */
  @Column({ name: 'allow_overage', default: false })
  allowOverage: boolean;

  /** Per-conversation overage rate (INR) */
  @Column({ name: 'overage_rate', type: 'decimal', precision: 10, scale: 4, default: 0.50 })
  overageRate: number;

  /** Rate limit: messages per second */
  @Column({ name: 'rate_limit_mps', default: 10 })
  rateLimitMps: number;

  /** Rate limit: messages per hour */
  @Column({ name: 'rate_limit_mph', default: 1000 })
  rateLimitMph: number;

  /** Whether messaging is currently paused */
  @Column({ name: 'is_messaging_paused', default: false })
  isMessagingPaused: boolean;

  @Column({ name: 'pause_reason', type: 'text', nullable: true })
  pauseReason: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
