import { Injectable, Controller, UseGuards, Get, Post, Put, Delete, Param, Body, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { firstRow } from '../common/sql-result.util';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';

interface CurrencyBody { code?: string; name?: string; symbol?: string; exchangeRate?: number; isBase?: boolean; enabled?: boolean; }

/**
 * Multi-currency: enabled currencies with an exchange rate to the tenant's base
 * currency (exchange_rate = base units per 1 unit of this currency). The base
 * currency always has rate 1 and cannot be deleted. `code` is the primary key but
 * is aliased to `id` in responses so the generic ERP CRUD UI can drive it.
 */
@Injectable()
export class CurrencyService {
  constructor(private readonly cm: TenantConnectionManager) {}

  async list(schema: string) {
    const data = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT code AS id, code, name, symbol, exchange_rate, is_base, enabled FROM "${schema}".erp_currencies ORDER BY is_base DESC, code`));
    return { data, total: data.length };
  }

  /** Map of code → {rate, symbol} for conversions/formatting. */
  async map(schema: string): Promise<Record<string, { rate: number; symbol: string; isBase: boolean }>> {
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT code, exchange_rate, symbol, is_base FROM "${schema}".erp_currencies WHERE enabled = true`));
    const out: Record<string, { rate: number; symbol: string; isBase: boolean }> = {};
    for (const r of rows) out[r.code] = { rate: Number(r.exchange_rate), symbol: r.symbol, isBase: r.is_base };
    return out;
  }

  async create(schema: string, b: CurrencyBody) {
    if (!b.code || !b.name) throw new BadRequestException('Code and name are required');
    const code = b.code.toUpperCase().slice(0, 3);
    return this.cm.executeInTenantContext(schema, async (qr) =>
      firstRow(await qr.query(
        `INSERT INTO "${schema}".erp_currencies (code, name, symbol, exchange_rate, is_base, enabled)
         VALUES ($1,$2,$3,$4,false,$5)
         ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, symbol=EXCLUDED.symbol, exchange_rate=EXCLUDED.exchange_rate, enabled=EXCLUDED.enabled, updated_at=NOW()
         RETURNING code AS id, *`,
        [code, b.name, b.symbol ?? '', b.exchangeRate ?? 1, b.enabled ?? true],
      )));
  }

  async update(schema: string, code: string, b: CurrencyBody) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const row = firstRow(await qr.query(
        `UPDATE "${schema}".erp_currencies SET
           name = COALESCE($2,name), symbol = COALESCE($3,symbol),
           exchange_rate = COALESCE($4,exchange_rate), enabled = COALESCE($5,enabled), updated_at = NOW()
         WHERE code = $1 RETURNING code AS id, *`,
        [code, b.name ?? null, b.symbol ?? null, b.exchangeRate ?? null, b.enabled ?? null],
      ));
      if (!row) throw new NotFoundException('Currency not found');
      // The base currency's rate is always 1.
      if (row.is_base) await qr.query(`UPDATE "${schema}".erp_currencies SET exchange_rate = 1 WHERE code = $1`, [code]);
      return row;
    });
  }

  async remove(schema: string, code: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const cur = firstRow(await qr.query(`SELECT is_base FROM "${schema}".erp_currencies WHERE code = $1`, [code]));
      if (!cur) throw new NotFoundException('Currency not found');
      if (cur.is_base) throw new BadRequestException('The base currency cannot be removed');
      await qr.query(`DELETE FROM "${schema}".erp_currencies WHERE code = $1`, [code]);
      return { id: code, removed: true };
    });
  }
}

@Controller('erp/currencies')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class CurrencyController {
  constructor(private readonly service: CurrencyService) {}
  @Get() @Roles('owner', 'seller') list(@Req() req: Request) { return this.service.list(req.tenantContext.schemaName); }
  @Post() @Roles('owner') create(@Req() req: Request, @Body() b: CurrencyBody) { return this.service.create(req.tenantContext.schemaName, b); }
  @Put(':id') @Roles('owner') update(@Req() req: Request, @Param('id') id: string, @Body() b: CurrencyBody) { return this.service.update(req.tenantContext.schemaName, id, b); }
  @Delete(':id') @Roles('owner') remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req.tenantContext.schemaName, id); }
}
