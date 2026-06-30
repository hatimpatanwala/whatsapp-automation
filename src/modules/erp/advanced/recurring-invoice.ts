import { Injectable, Controller, UseGuards, Get, Post, Put, Delete, Param, Body, Query, Req, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Request } from 'express';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { ErpInvoiceService } from '../invoicing/erp-invoice.service';
import { firstRow } from '../common/sql-result.util';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';

const COLS = ['title', 'customer_id', 'customer_name', 'customer_phone', 'items', 'tax_rate', 'discount', 'currency', 'frequency', 'next_run_date', 'enabled'];

function advance(date: Date, frequency: string): string {
  const d = new Date(date);
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1); // monthly (default)
  return d.toISOString().slice(0, 10);
}

/**
 * Recurring invoice templates. A daily cron materialises a real ERP invoice from
 * each template whose next_run_date has arrived, then advances the schedule.
 */
@Injectable()
export class RecurringInvoiceService {
  private readonly logger = new Logger(RecurringInvoiceService.name);
  constructor(private readonly cm: TenantConnectionManager, private readonly invoices: ErpInvoiceService) {}

  async list(schema: string, page = 1, limit = 50) {
    const offset = (Math.max(1, page) - 1) * limit;
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const total = parseInt((await qr.query(`SELECT COUNT(*)::int AS total FROM "${schema}".recurring_invoices WHERE removed = false`))[0].total);
      const data = await qr.query(`SELECT * FROM "${schema}".recurring_invoices WHERE removed = false ORDER BY next_run_date LIMIT $1 OFFSET $2`, [limit, offset]);
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    });
  }
  findById(schema: string, id: string) {
    return this.cm.executeInTenantContext(schema, (qr) => qr.query(`SELECT * FROM "${schema}".recurring_invoices WHERE id = $1 AND removed = false`, [id]).then(firstRow));
  }
  async create(schema: string, b: any) {
    if (!b.items?.length) throw new BadRequestException('Add at least one line item');
    if (!b.nextRunDate) throw new BadRequestException('A start date is required');
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `INSERT INTO "${schema}".recurring_invoices (title, customer_id, customer_name, customer_phone, items, tax_rate, discount, currency, frequency, next_run_date, enabled)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [b.title ?? null, b.customerId ?? null, b.customerName ?? null, b.customerPhone ?? null, JSON.stringify(b.items),
         (Number(b.taxRate) || 0), (Number(b.discount) || 0), b.currency ?? 'INR', b.frequency ?? 'monthly', b.nextRunDate, b.enabled !== false],
      ).then(firstRow));
  }
  async update(schema: string, id: string, b: any) {
    const sets: string[] = []; const vals: any[] = []; let i = 1;
    const map: Record<string, any> = { title: b.title, customer_name: b.customerName, customer_phone: b.customerPhone, tax_rate: b.taxRate, discount: b.discount, frequency: b.frequency, next_run_date: b.nextRunDate, enabled: b.enabled };
    if (b.items) map['items'] = JSON.stringify(b.items);
    for (const [k, v] of Object.entries(map)) { if (v !== undefined) { sets.push(`${k} = $${i++}${k === 'items' ? '::jsonb' : ''}`); vals.push(v); } }
    if (!sets.length) return this.findById(schema, id);
    sets.push('updated_at = NOW()'); vals.push(id);
    const row = await this.cm.executeInTenantContext(schema, (qr) => qr.query(`UPDATE "${schema}".recurring_invoices SET ${sets.join(', ')} WHERE id = $${i} AND removed = false RETURNING *`, vals).then(firstRow));
    if (!row) throw new NotFoundException('Not found');
    return row;
  }
  async remove(schema: string, id: string) {
    await this.cm.executeInTenantContext(schema, (qr) => qr.query(`UPDATE "${schema}".recurring_invoices SET removed = true, enabled = false, updated_at = NOW() WHERE id = $1`, [id]));
    return { id, removed: true };
  }

  /** Generate due invoices for one tenant; returns how many were created. */
  async runForTenant(schema: string): Promise<number> {
    const due = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT * FROM "${schema}".recurring_invoices WHERE enabled = true AND removed = false AND next_run_date <= CURRENT_DATE`));
    let created = 0;
    for (const tpl of due) {
      try {
        const items = (Array.isArray(tpl.items) ? tpl.items : JSON.parse(tpl.items || '[]'))
          .map((it: any) => ({ description: it.description, quantity: Number(it.quantity), unitPrice: Number(it.unitPrice ?? it.unit_price) }));
        if (!items.length) continue;
        await this.invoices.create(schema, {
          customerId: tpl.customer_id ?? undefined, customerName: tpl.customer_name ?? undefined, customerPhone: tpl.customer_phone ?? undefined,
          items, taxRate: Number(tpl.tax_rate), discount: Number(tpl.discount), currency: tpl.currency,
          note: `Recurring${tpl.title ? `: ${tpl.title}` : ''}`,
        });
        await this.cm.executeInTenantContext(schema, (qr) =>
          qr.query(`UPDATE "${schema}".recurring_invoices SET next_run_date = $1, last_run_at = NOW(), generated_count = generated_count + 1, updated_at = NOW() WHERE id = $2`,
            [advance(new Date(tpl.next_run_date), tpl.frequency), tpl.id]));
        created++;
      } catch (e: any) { this.logger.warn(`recurring invoice ${tpl.id} failed: ${e.message}`); }
    }
    return created;
  }
}

