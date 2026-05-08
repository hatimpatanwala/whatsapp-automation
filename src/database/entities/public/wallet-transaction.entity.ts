import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Wallet } from './wallet.entity';
import { Tenant } from './tenant.entity';

@Entity({ name: 'wallet_transactions', schema: 'public' })
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'wallet_id' })
  walletId: string;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 30 })
  type: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  amount: number;

  @Column({ name: 'balance_before', type: 'decimal', precision: 12, scale: 4 })
  balanceBefore: number;

  @Column({ name: 'balance_after', type: 'decimal', precision: 12, scale: 4 })
  balanceAfter: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'reference_type', length: 50, nullable: true })
  referenceType: string;

  @Column({ name: 'reference_id', length: 100, nullable: true })
  referenceId: string;

  @Column({ name: 'razorpay_payment_id', length: 100, nullable: true })
  razorpayPaymentId: string;

  @Column({ name: 'razorpay_order_id', length: 100, nullable: true })
  razorpayOrderId: string;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
