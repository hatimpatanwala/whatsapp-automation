import { Injectable, Controller, UseGuards, Get, Post, Put, Delete, Param, Body, Query, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { firstRow } from '../common/sql-result.util';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';

interface ClientBody {
  name?: string; phone?: string; email?: string; company?: string; gstin?: string; billingAddress?: string;
}

/**
 * ERP "Clients" are rows in the existing `customers` table with B2B fields filled
 * (company / gstin / billing_address) and `is_erp_client = true`. This service
 * exposes a client-shaped CRUD over customers without disturbing the WhatsApp
 * customer lifecycle — "delete" just un-flags the client (the customer stays).
 */
@Injectable()
export class ClientService {
  constructor(private readonly cm: TenantConnectionManager) {}

  async list(schema: string, filters: { search?: string; page?: number; limit?: number } = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const offset = (page - 1) * limit;
    const conditions = ['is_erp_client = true'];
    const params: any[] = [];
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`(name ILIKE $1 OR company ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1)`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const total = parseInt((await qr.query(`SELECT COUNT(*)::int AS total FROM "${schema}".customers ${where}`, params))[0].total);
      const data = await qr.query(
        `SELECT id, name, phone, email, company, gstin, billing_address, total_orders, total_spent, created_at
         FROM "${schema}".customers ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    });
  }

  async findById(schema: string, id: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const row = firstRow(await qr.query(`SELECT * FROM "${schema}".customers WHERE id = $1`, [id]));
      if (!row) throw new NotFoundException('Client not found');
      return row;
    });
  }

  /** Create a client (or promote an existing customer with the same phone). */
  async create(schema: string, b: ClientBody) {
    if (!b.name) throw new BadRequestException('Name is required');
    const phone = b.phone || `client-${Date.now()}`;
    return this.cm.executeInTenantContext(schema, async (qr) =>
      firstRow(await qr.query(
        `INSERT INTO "${schema}".customers (phone, name, email, company, gstin, billing_address, is_erp_client)
         VALUES ($1,$2,$3,$4,$5,$6,true)
         ON CONFLICT (phone) DO UPDATE SET
           name = EXCLUDED.name, email = COALESCE(EXCLUDED.email, "${schema}".customers.email),
           company = EXCLUDED.company, gstin = EXCLUDED.gstin,
           billing_address = EXCLUDED.billing_address, is_erp_client = true, updated_at = NOW()
         RETURNING *`,
        [phone, b.name, b.email ?? null, b.company ?? null, b.gstin ?? null, b.billingAddress ?? null],
      )),
    );
  }

  async update(schema: string, id: string, b: ClientBody) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const row = firstRow(await qr.query(
        `UPDATE "${schema}".customers SET
           name = COALESCE($2, name), email = COALESCE($3, email), company = COALESCE($4, company),
           gstin = COALESCE($5, gstin), billing_address = COALESCE($6, billing_address),
           is_erp_client = true, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, b.name ?? null, b.email ?? null, b.company ?? null, b.gstin ?? null, b.billingAddress ?? null],
      ));
      if (!row) throw new NotFoundException('Client not found');
      return row;
    });
  }

  /** Un-flag as a client (keep the underlying customer). */
  async remove(schema: string, id: string) {
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`UPDATE "${schema}".customers SET is_erp_client = false, updated_at = NOW() WHERE id = $1`, [id]));
    return { id, removed: true };
  }
}

@Controller('erp/clients')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class ClientController {
  constructor(private readonly service: ClientService) {}

  @Get() @Roles('owner', 'seller')
  list(@Req() req: Request, @Query('search') search?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.list(req.tenantContext.schemaName, { search, page: page ? +page : undefined, limit: limit ? +limit : undefined });
  }
  @Get(':id') @Roles('owner', 'seller')
  findById(@Req() req: Request, @Param('id') id: string) { return this.service.findById(req.tenantContext.schemaName, id); }
  @Post() @Roles('owner', 'seller')
  create(@Req() req: Request, @Body() body: ClientBody) { return this.service.create(req.tenantContext.schemaName, body); }
  @Put(':id') @Roles('owner', 'seller')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: ClientBody) { return this.service.update(req.tenantContext.schemaName, id, body); }
  @Delete(':id') @Roles('owner')
  remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req.tenantContext.schemaName, id); }
}
