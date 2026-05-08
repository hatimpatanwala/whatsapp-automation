import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/public/audit-log.entity';

export interface AuditLogEntry {
  tenantId?: string;
  actorType: 'admin' | 'system' | 'tenant_user' | 'webhook';
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, any>;
  ipAddress?: string;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async log(entry: AuditLogEntry): Promise<void> {
    const log = this.auditRepo.create(entry);
    await this.auditRepo.save(log);
  }

  async findByTenant(tenantId: string, limit = 50, offset = 0): Promise<[AuditLog[], number]> {
    return this.auditRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async findByResource(resourceType: string, resourceId: string): Promise<AuditLog[]> {
    return this.auditRepo.find({
      where: { resourceType, resourceId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findByAction(action: string, limit = 50): Promise<AuditLog[]> {
    return this.auditRepo.find({
      where: { action },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
