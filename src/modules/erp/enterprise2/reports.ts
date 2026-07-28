import { Injectable, Controller, UseGuards, Get, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';

/**
 * Reports & Analytics — financial summaries over a date range (sales, expenses,
 * tax) plus receivables aging. All money is in the tenant base currency
 * (invoices use base_total).
 */
@Injectable()
export class ReportsService {
  constructor(private readonly cm: TenantConnectionManager) {}

  private range(from?: string, to?: string): [string, string] {
    const t = to || new Date().toISOString().slice(0, 10);
    const f = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    return [f, t];
  }

  async sales(schema: string, from?: string, to?: string) {
    const [f, t] = this.range(from, to);
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const totals = (await qr.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(base_total),0)::float AS sales,
                COALESCE(SUM(amount_paid * exchange_rate),0)::float AS collected,
                COALESCE(SUM(balance_due * exchange_rate),0)::float AS outstanding
         FROM "${schema}".invoices WHERE year IS NOT NULL AND issued_at::date BETWEEN $1 AND $2`, [f, t]))[0];
      const byDay = await qr.query(
        `SELECT issued_at::date AS day, COALESCE(SUM(base_total),0)::float AS amount, COUNT(*)::int AS count
         FROM "${schema}".invoices WHERE year IS NOT NULL AND issued_at::date BETWEEN $1 AND $2
         GROUP BY issued_at::date ORDER BY issued_at::date`, [f, t]);
      const byStatus = await qr.query(
        `SELECT payment_status, COUNT(*)::int AS count, COALESCE(SUM(base_total),0)::float AS amount
         FROM "${schema}".invoices WHERE year IS NOT NULL AND issued_at::date BETWEEN $1 AND $2
         GROUP BY payment_status`, [f, t]);
      return { from: f, to: t, totals, byDay, byStatus };
    });
  }

  async expenses(schema: string, from?: string, to?: string) {
    const [f, t] = this.range(from, to);
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const total = (await qr.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(total),0)::float AS amount
         FROM "${schema}".expenses WHERE removed = false AND expense_date::date BETWEEN $1 AND $2`, [f, t]))[0];
      const byCategory = await qr.query(
        `SELECT COALESCE(c.name,'Uncategorised') AS category, COALESCE(SUM(e.total),0)::float AS amount, COUNT(*)::int AS count
         FROM "${schema}".expenses e LEFT JOIN "${schema}".expense_categories c ON c.id = e.expense_category_id
         WHERE e.removed = false AND e.expense_date::date BETWEEN $1 AND $2
         GROUP BY c.name ORDER BY amount DESC`, [f, t]);
      return { from: f, to: t, total, byCategory };
    });
  }

  async receivablesAging(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT
           CASE
             WHEN COALESCE(due_date, issued_at) >= NOW() - INTERVAL '30 days' THEN '0-30'
             WHEN COALESCE(due_date, issued_at) >= NOW() - INTERVAL '60 days' THEN '31-60'
             WHEN COALESCE(due_date, issued_at) >= NOW() - INTERVAL '90 days' THEN '61-90'
             ELSE '90+'
           END AS bucket,
           COUNT(*)::int AS count, COALESCE(SUM(balance_due * exchange_rate),0)::float AS amount
         FROM "${schema}".invoices
         WHERE year IS NOT NULL AND payment_status <> 'paid'
         GROUP BY bucket ORDER BY bucket`));
  }

  /** Profit & Loss: income (invoiced sales) − expenses over the range. */
  async profitLoss(schema: string, from?: string, to?: string) {
    const [f, t] = this.range(from, to);
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const income = (await qr.query(`SELECT COALESCE(SUM(base_total),0)::float AS amt FROM "${schema}".invoices WHERE year IS NOT NULL AND issued_at::date BETWEEN $1 AND $2`, [f, t]))[0].amt;
      const expenses = (await qr.query(`SELECT COALESCE(SUM(total),0)::float AS amt FROM "${schema}".expenses WHERE removed = false AND expense_date::date BETWEEN $1 AND $2`, [f, t]))[0].amt;
      const expenseBreakdown = await qr.query(
        `SELECT COALESCE(c.name,'Uncategorised') AS category, COALESCE(SUM(e.total),0)::float AS amount
         FROM "${schema}".expenses e LEFT JOIN "${schema}".expense_categories c ON c.id = e.expense_category_id
         WHERE e.removed = false AND e.expense_date::date BETWEEN $1 AND $2 GROUP BY c.name ORDER BY amount DESC`, [f, t]);
      return { from: f, to: t, income, expenses, netProfit: Math.round((income - expenses) * 100) / 100, expenseBreakdown };
    });
  }

  /** Day Book: every transaction (invoice / payment / expense) in the range, chronological. */
  async dayBook(schema: string, from?: string, to?: string) {
    const [f, t] = this.range(from, to);
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT * FROM (
           SELECT issued_at AS at, 'Sale' AS type, invoice_number AS ref, customer_name AS party, base_total::float AS amount
             FROM "${schema}".invoices WHERE year IS NOT NULL AND issued_at::date BETWEEN $1 AND $2
           UNION ALL
           SELECT created_at AS at, 'Payment In' AS type, ref AS ref, NULL AS party, amount::float AS amount
             FROM "${schema}".payments WHERE invoice_id IS NOT NULL AND created_at::date BETWEEN $1 AND $2
           UNION ALL
           SELECT expense_date AS at, 'Expense' AS type, ref AS ref, name AS party, (-total)::float AS amount
             FROM "${schema}".expenses WHERE removed = false AND expense_date::date BETWEEN $1 AND $2
         ) d ORDER BY at DESC LIMIT 300`, [f, t]));
  }

  /** Party (customer) statement: invoices + payments with a running balance. */
  async partyStatement(schema: string, customerId: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const customer = (await qr.query(`SELECT name, phone, company FROM "${schema}".customers WHERE id = $1`, [customerId]))[0];
      const entries = await qr.query(
        `SELECT * FROM (
           SELECT issued_at AS at, 'Invoice' AS type, invoice_number AS ref, total::float AS debit, 0::float AS credit
             FROM "${schema}".invoices WHERE year IS NOT NULL AND customer_id = $1
           UNION ALL
           SELECT p.created_at AS at, 'Payment' AS type, p.ref AS ref, 0::float AS debit, p.amount::float AS credit
             FROM "${schema}".payments p JOIN "${schema}".invoices i ON i.id = p.invoice_id WHERE i.customer_id = $1
         ) e ORDER BY at`, [customerId]);
      let balance = 0;
      const rows = entries.map((e: any) => { balance += (e.debit - e.credit); return { ...e, balance: Math.round(balance * 100) / 100 }; });
      return { customer, entries: rows, balance: Math.round(balance * 100) / 100 };
    });
  }

  /** GST summary (GSTR-1 style): taxable value + tax grouped by rate, over the range. */
  async gst(schema: string, from?: string, to?: string) {
    const [f, t] = this.range(from, to);
    return this.cm.executeInTenantContext(schema, async (qr) => {
      // The invoices table stores total_tax + taxable_value (not the rate), so we
      // derive the effective rate per invoice and group by it (rounded to 0.25%).
      const byRate = await qr.query(
        `SELECT rate_pct, COUNT(*)::int AS invoices,
                COALESCE(SUM(taxable_value),0)::float AS taxable_value,
                COALESCE(SUM(tax),0)::float AS tax
         FROM (
           SELECT ROUND((CASE WHEN taxable_value > 0 THEN total_tax / taxable_value ELSE 0 END) * 100 * 4) / 4 AS rate_pct,
                  taxable_value * exchange_rate AS taxable_value,
                  total_tax * exchange_rate AS tax
           FROM "${schema}".invoices
           WHERE year IS NOT NULL AND issued_at::date BETWEEN $1 AND $2
         ) g GROUP BY rate_pct ORDER BY rate_pct`, [f, t]);
      const totals = byRate.reduce((a: any, r: any) => ({ taxable: a.taxable + r.taxable_value, tax: a.tax + r.tax }), { taxable: 0, tax: 0 });
      return { from: f, to: t, byRate, totals };
    });
  }

  /**
   * GSTR-1 JSON in the GSTN-portal shape (simplified): B2B (invoices with a buyer
   * GSTIN, grouped by GSTIN) + B2CS (no GSTIN, summarised by rate). Good enough to
   * import/inspect; full e-filing needs the GSTN offline tool's exact schema.
   */
  async gstr1Json(schema: string, from?: string, to?: string) {
    const [f, t] = this.range(from, to);
    const rows = await this.gstInvoiceRows(schema, f, t);
    const gstin = (await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT value FROM "${schema}".settings WHERE key = 'invoice_gstin'`).then((r) => r[0]?.value))) || '';
    const fp = (t || '').slice(0, 7).replace('-', ''); // MMYYYY-ish period code (YYYYMM)

    const b2bMap: Record<string, any> = {};
    const b2csMap: Record<string, any> = {};
    for (const r of rows) {
      const taxable = Number(r.taxable_value), rate = Number(r.rate_pct);
      const igst = Number(r.igst), camt = Number(r.cgst), samt = Number(r.sgst);
      if (r.buyer_gstin) {
        (b2bMap[r.buyer_gstin] ||= { ctin: r.buyer_gstin, inv: [] }).inv.push({
          inum: r.invoice_number, idt: r.date, val: Number(r.total), pos: r.place_of_supply || '',
          itms: [{ num: 1, itm_det: { txval: taxable, rt: rate, iamt: igst, camt, samt } }],
        });
      } else {
        const key = `${r.place_of_supply || ''}-${rate}`;
        const e = (b2csMap[key] ||= { sply_ty: igst > 0 ? 'INTER' : 'INTRA', pos: r.place_of_supply || '', rt: rate, txval: 0, iamt: 0, camt: 0, samt: 0 });
        e.txval += taxable; e.iamt += igst; e.camt += camt; e.samt += samt;
      }
    }
    return {
      gstin, fp,
      gt: rows.reduce((s, r) => s + Number(r.total), 0),
      b2b: Object.values(b2bMap),
      b2cs: Object.values(b2csMap),
    };
  }

  /** Per-invoice rows for the GSTR-1 CSV export (intra-state → CGST+SGST, inter-state → IGST). */
  async gstInvoiceRows(schema: string, from?: string, to?: string) {
    const [f, t] = this.range(from, to);
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT invoice_number,
                to_char(issued_at, 'YYYY-MM-DD') AS date,
                customer_name, buyer_gstin, place_of_supply,
                (ROUND((CASE WHEN taxable_value > 0 THEN total_tax / taxable_value ELSE 0 END) * 100 * 4) / 4)::numeric(6,2) AS rate_pct,
                (taxable_value * exchange_rate)::numeric(14,2) AS taxable_value,
                (CASE WHEN is_interstate THEN 0 ELSE total_tax / 2 END * exchange_rate)::numeric(14,2) AS cgst,
                (CASE WHEN is_interstate THEN 0 ELSE total_tax / 2 END * exchange_rate)::numeric(14,2) AS sgst,
                (CASE WHEN is_interstate THEN total_tax ELSE 0 END * exchange_rate)::numeric(14,2) AS igst,
                (total_tax * exchange_rate)::numeric(14,2) AS total_tax,
                (base_total)::numeric(14,2) AS total
         FROM "${schema}".invoices
         WHERE year IS NOT NULL AND issued_at::date BETWEEN $1 AND $2
         ORDER BY issued_at`, [f, t]));
  }

  /** Purchase register: supplier bills over the range (mirror of the sales register). */
  async purchases(schema: string, from?: string, to?: string) {
    const [f, t] = this.range(from, to);
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const totals = (await qr.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(total),0)::float AS purchases,
                COALESCE(SUM(amount_paid),0)::float AS paid,
                COALESCE(SUM(total - amount_paid),0)::float AS outstanding,
                COALESCE(SUM(total_tax),0)::float AS input_tax
         FROM "${schema}".supplier_orders
         WHERE removed = false AND status <> 'draft'
           AND COALESCE(supplier_invoice_date, created_at::date) BETWEEN $1 AND $2`, [f, t]))[0];
      const byDay = await qr.query(
        `SELECT COALESCE(supplier_invoice_date, created_at::date) AS day, COALESCE(SUM(total),0)::float AS amount, COUNT(*)::int AS count
         FROM "${schema}".supplier_orders
         WHERE removed = false AND status <> 'draft'
           AND COALESCE(supplier_invoice_date, created_at::date) BETWEEN $1 AND $2
         GROUP BY day ORDER BY day`, [f, t]);
      const byStatus = await qr.query(
        `SELECT payment_status, COUNT(*)::int AS count, COALESCE(SUM(total),0)::float AS amount
         FROM "${schema}".supplier_orders
         WHERE removed = false AND status <> 'draft'
           AND COALESCE(supplier_invoice_date, created_at::date) BETWEEN $1 AND $2
         GROUP BY payment_status`, [f, t]);
      const rows = await qr.query(
        `SELECT so.order_number, so.supplier_invoice_no,
                COALESCE(so.supplier_invoice_date, so.created_at::date) AS date,
                COALESCE(s.company, 'Unknown supplier') AS supplier,
                so.total::float AS total, so.total_tax::float AS tax,
                (so.total - so.amount_paid)::float AS balance, so.payment_status
         FROM "${schema}".supplier_orders so
         LEFT JOIN "${schema}".suppliers s ON s.id = so.supplier_id
         WHERE so.removed = false AND so.status <> 'draft'
           AND COALESCE(so.supplier_invoice_date, so.created_at::date) BETWEEN $1 AND $2
         ORDER BY date DESC, so.created_at DESC LIMIT 300`, [f, t]);
      return { from: f, to: t, totals, byDay, byStatus, rows };
    });
  }

  /**
   * Cash & Bank book: money-account balances plus the receipt/payment ledger over
   * the range. A payment linked to an invoice is money IN; one linked to a supplier
   * order is money OUT. With `accountId`, adds an opening balance (as of `from`) and
   * a running balance per row.
   */
  async cashBank(schema: string, from?: string, to?: string, accountId?: string) {
    const [f, t] = this.range(from, to);
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const accounts = await qr.query(
        `SELECT id, name, type, account_number, bank_name, current_balance::float AS current_balance
         FROM "${schema}".bank_accounts WHERE removed = false AND enabled = true ORDER BY is_default DESC, name`);
      const txns = await qr.query(
        `SELECT p.created_at AS at, p.method, p.ref,
                CASE WHEN p.invoice_id IS NOT NULL THEN 'Receipt' ELSE 'Payment' END AS type,
                COALESCE(c.name, s.company) AS party, ba.name AS account,
                (CASE WHEN p.invoice_id IS NOT NULL THEN p.amount ELSE 0 END)::float AS inflow,
                (CASE WHEN p.supplier_order_id IS NOT NULL THEN p.amount ELSE 0 END)::float AS outflow
         FROM "${schema}".payments p
         LEFT JOIN "${schema}".bank_accounts ba ON ba.id = p.bank_account_id
         LEFT JOIN "${schema}".invoices i ON i.id = p.invoice_id
         LEFT JOIN "${schema}".customers c ON c.id = i.customer_id
         LEFT JOIN "${schema}".supplier_orders so ON so.id = p.supplier_order_id
         LEFT JOIN "${schema}".suppliers s ON s.id = so.supplier_id
         WHERE COALESCE(p.status,'') <> 'failed'
           AND (p.invoice_id IS NOT NULL OR p.supplier_order_id IS NOT NULL)
           AND ($3::uuid IS NULL OR p.bank_account_id = $3)
           AND p.created_at::date BETWEEN $1 AND $2
         ORDER BY p.created_at`, [f, t, accountId || null]);
      let opening: number | null = null;
      let running: number | null = null;
      if (accountId) {
        const acc = (await qr.query(`SELECT opening_balance::float AS ob FROM "${schema}".bank_accounts WHERE id = $1`, [accountId]))[0];
        const prior = (await qr.query(
          `SELECT COALESCE(SUM(CASE WHEN invoice_id IS NOT NULL THEN amount ELSE -amount END),0)::float AS net
           FROM "${schema}".payments
           WHERE COALESCE(status,'') <> 'failed' AND (invoice_id IS NOT NULL OR supplier_order_id IS NOT NULL)
             AND bank_account_id = $1 AND created_at::date < $2`, [accountId, f]))[0];
        opening = Math.round(((acc?.ob || 0) + (prior?.net || 0)) * 100) / 100;
        running = opening;
      }
      const rows = txns.map((x: any) => {
        if (running !== null) { running = Math.round((running + x.inflow - x.outflow) * 100) / 100; return { ...x, balance: running }; }
        return x;
      });
      const totalIn = Math.round(txns.reduce((a: number, x: any) => a + x.inflow, 0) * 100) / 100;
      const totalOut = Math.round(txns.reduce((a: number, x: any) => a + x.outflow, 0) * 100) / 100;
      return { from: f, to: t, accounts, txns: rows, opening, closing: running, totalIn, totalOut };
    });
  }

  async tax(schema: string, from?: string, to?: string) {
    const [f, t] = this.range(from, to);
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const collected = (await qr.query(
        `SELECT COALESCE(SUM(total_tax * exchange_rate),0)::float AS output_tax, COUNT(*)::int AS invoices
         FROM "${schema}".invoices WHERE year IS NOT NULL AND issued_at::date BETWEEN $1 AND $2`, [f, t]))[0];
      const paid = (await qr.query(
        `SELECT COALESCE(SUM(tax_amount),0)::float AS input_tax
         FROM "${schema}".expenses WHERE removed = false AND expense_date::date BETWEEN $1 AND $2`, [f, t]))[0];
      return { from: f, to: t, outputTax: collected.output_tax, invoices: collected.invoices, inputTax: paid.input_tax, netTax: collected.output_tax - paid.input_tax };
    });
  }
}

@Controller('erp/reports')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}
  @Get('sales') @Roles('owner', 'seller') sales(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) { return this.service.sales(req.tenantContext.schemaName, from, to); }
  @Get('expenses') @Roles('owner', 'seller') expenses(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) { return this.service.expenses(req.tenantContext.schemaName, from, to); }
  @Get('receivables-aging') @Roles('owner', 'seller') aging(@Req() req: Request) { return this.service.receivablesAging(req.tenantContext.schemaName); }
  @Get('tax') @Roles('owner', 'seller') tax(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) { return this.service.tax(req.tenantContext.schemaName, from, to); }
  @Get('profit-loss') @Roles('owner', 'seller') pl(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) { return this.service.profitLoss(req.tenantContext.schemaName, from, to); }
  @Get('day-book') @Roles('owner', 'seller') dayBook(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) { return this.service.dayBook(req.tenantContext.schemaName, from, to); }
  @Get('purchases') @Roles('owner', 'seller') purchases(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) { return this.service.purchases(req.tenantContext.schemaName, from, to); }
  @Get('cash-bank') @Roles('owner', 'seller') cashBank(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string, @Query('accountId') accountId?: string) { return this.service.cashBank(req.tenantContext.schemaName, from, to, accountId); }
  @Get('party-statement') @Roles('owner', 'seller') party(@Req() req: Request, @Query('customerId') customerId: string) { return this.service.partyStatement(req.tenantContext.schemaName, customerId); }
  @Get('gst') @Roles('owner', 'seller') gst(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) { return this.service.gst(req.tenantContext.schemaName, from, to); }

  /** GSTR-1 style CSV download: one row per invoice with taxable value + tax split. */
  @Get('gst/export')
  @Roles('owner', 'seller')
  async gstExport(@Req() req: Request, @Res() res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    const rows = await this.service.gstInvoiceRows(req.tenantContext.schemaName, from, to);
    const header = ['Invoice No', 'Date', 'Customer', 'GSTIN', 'Place of Supply', 'Rate %', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Tax', 'Invoice Total'];
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [header.join(','), ...rows.map((r: any) => [
      r.invoice_number, r.date, r.customer_name, r.buyer_gstin, r.place_of_supply,
      r.rate_pct, r.taxable_value, r.cgst, r.sgst, r.igst, r.total_tax, r.total,
    ].map(esc).join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="gstr1-${from || 'start'}-to-${to || 'now'}.csv"`);
    res.send(csv);
  }

  /** GSTR-1 JSON download (GSTN-portal shape). */
  @Get('gst/export-json')
  @Roles('owner', 'seller')
  async gstrJson(@Req() req: Request, @Res() res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.service.gstr1Json(req.tenantContext.schemaName, from, to);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="gstr1-${from || 'start'}-to-${to || 'now'}.json"`);
    res.send(JSON.stringify(data, null, 2));
  }
}
