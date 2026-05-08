import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { PhoneNumber } from './phone-number.entity';
import { Tenant } from './tenant.entity';

@Entity({ name: 'conversation_sessions', schema: 'public' })
export class ConversationSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'phone_number_id' })
  phoneNumberId: string;

  @ManyToOne(() => PhoneNumber)
  @JoinColumn({ name: 'phone_number_id' })
  phoneNumber: PhoneNumber;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'customer_phone', length: 20 })
  customerPhone: string;

  @Column({ name: 'conversation_id_meta', length: 100, nullable: true })
  conversationIdMeta: string;

  @Column({ type: 'varchar', length: 20 })
  category: string;

  @Column({ type: 'varchar', length: 20 })
  origin: string;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'is_billable', default: true })
  isBillable: boolean;

  @Column({ name: 'is_free_tier', default: false })
  isFreeTier: boolean;

  @Column({ name: 'is_free_entry_point', default: false })
  isFreeEntryPoint: boolean;

  @Column({ length: 20, default: 'open' })
  status: string;

  @Column({ name: 'message_count', default: 0 })
  messageCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
