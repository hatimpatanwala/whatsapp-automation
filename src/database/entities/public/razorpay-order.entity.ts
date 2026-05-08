import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity({ name: 'razorpay_orders', schema: 'public' })
export class RazorpayOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'razorpay_order_id', length: 100, unique: true })
  razorpayOrderId: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  amount: number;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ length: 30, default: 'created' })
  status: string;

  @Column({ length: 50 })
  purpose: string;

  @Column({ name: 'razorpay_payment_id', length: 100, nullable: true })
  razorpayPaymentId: string;

  @Column({ name: 'razorpay_signature', length: 255, nullable: true })
  razorpaySignature: string;

  @Column({ length: 100, nullable: true })
  receipt: string;

  @Column({ type: 'jsonb', default: '{}' })
  notes: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
