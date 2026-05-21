import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Subscription } from './subscription.entity';

@Entity({ name: 'tenants', schema: 'public' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 100, unique: true })
  slug: string;

  @Column({ name: 'schema_name', length: 120, unique: true })
  schemaName: string;

  @Column({ name: 'phone_number_id', length: 50, nullable: true })
  phoneNumberId: string;

  @Column({ name: 'waba_id', length: 50, nullable: true })
  wabaId: string;

  @Column({ name: 'access_token', type: 'text', nullable: true })
  accessToken: string;

  @Column({ name: 'webhook_secret', length: 255, nullable: true })
  webhookSecret: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  @Column({ name: 'onboarding_status', length: 30, default: 'pending' })
  onboardingStatus: string;

  @Column({ name: 'whatsapp_phone', length: 20, nullable: true })
  whatsappPhone: string;

  @Column({ name: 'admin_whatsapp_number', length: 20, nullable: true })
  adminWhatsappNumber: string;

  @Column({ name: 'admin_whatsapp_verified', default: false })
  adminWhatsappVerified: boolean;

  @Column({ name: 'business_name', length: 255, nullable: true })
  businessName: string;

  @Column({ name: 'business_category', length: 100, nullable: true })
  businessCategory: string;

  @Column({ name: 'business_description', type: 'text', nullable: true })
  businessDescription: string;

  @Column({ name: 'business_address', type: 'text', nullable: true })
  businessAddress: string;

  @Column({ name: 'logo_url', length: 500, nullable: true })
  logoUrl: string;

  @Column({ type: 'jsonb', default: '{}' })
  settings: Record<string, any>;

  @OneToMany(() => Subscription, (sub) => sub.tenant)
  subscriptions: Subscription[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