@Injectable()
export class RecurringInvoiceCron {
  private readonly logger = new Logger(RecurringInvoiceCron.name);
  constructor(private readonly cm: TenantConnectionManager, private readonly service: RecurringInvoiceService) {}

  // 06:00 daily — generate the day's recurring invoices before business hours.
  @Cron('0 0 6 * * *')
  async run(): Promise<void> {
    let tenants: any[] = [];
    try { tenants = await this.cm.executeGlobal((qr) => qr.query(`SELECT schema_name FROM tenants WHERE status = 'active'`)); }
    catch (e: any) { this.logger.warn(`recurring cron tenant list failed: ${e.message}`); return; }
    for (const t of tenants) {
      try {
        // Skip schemas that don't have the table yet (not on ERP).
        const has = await this.cm.executeInTenantContext(t.schema_name, (qr) => qr.query(`SELECT to_regclass($1) AS t`, [`${t.schema_name}.recurring_invoices`]).then((r) => !!r[0].t));
        if (!has) continue;
        const n = await this.service.runForTenant(t.schema_name);
        if (n) this.logger.log(`recurring: generated ${n} invoice(s) for ${t.schema_name}`);
      } catch (e: any) { this.logger.warn(`recurring cron failed for ${t.schema_name}: ${e.message}`); }
    }
  }
}

@Controller('erp/recurring-invoices')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class RecurringInvoiceController {
  constructor(private readonly service: RecurringInvoiceService) {}
  @Get() @Roles('owner', 'seller') list(@Req() req: Request, @Query('page') p?: string, @Query('limit') l?: string) { return this.service.list(req.tenantContext.schemaName, p ? +p : 1, l ? +l : 50); }
  @Get(':id') @Roles('owner', 'seller') get(@Req() req: Request, @Param('id') id: string) { return this.service.findById(req.tenantContext.schemaName, id); }
  @Post() @Roles('owner', 'seller') create(@Req() req: Request, @Body() b: any) { return this.service.create(req.tenantContext.schemaName, b); }
  @Put(':id') @Roles('owner', 'seller') update(@Req() req: Request, @Param('id') id: string, @Body() b: any) { return this.service.update(req.tenantContext.schemaName, id, b); }
  @Post('run-now') @Roles('owner') runNow(@Req() req: Request) { return this.service.runForTenant(req.tenantContext.schemaName).then((n) => ({ generated: n })); }
  @Delete(':id') @Roles('owner') remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req.tenantContext.schemaName, id); }
}
