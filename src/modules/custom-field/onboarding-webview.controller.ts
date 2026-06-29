import { Controller, Get, Post, Body, Query, Headers, BadRequestException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { BuilderService } from '../builder/builder.service';
import { CustomFieldService } from './custom-field.service';

/**
 * Token-authenticated customer ONBOARDING webview (/m/onboarding). Collects the
 * required/collectable customer custom fields and saves them to the customer's
 * custom_fields — which then unblocks gated workflows. Auth is purely the
 * 'onboarding' builder session token; no login.
 */
@Controller('m/onboarding')
export class OnboardingWebviewController {
  constructor(
    private readonly conn: TenantConnectionManager,
    private readonly builder: BuilderService,
    private readonly fields: CustomFieldService,
  ) {}

  private tk(token?: string, header?: string): string {
    const t = token || header;
    if (!t) throw new BadRequestException('Missing link token.');
    return t;
  }

  @Public()
  @Get('bootstrap')
  async bootstrap(@Query('token') token?: string, @Headers('x-builder-token') header?: string) {
    const s = await this.builder.getOnboardingSession(this.tk(token, header));
    const [tenant, fields, customer] = await Promise.all([
      this.conn.executeGlobal(async (qr) => (await qr.query(`SELECT business_name, name FROM tenants WHERE id = $1`, [s.tenant_id]))[0]),
      this.fields.collectableCustomerFields(s.schema_name),
      s.customer_id
        ? this.conn.executeInTenantContext(s.schema_name, async (qr) => (await qr.query(`SELECT name, phone, custom_fields FROM customers WHERE id = $1`, [s.customer_id]))[0])
        : Promise.resolve(null),
    ]);
    const v = customer?.custom_fields;
    const values = (typeof v === 'string' ? JSON.parse(v) : v) || {};
    return {
      store: { name: tenant?.business_name || tenant?.name || 'Store' },
      customer: { name: s.customer_name || customer?.name || null, phone: s.customer_phone || customer?.phone || null },
      fields: (fields || []).map((f: any) => ({
        fieldKey: f.field_key, label: f.label, fieldType: f.field_type, options: f.options || [],
        placeholder: f.placeholder, helpText: f.help_text, isRequired: f.is_required,
        value: values[f.field_key] ?? null,
      })),
    };
  }

  @Public()
  @Post('submit')
  async submit(@Body() body: { values: Record<string, any> }, @Query('token') token?: string, @Headers('x-builder-token') header?: string) {
    const s = await this.builder.getOnboardingSession(this.tk(token, header));
    if (!s.customer_id) throw new BadRequestException('This link is not linked to a customer.');

    // Validate required fields are present.
    const fields = await this.fields.collectableCustomerFields(s.schema_name);
    const values = body?.values || {};
    const missing = fields.filter((f: any) => f.is_required && (values[f.field_key] === undefined || values[f.field_key] === null || String(values[f.field_key]).trim() === ''));
    if (missing.length) throw new BadRequestException(`Please fill: ${missing.map((f: any) => f.label).join(', ')}`);

    // Only persist known field keys.
    const allowed: Record<string, any> = {};
    for (const f of fields) if (values[f.field_key] !== undefined) allowed[f.field_key] = values[f.field_key];
    await this.fields.applyCustomerFields(s.schema_name, s.customer_id, allowed);
    return { ok: true };
  }
}
