import { Injectable, Controller, UseGuards, Get, Put, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';

// Whitelisted ERP settings keys the UI may read/write (stored in the settings KV table).
const ERP_SETTING_KEYS = [
  'erp_company_name', 'invoice_legal_name', 'invoice_gstin', 'invoice_address', 'invoice_state',
  'erp_company_email', 'erp_company_phone', 'erp_company_website',
  'erp_base_currency', 'erp_currency', 'erp_currency_position', 'erp_currency_decimals',
  'erp_default_tax_rate', 'erp_invoice_prefix', 'erp_quote_prefix', 'erp_offer_prefix',
  'erp_auto_reminders', 'erp_reminder_days_overdue',
];

/**
 * Read/write the tenant's ERP configuration (company profile, currency formatting,
 * tax default, document numbering prefixes) — the IDURAR General + Advanced Settings
 * equivalent. Values live in the existing per-tenant `settings` KV (JSONB) table.
 */
@Injectable()
export class ErpSettingsService {
  constructor(private readonly cm: TenantConnectionManager) {}

  async get(schema: string): Promise<Record<string, any>> {
    const rows = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT key, value FROM "${schema}".settings WHERE key = ANY($1)`, [ERP_SETTING_KEYS]));
    const out: Record<string, any> = {};
    for (const r of rows) out[r.key] = r.value;
    // Ensure every known key is present (so the form renders them all).
    for (const k of ERP_SETTING_KEYS) if (!(k in out)) out[k] = '';
    return out;
  }

  async update(schema: string, patch: Record<string, any>): Promise<Record<string, any>> {
    const entries = Object.entries(patch).filter(([k]) => ERP_SETTING_KEYS.includes(k));
    await this.cm.executeInTransaction(schema, async (qr) => {
      for (const [k, v] of entries) {
        await qr.query(
          `INSERT INTO "${schema}".settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [k, JSON.stringify(v)],
        );
      }
    });
    return this.get(schema);
  }
}

@Controller('erp/settings')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class ErpSettingsController {
  constructor(private readonly service: ErpSettingsService) {}
  @Get() @Roles('owner', 'seller') get(@Req() req: Request) { return this.service.get(req.tenantContext.schemaName); }
  @Put() @Roles('owner') update(@Req() req: Request, @Body() body: Record<string, any>) { return this.service.update(req.tenantContext.schemaName, body); }
}
