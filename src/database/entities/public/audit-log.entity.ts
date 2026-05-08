import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'audit_logs', schema: 'public' })
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: string;

  @Column({ name: 'actor_type', length: 20 })
  actorType: string;

  @Column({ name: 'actor_id', length: 100 })
  actorId: string;

  @Column({ length: 100 })
  action: string;

  @Column({ name: 'resource_type', length: 50 })
  resourceType: string;

  @Column({ name: 'resource_id', length: 100 })
  resourceId: string;

  @Column({ type: 'jsonb', default: '{}' })
  details: Record<string, any>;

  @Column({ name: 'ip_address', length: 45, nullable: true })
  ipAddress: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
