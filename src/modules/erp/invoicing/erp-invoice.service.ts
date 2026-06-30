import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { ErpSequenceService } from '../common/erp-sequence.service';
import { firstRow } from '../common/sql-result.util';

export interface InvoiceLineInput {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateInvoiceInput {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items: InvoiceLineInput[];
  taxRate?: number; // fraction, e.g. 0.18 for 18%
  discount?: number;
  dueDate?: string;
  note?: string;
  status?: string; // 'draft' | 'issued'
  currency?: string; // doc currency code; defaults to the tenant base
  exchangeRate?: number; // base units per 1 doc-currency unit; looked up if omitted
  branchId?: string; // optional branch this invoice belongs to
}

export interface RecordPaymentInput {
  amount: number;
  paymentModeId?: string;
  ref?: string;
  description?: string;
}

/** Round to 2 decimals using cents to avoid float drift (port of IDURAR currency.js intent). */
const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Standalone accounts-receivable invoices for the ERP. Builds on the EXISTING
 * `invoices` table (GST-capable, `items` JSONB) and the AR columns added in
 * migration 047 (amount_paid / balance_due / payment_status / due_date / year).
 *
 * Numbering uses ErpSequenceService (atomic, per-year), with the prefix from the
 * tenant `erp_invoice_prefix` setting. Payment recording ports IDURAR's
 * reconciliation: credit accrues on the invoice and payment_status moves
 * unpaid → partial → paid.
 */
@Injectable()
export class ErpInvoiceService {
  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly sequences: ErpSequenceService,
  ) {}

  async list(
    schema: string,
    filters: { status?: string; paymentStatus?: string; customerId?: string; branchId?: string; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];
    let p = 1;
    if (filters.status) { conditions.push(`i.status = $${p++}`); params.push(filters.status); }
    if (filters.paymentStatus) { conditions.push(`i.payment_status = $${p++}`); params.push(filters.paymentStatus); }
    if (filters.customerId) { conditions.push(`i.customer_id = $${p++}`); params.push(filters.customerId); }
    if (filters.branchId) { conditions.push(`i.branch_id = $${p++}`); params.push(filters.branchId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.cm.executeInTenantContext(schema, async (qr) => {
      const countRows = await qr.query(`SELECT COUNT(*)::int AS total FROM "${schema}".invoices i ${where}`, params);
      const total = countRows[0]?.total ?? 0;
      const rows = await qr.query(
        `SELECT i.* FROM "${schema}".invoices i ${where}
         ORDER BY i.issued_at DESC NULLS LAST, i.created_at DESC
         LIMIT $${p++} OFFSET $${p++}`,
        [...params, limit, offset],
      );
      return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
    });
  }

  async findById(schema: string, id: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(`SELECT * FROM "${schema}".invoices WHERE id = $1 LIMIT 1`, [id]);
      if (!rows[0]) throw new NotFoundException(`Invoice ${id} not found`);
      const payments = await qr.query(
        `SELECT id, amount, payment_mode_id, ref, description, status, created_at
         FROM "${schema}".payments WHERE invoice_id = $1 ORDER BY created_at ASC`,
        [id],
      );
      return { ...rows[0], payments };
    });
  }

