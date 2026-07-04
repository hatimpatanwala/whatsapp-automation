import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { ErpSequenceService } from '../common/erp-sequence.service';
import { firstRow } from '../common/sql-result.util';
import { EventBusService } from '../../events/event-bus.service';
import { InvoiceCreatedEvent, PaymentVerifiedEvent } from '../../events/domain-events';

export interface InvoiceLineInput {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** Per-line GST percent (e.g. 18). When present on any line, per-line tax wins over taxRate. */
  gstRate?: number;
  hsn?: string;
  /** Miracle ride-alongs: scheme free qty, cascading discounts, entered rate, alt-unit base qty. */
  freeQty?: number;
  d1?: number;
  d2?: number;
  mrpRate?: number;
  baseQty?: number;
  uomUsed?: string;
}

export interface CreateInvoiceInput {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items: InvoiceLineInput[];
  taxRate?: number; // fraction, e.g. 0.18 for 18% (legacy whole-invoice rate)
  discount?: number;
  dueDate?: string;
  note?: string;
  status?: string; // 'draft' | 'issued'
  currency?: string; // doc currency code; defaults to the tenant base
  exchangeRate?: number; // base units per 1 doc-currency unit; looked up if omitted
  branchId?: string; // optional branch this invoice belongs to
  /** GST place-of-supply handling: interstate → IGST, else CGST+SGST. */
  isInterstate?: boolean;
  buyerGstin?: string;
  placeOfSupply?: string;
  /** Voucher date (Miracle lets the operator back/forward-date entries). Defaults to now. */
  issueDate?: string;
  /** Miracle cash memo: posts Dr Cash (no debtor) and the invoice is settled on the spot. */
  isCash?: boolean;
  /** Add/Less charges (freight, packing…) — each taxable at its own GST rate. */
  charges?: Array<{ label: string; amount: number; gstRate?: number }>;
  /** Auto round-off to the nearest rupee (Miracle default). Set false to disable. */
  autoRound?: boolean;
  broker?: string;
  commissionPct?: number;
  transport?: { name?: string; lrNo?: string; vehicleNo?: string };
  /** Credit period in days → due_date (alternative to an explicit dueDate). */
  dueDays?: number;
  /** GST billing/dispatch addresses. Ship To drives place-of-supply when set. */
  billTo?: InvoiceAddress;
  shipTo?: InvoiceAddress;
  /** Optional voucher series (Miracle multi-series): sequences + prefix per series. */
  series?: string;
  /** Manual voucher number (Miracle manual series) — omitted = automatic sequence. */
  invoiceNumber?: string;
  /** TCS % collected on the invoice value (206C-style) — added on top of GST. */
  tcsPct?: number;
}

