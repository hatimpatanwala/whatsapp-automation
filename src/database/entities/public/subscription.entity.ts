import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity({ name: 'subscriptions', schema: 'public' })
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.subscriptions)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 50 })
  plan: string;

  @Column({ name: 'max_products', default: 50 })
  maxProducts: number;

  @Column({ name: 'max_conversations', default: 1000 })
  maxConversations: number;

  @Column({ name: 'conversations_used', default: 0 })
  conversationsUsed: number;

  @Column({ name: 'max_campaigns_per_month', default: 5 })
  maxCampaignsPerMonth: number;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom: Date;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil: Date;

  @Column({ length: 20, default: 'active' })
  status: string;

  @Column({ name: 'allow_exceed', default: false })
  allowExceed: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
