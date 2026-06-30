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

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface SoItemInput { productId?: string; description: string; quantity: number; unitPrice: number; }
interface CreateSoInput { supplierId?: string; items: SoItemInput[]; taxRate?: number; discount?: number; expectedDate?: string; note?: string; }

@Injectable()
export class SupplierOrderService {
  constructor(private readonly cm: TenantConnectionManager, private readonly sequences: ErpSequenceService) {}

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
      return { ...it, quantity, unitPrice, lineTotal: money(quantity * unitPrice) };
    });
    const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));
    const discount = money(input.discount ?? 0);
    const taxRate = Number(input.taxRate ?? 0);
    const totalTax = money(Math.max(0, subtotal - discount) * taxRate);
    const total = money(Math.max(0, subtotal - discount) + totalTax);
    const year = new Date().getFullYear();

    return this.cm.executeInTransaction(schema, async (qr) => {
      const { formatted } = await this.sequences.next(schema, 'supplier_order', { year, prefix: 'PO' }, qr);
      const so = firstRow(await qr.query(
        `INSERT INTO "${schema}".supplier_orders (order_number, year, supplier_id, subtotal, tax_rate, total_tax, discount, total, status, payment_status, note, expected_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft','unpaid',$9,$10) RETURNING *`,
        [formatted, year, input.supplierId ?? null, subtotal, taxRate, totalTax, discount, total, input.note ?? null, input.expectedDate ?? null],
      ));
      let i = 0;
      for (const l of lines) {
        await qr.query(
          `INSERT INTO "${schema}".supplier_order_items (supplier_order_id, product_id, description, quantity, unit_price, line_total, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [so.id, l.productId ?? null, l.description, l.quantity, l.unitPrice, l.lineTotal, i++],
        );
      }
      so.items = lines;
      return so;
    });
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
  @Patch(':id/status') @Roles('owner', 'seller')
  status(@Req() req: Request, @Param('id') id: string, @Body() body: { status: string }) { return this.service.updateStatus(req.tenantContext.schemaName, id, body.status); }
  @Put(':id/remove') @Roles('owner')
  remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req.tenantContext.schemaName, id); }
}
