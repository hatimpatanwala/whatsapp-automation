import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity({ name: 'wallets', schema: 'public' })
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', unique: true })
  tenantId: string;

  @OneToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  balance: number;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ name: 'auto_recharge', default: false })
  autoRecharge: boolean;

  @Column({ name: 'auto_recharge_amount', type: 'decimal', precision: 12, scale: 4, default: 0 })
  autoRechargeAmount: number;

  @Column({ name: 'auto_recharge_threshold', type: 'decimal', precision: 12, scale: 4, default: 0 })
  autoRechargeThreshold: number;

  @Column({ name: 'low_balance_alert_threshold', type: 'decimal', precision: 12, scale: 4, default: 100 })
  lowBalanceAlertThreshold: number;

  @Column({ name: 'is_low_balance_alerted', default: false })
  isLowBalanceAlerted: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
