import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity({ name: 'razorpay_subscriptions', schema: 'public' })
export class RazorpaySubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'subscription_id', nullable: true })
  subscriptionId: string;

  @Column({ name: 'razorpay_subscription_id', length: 100, unique: true, nullable: true })
  razorpaySubscriptionId: string;

  @Column({ name: 'razorpay_plan_id', length: 100 })
  razorpayPlanId: string;

  @Column({ name: 'razorpay_customer_id', length: 100, nullable: true })
  razorpayCustomerId: string;

  @Column({ length: 30, default: 'created' })
  status: string;

  @Column({ name: 'current_start', type: 'timestamptz', nullable: true })
  currentStart: Date;

  @Column({ name: 'current_end', type: 'timestamptz', nullable: true })
  currentEnd: Date;

  @Column({ name: 'short_url', length: 500, nullable: true })
  shortUrl: string;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
