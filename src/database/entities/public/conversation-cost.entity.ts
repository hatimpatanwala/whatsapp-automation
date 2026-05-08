import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ConversationSession } from './conversation-session.entity';
import { Tenant } from './tenant.entity';

@Entity({ name: 'conversation_costs', schema: 'public' })
export class ConversationCost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_session_id' })
  conversationSessionId: string;

  @ManyToOne(() => ConversationSession)
  @JoinColumn({ name: 'conversation_session_id' })
  conversationSession: ConversationSession;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 20 })
  category: string;

  @Column({ name: 'meta_cost', type: 'decimal', precision: 10, scale: 6, default: 0 })
  metaCost: number;

  @Column({ name: 'platform_cost', type: 'decimal', precision: 10, scale: 6, default: 0 })
  platformCost: number;

  @Column({ name: 'tenant_charge', type: 'decimal', precision: 10, scale: 6, default: 0 })
  tenantCharge: number;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ name: 'billing_period', length: 20, nullable: true })
  billingPeriod: string;

  @Column({ name: 'is_reconciled', default: false })
  isReconciled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
