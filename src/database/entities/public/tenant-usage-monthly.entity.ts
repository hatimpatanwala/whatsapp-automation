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
 * Aggregated monthly usage per tenant.
 * Rolled up from conversation_sessions and conversation_costs by a cron job.
 * Used for billing, invoicing, and usage dashboard.
 */
@Entity({ name: 'tenant_usage_monthly', schema: 'public' })
@Index('idx_usage_tenant_period', ['tenantId', 'billingPeriod'], { unique: true })
export class TenantUsageMonthly {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** Billing period in YYYY-MM format */
  @Column({ name: 'billing_period', length: 7 })
  billingPeriod: string;

  // ─── Conversation counts by category ────────────────────────────────

  @Column({ name: 'service_conversations', default: 0 })
  serviceConversations: number;

  @Column({ name: 'utility_conversations', default: 0 })
  utilityConversations: number;

  @Column({ name: 'marketing_conversations', default: 0 })
  marketingConversations: number;

  @Column({ name: 'authentication_conversations', default: 0 })
  authenticationConversations: number;

  @Column({ name: 'total_conversations', default: 0 })
  totalConversations: number;

  // ─── Message counts ─────────────────────────────────────────────────

  @Column({ name: 'messages_sent', default: 0 })
  messagesSent: number;

  @Column({ name: 'messages_received', default: 0 })
  messagesReceived: number;

  @Column({ name: 'messages_failed', default: 0 })
  messagesFailed: number;

  // ─── Cost breakdown ─────────────────────────────────────────────────

  /** Total Meta cost (what Meta charges us) */
  @Column({ name: 'meta_cost_total', type: 'decimal', precision: 12, scale: 4, default: 0 })
  metaCostTotal: number;

  /** Platform revenue (our markup) */
  @Column({ name: 'platform_revenue', type: 'decimal', precision: 12, scale: 4, default: 0 })
  platformRevenue: number;

  /** Total tenant charge (meta_cost + markup) */
  @Column({ name: 'tenant_charge_total', type: 'decimal', precision: 12, scale: 4, default: 0 })
  tenantChargeTotal: number;

  /** Overage charges (beyond plan limit) */
  @Column({ name: 'overage_charge', type: 'decimal', precision: 12, scale: 4, default: 0 })
  overageCharge: number;

  @Column({ length: 5, default: 'INR' })
  currency: string;

  // ─── Quota tracking ─────────────────────────────────────────────────

  /** Plan limit for this period */
  @Column({ name: 'quota_limit', default: 0 })
  quotaLimit: number;

  /** How many conversations were in overage */
  @Column({ name: 'overage_count', default: 0 })
  overageCount: number;

  /** Whether the tenant hit the soft limit this month */
  @Column({ name: 'soft_limit_hit', default: false })
  softLimitHit: boolean;

  /** Whether the tenant hit the hard limit this month */
  @Column({ name: 'hard_limit_hit', default: false })
  hardLimitHit: boolean;

  // ─── Reconciliation ─────────────────────────────────────────────────

  /** Whether this record has been reconciled with actual Meta billing */
  @Column({ name: 'is_reconciled', default: false })
  isReconciled: boolean;

  @Column({ name: 'reconciled_at', type: 'timestamptz', nullable: true })
  reconciledAt: Date;

  /** Invoice reference if generated */
  @Column({ name: 'invoice_id', length: 100, nullable: true })
  invoiceId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
