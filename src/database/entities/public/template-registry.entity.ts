import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { WabaAccount } from './waba-account.entity';
import { Tenant } from './tenant.entity';

@Entity({ name: 'template_registry', schema: 'public' })
export class TemplateRegistry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'waba_account_id' })
  wabaAccountId: string;

  @ManyToOne(() => WabaAccount)
  @JoinColumn({ name: 'waba_account_id' })
  wabaAccount: WabaAccount;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'template_name', length: 255 })
  templateName: string;

  @Column({ name: 'meta_template_id', length: 100, nullable: true })
  metaTemplateId: string;

  @Column({ type: 'varchar', length: 20 })
  category: string;

  @Column({ length: 10 })
  language: string;

  @Column({ type: 'jsonb', default: '{}' })
  components: Record<string, any>;

  @Column({ length: 20, default: 'draft' })
  status: string;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ name: 'quality_score', type: 'decimal', precision: 5, scale: 2, nullable: true })
  qualityScore: number;

  @Column({ name: 'is_platform_template', default: false })
  isPlatformTemplate: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
