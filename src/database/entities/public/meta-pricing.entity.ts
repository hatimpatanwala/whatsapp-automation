import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Meta pricing rate card per country and conversation category.
 * Updated periodically from Meta's published rates.
 * Includes platform markup for tenant billing.
 */
@Entity({ name: 'meta_pricing', schema: 'public' })
@Index('idx_pricing_country_category', ['countryCode', 'category'], { unique: true })
export class MetaPricing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** ISO 3166-1 alpha-2 country code */
  @Column({ name: 'country_code', length: 5 })
  countryCode: string;

  @Column({ name: 'country_name', length: 100 })
  countryName: string;

  /** Conversation category */
  @Column({ type: 'varchar', length: 20 })
  category: string;

  /** Meta's cost per conversation (USD) */
  @Column({ name: 'meta_cost_usd', type: 'decimal', precision: 10, scale: 6, default: 0 })
  metaCostUsd: number;

  /** Meta's cost in local currency */
  @Column({ name: 'meta_cost_local', type: 'decimal', precision: 10, scale: 6, default: 0 })
  metaCostLocal: number;

  /** Local currency code */
  @Column({ name: 'local_currency', length: 5, default: 'USD' })
  localCurrency: string;

  /** Platform markup percentage (e.g., 15 = 15%) */
  @Column({ name: 'markup_pct', type: 'decimal', precision: 5, scale: 2, default: 15 })
  markupPct: number;

  /** Final tenant rate = meta_cost_local * (1 + markup_pct/100) */
  @Column({ name: 'tenant_rate', type: 'decimal', precision: 10, scale: 6, default: 0 })
  tenantRate: number;

  /** Whether this pricing entry is active */
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /** Effective date for this rate */
  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: Date;

  /** End date (null = current) */
  @Column({ name: 'effective_until', type: 'date', nullable: true })
  effectiveUntil: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
