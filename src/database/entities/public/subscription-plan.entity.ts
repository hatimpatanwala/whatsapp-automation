import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'subscription_plans', schema: 'public' })
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 30 })
  tier: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'monthly_price', type: 'int', default: 0 })
  monthlyPrice: number;

  @Column({ name: 'yearly_price', type: 'int', default: 0 })
  yearlyPrice: number;

  @Column({ name: 'price_per_conversation', type: 'int', default: 0 })
  pricePerConversation: number;

  /**
   * Usage limits as JSONB.
   * Keys: conversationLimit, messageLimit, productLimit, campaignLimit, userLimit
   * null values mean unlimited.
   */
  @Column({ type: 'jsonb', default: '{}' })
  limits: Record<string, number | null>;

  /**
   * Feature flags as JSONB.
   * Keys: campaigns, conversations, deliveries, customers, whatsappCatalog,
   *        workflowBuilder, aiFeatures, advancedAnalytics, multiCatalog
   * Values: true/false
   */
  @Column({ type: 'jsonb', default: '{}' })
  features: Record<string, boolean>;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Returns an array of enabled feature keys.
   */
  getEnabledFeatures(): string[] {
    if (!this.features) return [];
    return Object.entries(this.features)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
  }
}
