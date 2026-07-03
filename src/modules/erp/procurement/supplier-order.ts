import { Injectable, Controller, UseGuards, Get, Post, Patch, Put, Param, Body, Query, Req, Res, BadRequestException, NotFoundException } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { ErpSequenceService } from '../common/erp-sequence.service';
import { ErpDocumentService } from '../invoicing/erp-document.service';
import { firstRow } from '../common/sql-result.util';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { EventBusService } from '../../events/event-bus.service';
import { PurchaseRecordedEvent, SupplierPaymentRecordedEvent } from '../../events/domain-events';

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface SoItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** Per-line GST percent; when present on any line it wins over taxRate. */
  gstRate?: number;
  hsn?: string;
  /** Miracle ride-alongs. */
  freeQty?: number;
  d1?: number;
  d2?: number;
  mrpRate?: number;
}
interface CreateSoInput {
  supplierId?: string;
  items: SoItemInput[];
  taxRate?: number;
  discount?: number;
  expectedDate?: string;
  note?: string;
  /** Tally purchase-voucher fields: the supplier's own bill number/date (drives GSTR-2B matching). */
  supplierInvoiceNo?: string;
  supplierInvoiceDate?: string;
  isInterstate?: boolean;
  /** Add/Less charges (freight etc.) — taxable at their own GST rates. */
  charges?: Array<{ label: string; amount: number; gstRate?: number }>;
}

@Injectable()
export class SupplierOrderService {
  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly sequences: ErpSequenceService,
    private readonly eventBus: EventBusService,
  ) {}

  async list(schema: string, filters: { status?: string; page?: number; limit?: number } = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const offset = (page - 1) * limit;
    const where = filters.status ? `WHERE so.removed = false AND so.status = $1` : `WHERE so.removed = false`;
    const params: any[] = filters.status ? [filters.status] : [];
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const total = parseInt((await qr.query(`SELECT COUNT(*)::int AS total FROM "${schema}".supplier_orders so ${where}`, params))[0].total);
      const data = await qr.query(
        `SELECT so.*, s.company AS supplier_name FROM "${schema}".supplier_orders so
         LEFT JOIN "${schema}".suppliers s ON s.id = so.supplier_id
         ${where} ORDER BY so.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    });
  }

  async findById(schema: string, id: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const so = firstRow(await qr.query(`SELECT * FROM "${schema}".supplier_orders WHERE id = $1 AND removed = false`, [id]));
      if (!so) throw new NotFoundException('Supplier order not found');
      so.items = await qr.query(`SELECT * FROM "${schema}".supplier_order_items WHERE supplier_order_id = $1 ORDER BY sort_order`, [id]);
      return so;
    });
  }

  async create(schema: string, input: CreateSoInput) {
    if (!input.items?.length) throw new BadRequestException('A purchase order needs at least one line item');
    const lines = input.items.map((it) => {
      const quantity = Number(it.quantity) || 0;
      const unitPrice = money(Number(it.unitPrice) || 0);
      const gstRate = it.gstRate !== undefined && it.gstRate !== null ? Number(it.gstRate) : undefined;
      return { ...it, quantity, unitPrice, gstRate, lineTotal: money(quantity * unitPrice) };
    });
    const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));
    const discount = money(input.discount ?? 0);
    const taxRate = Number(input.taxRate ?? 0);
    const taxable = money(Math.max(0, subtotal - discount));

    // Per-line GST wins over the legacy whole-order rate; discount applies proportionally.
    const hasLineGst = lines.some((l) => l.gstRate !== undefined);
    let totalTax: number;
    if (hasLineGst) {
      const factor = subtotal > 0 ? taxable / subtotal : 0;
      totalTax = money(lines.reduce((s, l) => s + l.lineTotal * factor * ((l.gstRate ?? 0) / 100), 0));
    } else {
      totalTax = money(taxable * taxRate);
    }
    // Purchase-side Add/Less charges, taxable at their own rates.
    const charges = (input.charges ?? [])
      .map((c) => ({ label: String(c.label || 'Charge').slice(0, 60), amount: money(Number(c.amount) || 0), gstRate: Number(c.gstRate) || 0 }))
      .filter((c) => c.amount !== 0);
    const chargesAmt = money(charges.reduce((s, c) => s + c.amount, 0));
    totalTax = money(totalTax + charges.reduce((s, c) => s + (c.amount * c.gstRate) / 100, 0));

    const interstate = !!input.isInterstate;
    const igst = interstate ? totalTax : 0;
    const cgst = interstate ? 0 : money(totalTax / 2);
    const sgst = interstate ? 0 : money(totalTax - cgst);
    const total = money(taxable + chargesAmt + totalTax);
    const year = new Date().getFullYear();

    const so = await this.cm.executeInTransaction(schema, async (qr) => {
      const { formatted } = await this.sequences.next(schema, 'supplier_order', { year, prefix: 'PO' }, qr);
      const row = firstRow(await qr.query(
        `INSERT INTO "${schema}".supplier_orders
           (order_number, year, supplier_id, subtotal, tax_rate, total_tax, discount, total, status, payment_status,
            note, expected_date, supplier_invoice_no, supplier_invoice_date, cgst, sgst, igst, is_interstate, charges)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft','unpaid',$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb) RETURNING *`,
        [
          formatted, year, input.supplierId ?? null, subtotal, taxRate, totalTax, discount, total,
          input.note ?? null, input.expectedDate ?? null,
          input.supplierInvoiceNo ?? null, input.supplierInvoiceDate ?? null, cgst, sgst, igst, interstate,
          JSON.stringify(charges),
        ],
      ));
      let i = 0;
      for (const l of lines) {
        await qr.query(
          `INSERT INTO "${schema}".supplier_order_items (supplier_order_id, product_id, description, quantity, unit_price, line_total, gst_rate, hsn, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [row.id, l.productId ?? null, l.description, l.quantity, l.unitPrice, l.lineTotal, l.gstRate ?? 0, l.hsn ?? null, i++],
        );
        // Miracle: purchases add stock immediately (billed + free qty).
        if (l.productId) {
          const add = l.quantity + (Number(l.freeQty) || 0);
          const upd = await qr.query(
            `UPDATE "${schema}".inventory SET stock_quantity = stock_quantity + $1, version = version + 1, updated_at = NOW()
             WHERE product_id = $2 AND variant_id IS NULL RETURNING id`,
            [Math.round(add), l.productId],
          );
          if (!upd.length) {
            await qr.query(
              `INSERT INTO "${schema}".inventory (product_id, stock_quantity) VALUES ($1, $2)`,
              [l.productId, Math.round(add)],
            );
          }
        }
      }
      row.items = lines;
      return row;
    });

    // Auto-post a Purchase voucher (Dr Purchase + Input Tax, Cr Supplier). Best-effort.
    if (so?.id) {
      this.eventBus.emit(
        new PurchaseRecordedEvent(schema, so.id, so.supplier_id ?? null, so.order_number, Number(so.total) || 0),
      );
    }
    return so;
  }

  /**
   * Record a payment against a purchase (bill-wise payables reconciliation, mirroring
   * ErpInvoiceService.recordPayment). Auto-posts a Payment voucher via the event.
   */
  async recordPayment(schema: string, orderId: string, input: { amount: number; method?: string; ref?: string; description?: string }) {
    const amount = money(Number(input.amount));
    if (!(amount > 0)) throw new BadRequestException('Payment amount must be greater than zero');

    const result = await this.cm.executeInTransaction(schema, async (qr) => {
      const so = firstRow(await qr.query(
        `SELECT * FROM "${schema}".supplier_orders WHERE id = $1 AND removed = false FOR UPDATE`,
        [orderId],
      ));
      if (!so) throw new NotFoundException(`Supplier order ${orderId} not found`);

      const total = Number(so.total);
      const alreadyPaid = Number(so.amount_paid) || 0;
      const maxPayable = money(total - alreadyPaid);
      if (amount > maxPayable) throw new BadRequestException(`Payment exceeds balance due (${maxPayable})`);

      const method = (input.method || 'bank').toLowerCase();
      const payment = firstRow(await qr.query(
        `INSERT INTO "${schema}".payments (supplier_order_id, method, status, amount, currency, ref, description)
         VALUES ($1,$2,'completed',$3,$4,$5,$6) RETURNING *`,
        [orderId, method, amount, so.currency ?? 'INR', input.ref ?? null, input.description ?? null],
      ));

      const newPaid = money(alreadyPaid + amount);
      const balance = money(total - newPaid);
      const paymentStatus = balance <= 0 ? 'paid' : 'partial';
      const order = firstRow(await qr.query(
        `UPDATE "${schema}".supplier_orders SET amount_paid = $1, payment_status = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [newPaid, paymentStatus, orderId],
      ));
      return { order, payment };
    });

    if (result.payment?.id) {
      this.eventBus.emit(new SupplierPaymentRecordedEvent(
        schema, result.payment.id, orderId, result.order?.supplier_id ?? null,
        Number(result.payment.amount) || 0, String(result.payment.method || 'bank'),
      ));
    }
    return result;
  }

  async updateStatus(schema: string, id: string, status: string) {
    const valid = ['draft', 'ordered', 'received', 'cancelled'];
    if (!valid.includes(status)) throw new BadRequestException('Invalid status');
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const row = firstRow(await qr.query(`UPDATE "${schema}".supplier_orders SET status = $1, updated_at = NOW() WHERE id = $2 AND removed = false RETURNING *`, [status, id]));
      if (!row) throw new NotFoundException('Supplier order not found');
      return row;
    });
  }

  async remove(schema: string, id: string) {
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`UPDATE "${schema}".supplier_orders SET removed = true, updated_at = NOW() WHERE id = $1`, [id]));
    return { id, removed: true };
  }
}

