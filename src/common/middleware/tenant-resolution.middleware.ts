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
    const session = req.session as any;
    const isAdmin = !!session?.isAdmin && !!session?.adminId;

    // 1. A tenant user is bound to their own tenant via the session. This is the
    //    only trusted source for non-admins — the X-Tenant-* headers are NOT
    //    honoured for them (they are client-controlled and would allow pivoting
    //    into other tenants).
    if (session?.tenantId) {
      tenant = await this.tenantRepository.findOne({
        where: { id: session.tenantId, status: 'active' },
      });
    }

    // 2. Super-admins may act on a specific tenant via header (impersonation).
    if (!tenant && isAdmin && req.headers['x-tenant-id']) {
      tenant = await this.tenantRepository.findOne({
        where: { id: req.headers['x-tenant-id'] as string, status: 'active' },
      });
    }
    if (!tenant && isAdmin && req.headers['x-tenant-slug']) {
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
