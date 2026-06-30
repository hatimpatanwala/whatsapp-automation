import { Injectable, Controller, UseGuards, Get, Post, Delete, Param, Body, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { firstRow } from '../common/sql-result.util';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';

/**
 * Developer API keys for integrating with the tenant's ERP. Only a SHA-256 hash is
 * stored; the raw key is returned exactly once at creation time. "Delete" revokes
 * (soft-delete) the key.
 */
@Injectable()
export class ApiKeyService {
  constructor(private readonly cm: TenantConnectionManager) {}

  async list(schema: string) {
    const data = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT id, name, key_prefix, last_used_at, enabled, created_at
                FROM "${schema}".api_keys WHERE removed = false ORDER BY created_at DESC`));
    return { data, total: data.length };
  }

  async create(schema: string, name: string) {
    if (!name) throw new BadRequestException('Name is required');
    const raw = `sk_${crypto.randomBytes(24).toString('hex')}`;
    const prefix = raw.slice(0, 12);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const row = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`INSERT INTO "${schema}".api_keys (name, key_prefix, key_hash) VALUES ($1,$2,$3) RETURNING id, name, key_prefix, created_at`,
        [name, prefix, hash]).then(firstRow));
    // The raw key is shown only here, never again.
    return { ...row, key: raw };
  }

  async remove(schema: string, id: string) {
    const row = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`UPDATE "${schema}".api_keys SET removed = true, enabled = false, updated_at = NOW() WHERE id = $1 AND removed = false RETURNING id`, [id]).then(firstRow));
    if (!row) throw new NotFoundException('API key not found');
    return { id, removed: true };
  }
}

@Controller('erp/api-keys')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class ApiKeyController {
  constructor(private readonly service: ApiKeyService) {}
  @Get() @Roles('owner') list(@Req() req: Request) { return this.service.list(req.tenantContext.schemaName); }
  @Post() @Roles('owner') create(@Req() req: Request, @Body() body: { name: string }) { return this.service.create(req.tenantContext.schemaName, body?.name); }
  @Delete(':id') @Roles('owner') remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req.tenantContext.schemaName, id); }
}
