import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'tenant_migration_history', schema: 'public' })
export class TenantMigrationHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'migration_name', length: 255 })
  migrationName: string;

  @CreateDateColumn({ name: 'applied_at' })
  appliedAt: Date;

  @Column({ length: 64, nullable: true })
  checksum: string;
}
