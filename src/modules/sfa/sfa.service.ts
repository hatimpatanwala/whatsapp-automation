import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { firstRow } from '../erp/common/sql-result.util';
import { ErpInvoiceService } from '../erp/invoicing/erp-invoice.service';
import { OrderService } from '../order/order.service';
import { EntryContextService } from '../entry/entry-context.service';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * SFA — the salesman's WhatsApp webview. The admin registers salesmen (name +
 * WhatsApp number); each gets a long-lived access token opening /m/sales. In the
 * field the salesman can: browse customers with outstanding, punch orders on a
 * customer's behalf, see every pending invoice, COLLECT payment with instrument
 * details (cash / cheque no+date / UPI / online + txn ref), and when the customer
 * can't pay, record a PROMISE-TO-PAY for a date — surfaced as the follow-up list
 * when that date arrives.
 */
@Injectable()
export class SfaService {
  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly invoices: ErpInvoiceService,
    private readonly orders: OrderService,
    private readonly ctx: EntryContextService,
  ) {}

  // ─── Admin: manage salesmen ─────────────────────────────────────────────────
  listSalesmen(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT id, name, phone, route, area, access_token, is_active, created_at
                FROM "${schema}".salesmen ORDER BY created_at DESC`),
    );
  }

  async addSalesman(schema: string, s: { name: string; phone: string; route?: string; area?: string }) {
    if (!s?.name?.trim() || !s?.phone?.trim()) throw new BadRequestException('Name and WhatsApp number are required');
    const token = randomBytes(24).toString('hex');
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `INSERT INTO "${schema}".salesmen (name, phone, route, area, access_token)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, is_active = true
         RETURNING id, access_token`,
        [s.name.trim(), s.phone.trim(), s.route?.trim() || null, s.area?.trim() || null, token],
      );
      return rows[0];
    });
  }

  async updateSalesman(schema: string, id: string, body: { isActive?: boolean; rotateToken?: boolean }) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const token = body.rotateToken ? randomBytes(24).toString('hex') : null;
      const row = firstRow(await qr.query(
        `UPDATE "${schema}".salesmen SET
           is_active = COALESCE($2, is_active),
           access_token = COALESCE($3, access_token)
         WHERE id = $1 RETURNING id, access_token, is_active`,
        [id, body.isActive ?? null, token],
      ));
      if (!row) throw new NotFoundException('Salesman not found');
      return row;
    });
  }

  // ─── Webview auth: schema + token → salesman ────────────────────────────────
  async auth(schema: string, token: string) {
    if (!/^tenant_[a-z0-9_]+$/.test(schema) || !token) throw new UnauthorizedException('Invalid link');
    const s = await this.cm.executeInTenantContext(schema, async (qr) =>
      (await qr.query(
        `SELECT id, name, phone, route, area FROM "${schema}".salesmen WHERE access_token = $1 AND is_active = true`,
        [token],
      ))[0],
    );
    if (!s) throw new UnauthorizedException('Link expired or salesman deactivated');
    return s;
  }

  // ─── Field operations ───────────────────────────────────────────────────────
  async home(schema: string, salesmanId: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const [tot] = await qr.query(
        `SELECT COALESCE(SUM(balance_due),0) AS pending, COUNT(*) FILTER (WHERE balance_due > 0) AS bills
         FROM "${schema}".invoices WHERE payment_status IN ('unpaid','partial')`,
      );
      const promises = await qr.query(
        `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone, i.invoice_number
         FROM "${schema}".payment_promises p
         LEFT JOIN "${schema}".customers c ON c.id = p.customer_id
         LEFT JOIN "${schema}".invoices i ON i.id = p.invoice_id
         WHERE p.status = 'open' AND p.promise_date <= CURRENT_DATE
         ORDER BY p.promise_date ASC LIMIT 20`,
      );
      const collectedToday = await qr.query(
        `SELECT COALESCE(SUM(amount),0) AS amt, COUNT(*) AS n FROM "${schema}".payments
         WHERE collected_by = $1 AND created_at::date = CURRENT_DATE`,
        [salesmanId],
      );
      return {
        pendingTotal: round2(Number(tot?.pending) || 0),
        pendingBills: Number(tot?.bills) || 0,
        promisesDue: promises,
        collectedToday: { amount: round2(Number(collectedToday[0]?.amt) || 0), count: Number(collectedToday[0]?.n) || 0 },
      };
    });
  }

  customers(schema: string, q: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT c.id, COALESCE(c.display_name, c.name) AS name, c.phone, c.area, c.route,
                COALESCE(ar.outstanding, 0) AS outstanding, COALESCE(ar.open_bills, 0) AS open_bills
         FROM "${schema}".customers c
         LEFT JOIN LATERAL (
           SELECT SUM(balance_due) AS outstanding, COUNT(*) FILTER (WHERE balance_due > 0) AS open_bills
           FROM "${schema}".invoices i WHERE i.customer_id = c.id
         ) ar ON true
         WHERE c.deleted_at IS NULL AND ($1 = '%%' OR c.name ILIKE $1 OR c.phone ILIKE $1 OR c.area ILIKE $1 OR c.route ILIKE $1)
         ORDER BY ar.outstanding DESC NULLS LAST LIMIT 50`,
        [`%${q}%`],
      ),
    );
  }

  async customerDetail(schema: string, customerId: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const c = (await qr.query(
        `SELECT id, COALESCE(display_name, name) AS name, phone, billing_address, area, route, credit_limit, credit_days
         FROM "${schema}".customers WHERE id = $1`, [customerId],
      ))[0];
      if (!c) throw new NotFoundException('Customer not found');
      const bills = await qr.query(
        `SELECT id, invoice_number, issued_at, due_date, total, balance_due, payment_status
         FROM "${schema}".invoices
         WHERE customer_id = $1 AND balance_due > 0 ORDER BY issued_at ASC`, [customerId],
      );
      const promises = await qr.query(
        `SELECT * FROM "${schema}".payment_promises WHERE customer_id = $1 AND status = 'open' ORDER BY promise_date`, [customerId],
      );
      return { ...c, bills, promises };
    });
  }

  products(schema: string, q: string) {
    return this.ctx.searchProducts(schema, q, 20);
  }

  /** Every open bill across customers, oldest due first — the collection run. */
  pending(schema: string) {
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT i.id, i.invoice_number, i.issued_at, i.due_date, i.total, i.balance_due, i.payment_status,
                i.customer_id, COALESCE(c.display_name, c.name) AS customer_name, c.phone AS customer_phone
         FROM "${schema}".invoices i
         LEFT JOIN "${schema}".customers c ON c.id = i.customer_id
         WHERE i.balance_due > 0
         ORDER BY i.due_date ASC NULLS LAST, i.issued_at ASC LIMIT 200`,
      ),
    );
  }

  /** Punch an order on the customer's behalf — lands as a normal pending order. */
  async takeOrder(schema: string, salesman: any, body: { customerId: string; items: Array<{ productId?: string; productName?: string; quantity: number; unitPrice: number }>; notes?: string }) {
    if (!body?.customerId || !body?.items?.length) throw new BadRequestException('Customer and items are required');
    const order = await this.orders.createDirect(schema, {
      customerId: body.customerId,
      items: body.items,
      notes: `SFA order by ${salesman.name}${body.notes ? ' — ' + body.notes : ''}`,
    } as any);
    return { id: order?.id, orderNumber: order?.order_number ?? order?.orderNumber };
  }

  /** Collect against an invoice — cash / cheque(no+date) / UPI / online(txn ref). */
  async collect(schema: string, salesman: any, body: {
    invoiceId: string; amount: number; method: string; instrumentNo?: string; instrumentDate?: string; note?: string; promiseId?: string;
  }) {
    const method = ['cash', 'cheque', 'upi', 'online'].includes(body?.method) ? body.method : 'cash';
    if (method === 'cheque' && !body.instrumentNo?.trim()) throw new BadRequestException('Cheque number is required');
    const r = await this.invoices.recordPayment(schema, body.invoiceId, {
      amount: Number(body.amount),
      method,
      instrumentNo: body.instrumentNo?.trim(),
      instrumentDate: body.instrumentDate,
      collectedBy: salesman.id,
      description: `Collected by ${salesman.name} (${method}${body.instrumentNo ? ' ' + body.instrumentNo : ''})${body.note ? ' — ' + body.note : ''}`,
    });
    // A kept promise closes automatically when its money arrives.
    if (body.promiseId) {
      await this.cm.executeInTenantContext(schema, (qr) =>
        qr.query(`UPDATE "${schema}".payment_promises SET status = 'kept', updated_at = NOW() WHERE id = $1`, [body.promiseId]),
      );
    }
    return { paid: true, invoiceStatus: r?.invoice?.payment_status, balance: r?.invoice?.balance_due };
  }

  /** Customer can't pay today → record when they WILL (promise-to-pay). */
  async promise(schema: string, salesman: any, body: { customerId: string; invoiceId?: string; amount: number; promiseDate: string; note?: string }) {
    if (!body?.customerId || !body?.promiseDate || !(Number(body.amount) > 0)) {
      throw new BadRequestException('Customer, amount and promise date are required');
    }
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `INSERT INTO "${schema}".payment_promises (customer_id, invoice_id, salesman_id, amount, promise_date, note)
         VALUES ($1,$2,$3,$4,$5::date,$6) RETURNING id, promise_date`,
        [body.customerId, body.invoiceId ?? null, salesman.id, round2(Number(body.amount)), body.promiseDate, body.note?.trim() || null],
      );
      return rows[0];
    });
  }

  promises(schema: string, scope: 'due' | 'open' | 'all' = 'due') {
    const where = scope === 'due'
      ? `WHERE p.status = 'open' AND p.promise_date <= CURRENT_DATE`
      : scope === 'open' ? `WHERE p.status = 'open'` : '';
    return this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(
        `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone, i.invoice_number, i.balance_due
         FROM "${schema}".payment_promises p
         LEFT JOIN "${schema}".customers c ON c.id = p.customer_id
         LEFT JOIN "${schema}".invoices i ON i.id = p.invoice_id
         ${where} ORDER BY p.promise_date ASC LIMIT 100`,
      ),
    );
  }

  async updatePromise(schema: string, id: string, status: 'kept' | 'broken' | 'open') {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const row = firstRow(await qr.query(
        `UPDATE "${schema}".payment_promises SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, status`,
        [id, status],
      ));
      if (!row) throw new NotFoundException('Promise not found');
      return row;
    });
  }
}