export interface InvoiceAddress {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  gstin?: string;
  phone?: string;
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
    private readonly eventBus: EventBusService,
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
        ...it, // keep Miracle ride-alongs (freeQty/d1/d2/mrpRate/baseQty/uomUsed) in the JSONB
        productId: it.productId ?? null,
        description: it.description,
        quantity,
        unitPrice: money(unitPrice),
        lineTotal: money(quantity * unitPrice),
        gstRate: it.gstRate !== undefined && it.gstRate !== null ? Number(it.gstRate) : undefined,
        hsn: it.hsn ?? undefined,
      };
    });

    const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));
    const discount = money(input.discount ?? 0);
    const taxRate = Number(input.taxRate ?? 0);
    const taxableValue = money(Math.max(0, subtotal - discount));
    const year = new Date().getFullYear();

    const invoice = await this.cm.executeInTransaction(schema, async (qr) => {
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

      // Enrich lines with HSN + GST% from the product master where not provided.
      const prodIds = lines.map((l) => l.productId).filter(Boolean);
      if (prodIds.length) {
        const prows = await qr.query(
          `SELECT id, hsn_code, COALESCE(gst_rate, 0) AS gst_rate FROM "${schema}".products WHERE id = ANY($1)`,
          [prodIds],
        );
        const byId = new Map<string, any>(prows.map((p: any) => [p.id, p]));
        for (const l of lines) {
          const p = l.productId ? byId.get(l.productId) : undefined;
          if (p) {
            if (!l.hsn) l.hsn = p.hsn_code || undefined;
            if (l.gstRate === undefined && Number(p.gst_rate) > 0) l.gstRate = Number(p.gst_rate);
          }
        }
      }

      // Tax: per-line GST rates win over the legacy whole-invoice taxRate. The invoice
      // discount is applied proportionally across lines for the taxable base.
      const hasLineGst = lines.some((l) => l.gstRate !== undefined);
      let totalTax: number;
      if (hasLineGst) {
        const factor = subtotal > 0 ? taxableValue / subtotal : 0;
        totalTax = money(lines.reduce((s, l) => s + l.lineTotal * factor * ((l.gstRate ?? 0) / 100), 0));
      } else {
        totalTax = money(taxableValue * taxRate);
      }

      // Add/Less charges (Miracle: freight/packing/other) — taxable at their own rates.
      const charges = (input.charges ?? [])
        .map((c) => ({ label: String(c.label || 'Charge').slice(0, 60), amount: money(Number(c.amount) || 0), gstRate: Number(c.gstRate) || 0 }))
        .filter((c) => c.amount !== 0);
      const chargesAmt = money(charges.reduce((s, c) => s + c.amount, 0));
      const chargesTax = money(charges.reduce((s, c) => s + (c.amount * c.gstRate) / 100, 0));
      const taxableWithCharges = money(taxableValue + chargesAmt);
      totalTax = money(totalTax + chargesTax);

      const interstate = !!input.isInterstate;
      const igst = interstate ? totalTax : 0;
      const cgst = interstate ? 0 : money(totalTax / 2);
      const sgst = interstate ? 0 : money(totalTax - cgst);

      // TCS (206C-style): collected on the tax-inclusive invoice value, on top of GST.
      const tcsPct = Math.max(0, Number(input.tcsPct) || 0);
      const tcsAmount = money(((taxableWithCharges + totalTax) * tcsPct) / 100);

      // Auto round-off to the nearest rupee (Miracle default), tracked separately.
      let total = money(taxableWithCharges + totalTax + tcsAmount);
      let roundOff = 0;
      if (input.autoRound !== false) {
        const rounded = Math.round(total);
        roundOff = money(rounded - total);
        total = rounded;
      }

      // Ship To drives place-of-supply (dispatch destination decides the GST state).
      const placeOfSupply =
        input.placeOfSupply ??
        input.shipTo?.stateCode ??
        input.billTo?.stateCode ??
        null;

      // Cash memo settles on the spot; credit period computes the due date.
      const isCash = !!input.isCash;
      const dueDate =
        input.dueDate ??
        (input.dueDays && input.dueDays > 0
          ? new Date(Date.now() + input.dueDays * 86400_000).toISOString().slice(0, 10)
          : null);

      // Voucher series (Miracle): each series has its own sequence + prefixed number.
      const series = (input.series || '').trim().toUpperCase().slice(0, 6);
      const basePrefix = (await this.getSetting<string>(qr, schema, 'erp_invoice_prefix')) ?? 'INV';
      const prefix = series ? `${basePrefix}-${series}` : basePrefix;
      const seqKey = series ? `invoice_${series}` : 'invoice';
      const manualNo = (input.invoiceNumber || '').trim();
      let formatted: string;
      if (manualNo) {
        // Miracle manual series: the operator supplies the number; reject a duplicate
        // outright instead of silently renumbering their document.
        const clash = await qr.query(`SELECT 1 FROM "${schema}".invoices WHERE invoice_number = $1`, [manualNo]);
        if (clash.length) throw new BadRequestException(`Invoice number ${manualNo} already exists`);
        formatted = manualNo;
      } else {
        // Collision-aware numbering: invoices synced down from the cloud carry THEIR
        // numbers, but the local sequence counter is not replicated — a fresh node can
        // generate an already-taken number. Walk the sequence until it's free (the
        // increments live in THIS transaction, so a rollback can't wedge the counter
        // on the same colliding value forever).
        formatted = (await this.sequences.next(schema, seqKey, { year, prefix }, qr)).formatted;
        for (let guard = 0; guard < 10_000; guard++) {
          const clash = await qr.query(`SELECT 1 FROM "${schema}".invoices WHERE invoice_number = $1`, [formatted]);
          if (!clash.length) break;
          formatted = (await this.sequences.next(schema, seqKey, { year, prefix }, qr)).formatted;
        }
      }

      // Stock deduction (Miracle bills reduce stock immediately): billed + FREE qty,
      // in base units (baseQty rides along when the line was entered in an alt unit).
      for (const l of lines as any[]) {
        if (!l.productId) continue;
        const deduct = (Number(l.baseQty) || l.quantity) + (Number(l.freeQty) || 0) * (Number(l.baseQty) && l.quantity ? (Number(l.baseQty) / l.quantity) : 1);
        if (deduct <= 0) continue;
        await qr.query(
          `UPDATE "${schema}".inventory
           SET stock_quantity = GREATEST(0, stock_quantity - $1), version = version + 1, updated_at = NOW()
           WHERE product_id = $2 AND variant_id IS NULL`,
          [Math.round(deduct), l.productId],
        );
      }

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
            amount_paid, balance_due, payment_status, due_date, note, status, branch_id, issued_at,
            cgst, sgst, igst, is_interstate, buyer_gstin, place_of_supply,
            round_off, is_cash, charges, broker, commission_pct, transport, bill_to, ship_to,
            tcs_pct, tcs_amount)
         VALUES ($1,'tax_invoice',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,
                 $27,$15,$28,$16,$17,$18,$19,COALESCE($26::timestamptz, NOW()),
                 $20,$21,$22,$23,$24,$25,
                 $29,$30,$31::jsonb,$32,$33,$34::jsonb,$35::jsonb,$36::jsonb,
                 $37,$38)
         RETURNING *`,
        [
          formatted, year, input.customerId ?? null, customerName, customerPhone,
          subtotal, discount, taxableWithCharges, totalTax, total, currency, exchangeRate, baseTotal,
          JSON.stringify(lines),
          isCash ? 0 : total, // $15 balance_due
          dueDate, input.note ?? null,
          input.status ?? 'issued', input.branchId ?? null,
          cgst, sgst, igst, interstate, input.buyerGstin ?? input.billTo?.gstin ?? null, placeOfSupply,
          input.issueDate ?? null,
          isCash ? total : 0, // $27 amount_paid
          isCash ? 'paid' : 'unpaid', // $28 payment_status
          roundOff, isCash, JSON.stringify(charges),
          input.broker?.trim() || null, input.commissionPct ?? null,
          input.transport ? JSON.stringify(input.transport) : null,
          input.billTo ? JSON.stringify(input.billTo) : null,
          input.shipTo ? JSON.stringify(input.shipTo) : null,
          tcsPct || null, tcsAmount || null,
        ],
      );
      return rows[0];
    });

    // Auto-post a Sales voucher (see AccountingPostingService). Best-effort.
    // Cash memos have no customer — they still post (Dr Cash).
    if (invoice?.id && (invoice.customer_id || invoice.is_cash)) {
      this.eventBus.emit(
        new InvoiceCreatedEvent(
          schema,
          invoice.id,
          invoice.customer_id ?? '',
          invoice.invoice_number,
          invoice.doc_type ?? 'tax_invoice',
          Number(invoice.total) || 0,
          invoice.order_id ?? null,
        ),
      );
    }
    return invoice;
  }

  /** Record a payment against an invoice and reconcile its balance + status. */
  async recordPayment(schema: string, invoiceId: string, input: RecordPaymentInput) {
    const amount = money(Number(input.amount));
    if (!(amount > 0)) throw new BadRequestException('Payment amount must be greater than zero');

    const result = await this.cm.executeInTransaction(schema, async (qr) => {
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

    // Auto-post a Receipt voucher for the recorded payment. Best-effort.
    if (result.payment?.id) {
      this.eventBus.emit(
        new PaymentVerifiedEvent(
          schema,
          result.payment.id,
          result.invoice?.order_id ?? '',
          result.invoice?.customer_id ?? '',
          Number(result.payment.amount) || 0,
        ),
      );
    }
    return result;
  }

  private async getSetting<T>(qr: QueryRunner, schema: string, key: string): Promise<T | undefined> {
    const rows = await qr.query(`SELECT value FROM "${schema}".settings WHERE key = $1`, [key]);
    return rows[0] ? (rows[0].value as T) : undefined;
  }
}