@Controller('erp/supplier-orders')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class SupplierOrderController {
  constructor(
    private readonly service: SupplierOrderService,
    private readonly documents: ErpDocumentService,
  ) {}

  @Get() @Roles('owner', 'seller')
  list(@Req() req: Request, @Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.list(req.tenantContext.schemaName, { status, page: page ? +page : undefined, limit: limit ? +limit : undefined });
  }
  @Get(':id/pdf') @Roles('owner', 'seller')
  async pdf(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.documents.getSupplierOrderPdf(req.tenantContext.schemaName, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }
  @Get(':id') @Roles('owner', 'seller')
  findById(@Req() req: Request, @Param('id') id: string) { return this.service.findById(req.tenantContext.schemaName, id); }
  @Post() @Roles('owner', 'seller')
  create(@Req() req: Request, @Body() body: CreateSoInput) { return this.service.create(req.tenantContext.schemaName, body); }
  @Post(':id/payments') @Roles('owner', 'seller')
  recordPayment(@Req() req: Request, @Param('id') id: string, @Body() body: { amount: number; method?: string; ref?: string; description?: string }) {
    return this.service.recordPayment(req.tenantContext.schemaName, id, body);
  }
  @Patch(':id/status') @Roles('owner', 'seller')
  status(@Req() req: Request, @Param('id') id: string, @Body() body: { status: string }) { return this.service.updateStatus(req.tenantContext.schemaName, id, body.status); }
  @Put(':id/remove') @Roles('owner')
  remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req.tenantContext.schemaName, id); }
}
