import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { PhoneNumber } from './phone-number.entity';

@Entity({ name: 'waba_accounts', schema: 'public' })
export class WabaAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'waba_id', length: 50, unique: true })
  wabaId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'business_id', length: 50 })
  businessId: string;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ length: 50, default: 'Asia/Kolkata' })
  timezone: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  @Column({ name: 'meta_business_verification', length: 20, default: 'pending' })
  metaBusinessVerification: string;

  @Column({ name: 'payment_method_attached', default: false })
  paymentMethodAttached: boolean;

  @Column({ name: 'messaging_limit_tier', length: 20, default: 'TIER_1K' })
  messagingLimitTier: string;

  @Column({ name: 'account_review_status', length: 20, default: 'approved' })
  accountReviewStatus: string;

  @Column({ type: 'jsonb', default: '{}' })
  settings: Record<string, any>;

  @OneToMany(() => PhoneNumber, (phone) => phone.wabaAccount)
  phoneNumbers: PhoneNumber[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