  async create(schema: string, input: CreateInvoiceInput) {
    if (!input.items?.length) throw new BadRequestException('An invoice needs at least one line item');

    const lines = input.items.map((it) => {
      const quantity = Number(it.quantity) || 0;
      const unitPrice = Number(it.unitPrice) || 0;
      if (quantity <= 0) throw new BadRequestException(`Invalid quantity for "${it.description}"`);
      return {
        productId: it.productId ?? null,
        description: it.description,
        quantity,
        unitPrice: money(unitPrice),
        lineTotal: money(quantity * unitPrice),
      };
    });

    const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));
    const discount = money(input.discount ?? 0);
    const taxRate = Number(input.taxRate ?? 0);
    const taxableValue = money(Math.max(0, subtotal - discount));
    const totalTax = money(taxableValue * taxRate);
    const total = money(taxableValue + totalTax);
    const year = new Date().getFullYear();

    return this.cm.executeInTransaction(schema, async (qr) => {
      // Resolve customer denormalized fields if a customer id was given.
      let customerName = input.customerName ?? null;
      let customerPhone = input.customerPhone ?? null;
      if (input.customerId) {
        const c = await qr.query(`SELECT name, display_name, phone FROM "${schema}".customers WHERE id = $1`, [input.customerId]);
        if (c[0]) {
          customerName = customerName ?? c[0].display_name ?? c[0].name;
          customerPhone = customerPhone ?? c[0].phone;
        }
      }

      const prefix = (await this.getSetting<string>(qr, schema, 'erp_invoice_prefix')) ?? 'INV';
      const { formatted } = await this.sequences.next(schema, 'invoice', { year, prefix }, qr);

      // Multi-currency: resolve the document currency + its exchange rate to base,
      // and store the base-currency total for reporting.
      let currency = (input.currency || (await this.getSetting<string>(qr, schema, 'erp_base_currency')) || 'INR').toUpperCase();
      let exchangeRate = Number(input.exchangeRate ?? 0);
      if (!exchangeRate) {
        const cur = (await qr.query(`SELECT exchange_rate FROM "${schema}".erp_currencies WHERE code = $1 AND enabled = true`, [currency]))[0];
        exchangeRate = cur ? Number(cur.exchange_rate) : 1;
      }
      const baseTotal = money(total * exchangeRate);

      const rows = await qr.query(
        `INSERT INTO "${schema}".invoices
           (invoice_number, doc_type, year, customer_id, customer_name, customer_phone,
            subtotal, discount, taxable_value, total_tax, total, currency, exchange_rate, base_total, items,
            amount_paid, balance_due, payment_status, due_date, note, status, branch_id, issued_at)
         VALUES ($1,'tax_invoice',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,0,$15,'unpaid',$16,$17,$18,$19,NOW())
         RETURNING *`,
        [
          formatted, year, input.customerId ?? null, customerName, customerPhone,
          subtotal, discount, taxableValue, totalTax, total, currency, exchangeRate, baseTotal,
          JSON.stringify(lines), total, input.dueDate ?? null, input.note ?? null,
          input.status ?? 'issued', input.branchId ?? null,
        ],
      );
      return rows[0];
    });
  }

  /** Record a payment against an invoice and reconcile its balance + status. */
  async recordPayment(schema: string, invoiceId: string, input: RecordPaymentInput) {
    const amount = money(Number(input.amount));
    if (!(amount > 0)) throw new BadRequestException('Payment amount must be greater than zero');

    return this.cm.executeInTransaction(schema, async (qr) => {
      const inv = (await qr.query(`SELECT * FROM "${schema}".invoices WHERE id = $1 FOR UPDATE`, [invoiceId]))[0];
      if (!inv) throw new NotFoundException(`Invoice ${invoiceId} not found`);

      const total = Number(inv.total);
      const alreadyPaid = Number(inv.amount_paid);
      const maxPayable = money(total - alreadyPaid);
      if (amount > maxPayable) {
        throw new BadRequestException(`Payment exceeds balance due (${maxPayable})`);
      }

      const payment = (await qr.query(
        `INSERT INTO "${schema}".payments
           (invoice_id, method, status, amount, currency, payment_mode_id, ref, description)
         VALUES ($1,'manual','completed',$2,$3,$4,$5,$6) RETURNING *`,
        [invoiceId, amount, inv.currency ?? 'INR', input.paymentModeId ?? null, input.ref ?? null, input.description ?? null],
      ))[0];

      const newPaid = money(alreadyPaid + amount);
      const balance = money(total - newPaid);
      const status = balance <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

      const invoice = firstRow(await qr.query(
        `UPDATE "${schema}".invoices
         SET amount_paid = $1, balance_due = $2, payment_status = $3
         WHERE id = $4 RETURNING *`,
        [newPaid, balance, status, invoiceId],
      ));

      return { invoice, payment };
    });
  }

  private async getSetting<T>(qr: QueryRunner, schema: string, key: string): Promise<T | undefined> {
    const rows = await qr.query(`SELECT value FROM "${schema}".settings WHERE key = $1`, [key]);
    return rows[0] ? (rows[0].value as T) : undefined;
  }
}
