import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../database/entities/public/tenant.entity';

export interface TenantContext {
  id: string;
  schemaName: string;
  phoneNumberId: string;
  accessToken: string;
}

declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
      requestId?: string;
    }
  }
}

@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    let tenant: Tenant | null = null;

    // 1. Try to resolve from session
    if (req.session && (req.session as any).tenantId) {
      tenant = await this.tenantRepository.findOne({
        where: { id: (req.session as any).tenantId, status: 'active' },
      });
    }

    // 2. Try from X-Tenant-ID header
    if (!tenant && req.headers['x-tenant-id']) {
      tenant = await this.tenantRepository.findOne({
        where: { id: req.headers['x-tenant-id'] as string, status: 'active' },
      });
    }

    // 3. Try from X-Tenant-Slug header
    if (!tenant && req.headers['x-tenant-slug']) {
      tenant = await this.tenantRepository.findOne({
        where: { slug: req.headers['x-tenant-slug'] as string, status: 'active' },
      });
    }

    if (tenant) {
      req.tenantContext = {
        id: tenant.id,
        schemaName: tenant.schemaName,
        phoneNumberId: tenant.phoneNumberId,
        accessToken: tenant.accessToken,
      };
    }

    next();
  }
}
