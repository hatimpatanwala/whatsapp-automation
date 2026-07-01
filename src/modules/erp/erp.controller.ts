import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../common/guards/erp-feature.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresFeature } from '../../common/decorators/requires-feature.decorator';
import { ErpProvisioningService } from './provisioning/erp-provisioning.service';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

/**
 * ERP meta endpoints. `GET /erp/status` is intentionally NOT feature-gated so the
 * Angular app can always ask "is ERP available for this tenant?" and show/hide the
 * ERP navigation accordingly. The provision action IS feature-gated.
 */
@Controller('erp')
@UseGuards(TenantGuard)
export class ErpController {
  constructor(
    private readonly provisioning: ErpProvisioningService,
    private readonly cm: TenantConnectionManager,
  ) {}

  /** Rich dashboard payload: KPIs, recent invoices, top clients, 6-month sales trend. */
  @Get('dashboard')
  @Roles('owner', 'seller')
  @UseGuards(ErpFeatureGuard)
  @RequiresFeature('erp')
  async dashboard(@Req() req: Request) {
    const schema = req.tenantContext.schemaName;
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const q = (sql: string, p: any[] = []) => qr.query(sql, p);
      const baseCur = (await q(`SELECT symbol, code FROM "${schema}".erp_currencies WHERE is_base = true LIMIT 1`))[0] || { symbol: '₹', code: 'INR' };
      const recv = (await q(`SELECT COUNT(*)::int AS n, COALESCE(SUM(balance_due * exchange_rate),0)::float AS amt FROM "${schema}".invoices WHERE year IS NOT NULL AND payment_status <> 'paid'`))[0];
      const today = (await q(`SELECT COALESCE(SUM(base_total),0)::float AS amt, COUNT(*)::int AS n FROM "${schema}".invoices WHERE year IS NOT NULL AND issued_at::date = CURRENT_DATE`))[0];
      const month = (await q(`SELECT COALESCE(SUM(base_total),0)::float AS amt FROM "${schema}".invoices WHERE year IS NOT NULL AND issued_at >= date_trunc('month', NOW())`))[0];
      const expMonth = (await q(`SELECT COALESCE(SUM(total),0)::float AS amt FROM "${schema}".expenses WHERE removed = false AND expense_date >= date_trunc('month', NOW())`))[0];
      const counts = (await q(`SELECT
          (SELECT COUNT(*)::int FROM "${schema}".invoices WHERE year IS NOT NULL) AS invoices,
          (SELECT COUNT(*)::int FROM "${schema}".customers WHERE is_erp_client = true) AS clients,
          (SELECT COUNT(*)::int FROM "${schema}".leads WHERE removed = false AND status NOT IN ('converted','lost')) AS open_leads,
          (SELECT COUNT(*)::int FROM "${schema}".suppliers WHERE removed = false) AS suppliers,
          (SELECT COUNT(*)::int FROM "${schema}".employees WHERE removed = false) AS employees,
          (SELECT COUNT(*)::int FROM "${schema}".inventory WHERE track_inventory = true AND stock_quantity <= low_stock_threshold) AS low_stock`))[0];
      const recentInvoices = await q(`SELECT invoice_number, customer_name, total, payment_status, issued_at FROM "${schema}".invoices WHERE year IS NOT NULL ORDER BY created_at DESC LIMIT 5`);
      const topClients = await q(`SELECT name, company, total_spent FROM "${schema}".customers WHERE total_spent > 0 ORDER BY total_spent DESC NULLS LAST LIMIT 5`);
      const monthlySales = await q(`
        SELECT to_char(date_trunc('month', issued_at), 'Mon') AS month, COALESCE(SUM(base_total),0)::float AS amt
        FROM "${schema}".invoices
        WHERE year IS NOT NULL AND issued_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
        GROUP BY date_trunc('month', issued_at) ORDER BY date_trunc('month', issued_at)`);
      return {
        baseCurrency: baseCur,
        kpis: {
          receivables: { count: recv.n, amount: recv.amt },
          salesToday: { count: today.n, amount: today.amt },
          salesThisMonth: month.amt,
          expensesThisMonth: expMonth.amt,
          ...counts,
        },
        recentInvoices, topClients, monthlySales,
      };
    });
  }

  /** Dashboard summary: receivables, today's invoiced sales, month expenses, counts. */
  @Get('summary')
  @Roles('owner', 'seller')
  @UseGuards(ErpFeatureGuard)
  @RequiresFeature('erp')
  async summary(@Req() req: Request) {
    const schema = req.tenantContext.schemaName;
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const recv = (await qr.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(balance_due * exchange_rate),0)::float AS due FROM invoices WHERE year IS NOT NULL AND payment_status <> 'paid'`))[0];
      const salesToday = (await qr.query(`SELECT COALESCE(SUM(base_total),0)::float AS amt, COUNT(*)::int AS n FROM invoices WHERE year IS NOT NULL AND issued_at::date = CURRENT_DATE`))[0];
      const expMonth = (await qr.query(`SELECT COALESCE(SUM(total),0)::float AS amt FROM expenses WHERE removed = false AND expense_date >= date_trunc('month', NOW())`))[0];
      const leads = (await qr.query(`SELECT COUNT(*)::int AS n FROM leads WHERE removed = false AND status NOT IN ('converted','lost')`))[0];
      return {
        receivables: { count: recv.n, amount: recv.due },
        salesToday: { count: salesToday.n, amount: salesToday.amt },
        expensesThisMonth: expMonth.amt,
        openLeads: leads.n,
      };
    });
  }

  /**
   * Drives the frontend feature flags + ERP nav visibility.
   * Note: only 'owner'/'seller' here — the tenant 'support' role collides with the
   * super-admin 'support' role in RolesGuard, which would flip this to admin-only.
   */
  @Get('status')
  @Roles('owner', 'seller')
  async status(@Req() req: Request) {
    return this.provisioning.getStatus(req.tenantContext.id, req.tenantContext.schemaName);
  }

  /**
   * Owner-triggered one-time provisioning. Normally invoked automatically by the
   * plan-change hook; exposed here so an owner already on an ERP plan can (re)run
   * setup. Gated by the `erp` feature so only ERP-enabled tenants can call it.
   */
  @Post('provision')
  @Roles('owner')
  @UseGuards(ErpFeatureGuard)
  @RequiresFeature('erp')
  async provision(@Req() req: Request) {
    return this.provisioning.enable(req.tenantContext.schemaName);
  }
}
