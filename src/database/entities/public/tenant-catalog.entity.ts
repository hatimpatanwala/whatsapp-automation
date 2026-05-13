import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity({ name: 'tenant_catalogs', schema: 'public' })
export class TenantCatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'meta_catalog_id', length: 50 })
  metaCatalogId: string;

  @Column({ name: 'meta_business_id', length: 50 })
  metaBusinessId: string;

  @Column({ name: 'catalog_name', length: 255 })
  catalogName: string;

  @Column({ name: 'phone_number_id', length: 50, nullable: true })
  phoneNumberId: string;

  @Column({ name: 'waba_id', length: 50, nullable: true })
  wabaId: string;

  @Column({ length: 30, default: 'active' })
  status: string;

  @Column({ name: 'is_linked_to_phone', default: false })
  isLinkedToPhone: boolean;

  @Column({ name: 'is_catalog_visible', default: false })
  isCatalogVisible: boolean;

  @Column({ name: 'is_cart_enabled', default: false })
  isCartEnabled: boolean;

  @Column({ name: 'product_count', default: 0 })
  productCount: number;

  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt: Date;

  @Column({ name: 'last_sync_status', length: 30, nullable: true })
  lastSyncStatus: string;

  @Column({ name: 'last_sync_error', type: 'text', nullable: true })
  lastSyncError: string;

  @Column({ name: 'provisioned_by', length: 50, default: 'system' })
  provisionedBy: string;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any>;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
