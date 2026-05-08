import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { WabaAccount } from './waba-account.entity';
import { Tenant } from './tenant.entity';

@Entity({ name: 'phone_numbers', schema: 'public' })
export class PhoneNumber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'waba_account_id', nullable: true })
  wabaAccountId: string;

  @ManyToOne(() => WabaAccount, (waba) => waba.phoneNumbers)
  @JoinColumn({ name: 'waba_account_id' })
  wabaAccount: WabaAccount;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'phone_number', length: 20 })
  phoneNumber: string;

  @Column({ name: 'phone_number_id', length: 50, unique: true, nullable: true })
  phoneNumberId: string;

  @Column({ name: 'display_name', length: 255, nullable: true })
  displayName: string;

  @Column({ name: 'verified_name', length: 255, nullable: true })
  verifiedName: string;

  @Column({ name: 'quality_rating', length: 20, default: 'GREEN' })
  qualityRating: string;

  @Column({ name: 'messaging_limit', length: 20, default: 'TIER_1K' })
  messagingLimit: string;

  @Column({ length: 20, default: 'pending_registration' })
  status: string;

  @Column({ name: 'registration_status', length: 30, default: 'not_started' })
  registrationStatus: string;

  @Column({ name: 'code_verification_status', length: 20, default: 'not_verified' })
  codeVerificationStatus: string;

  @Column({ name: 'platform_type', length: 20, default: 'CLOUD_API' })
  platformType: string;

  @Column({ type: 'text', nullable: true })
  certificate: string;

  @Column({ name: 'name_status', length: 20, default: 'NONE' })
  nameStatus: string;

  @Column({ name: 'is_official_business_account', default: false })
  isOfficialBusinessAccount: boolean;

  @Column({ name: 'is_pin_enabled', default: false })
  isPinEnabled: boolean;

  @Column({ name: 'last_onboarded_at', type: 'timestamptz', nullable: true })
  lastOnboardedAt: Date;

  @Column({ name: 'webhook_subscribed', default: false })
  webhookSubscribed: boolean;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
