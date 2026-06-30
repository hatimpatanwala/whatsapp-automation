import { Injectable, Controller, UseGuards, Get, Post, Put, Patch, Param, Body, Query, Req, Res, BadRequestException, NotFoundException } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { ErpSequenceService } from '../common/erp-sequence.service';
import { ErpInvoiceService } from '../invoicing/erp-invoice.service';
import { ErpDocumentService } from '../invoicing/erp-document.service';
import { firstRow } from '../common/sql-result.util';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface OfferItemInput { productId?: string; description: string; quantity: number; unitPrice: number; }
interface CreateOfferInput { leadId?: string; title?: string; items: OfferItemInput[]; taxRate?: number; discount?: number; validUntil?: string; note?: string; }

@Injectable()
export class OfferService {
  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly sequences: ErpSequenceService,
    private readonly invoices: ErpInvoiceService,
  ) {}

  async list(schema: string, filters: { status?: string; page?: number; limit?: number } = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const offset = (page - 1) * limit;
    const where = filters.status ? `WHERE o.removed = false AND o.status = $1` : `WHERE o.removed = false`;
    const params: any[] = filters.status ? [filters.status] : [];
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const total = parseInt((await qr.query(`SELECT COUNT(*)::int AS total FROM "${schema}".offers o ${where}`, params))[0].total);
      const data = await qr.query(
        `SELECT o.*, (l.first_name || ' ' || COALESCE(l.last_name,'')) AS lead_name
         FROM "${schema}".offers o LEFT JOIN "${schema}".leads l ON l.id = o.lead_id
         ${where} ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    });
  }

  async findById(schema: string, id: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const offer = firstRow(await qr.query(`SELECT * FROM "${schema}".offers WHERE id = $1 AND removed = false`, [id]));
      if (!offer) throw new NotFoundException('Offer not found');
      offer.items = await qr.query(`SELECT * FROM "${schema}".offer_items WHERE offer_id = $1 ORDER BY sort_order`, [id]);
      return offer;
    });
  }

  async create(schema: string, input: CreateOfferInput) {
    if (!input.items?.length) throw new BadRequestException('An offer needs at least one line item');
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
      const prefix = (firstRow(await qr.query(`SELECT value FROM "${schema}".settings WHERE key = 'erp_offer_prefix'`))?.value) || 'OFR';
      const { formatted } = await this.sequences.next(schema, 'offer', { year, prefix }, qr);
      const offer = firstRow(await qr.query(
        `INSERT INTO "${schema}".offers (offer_number, year, lead_id, title, subtotal, tax_rate, total_tax, discount, total, status, note, valid_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11) RETURNING *`,
        [formatted, year, input.leadId ?? null, input.title ?? null, subtotal, taxRate, totalTax, discount, total, input.note ?? null, input.validUntil ?? null],
      ));
      let i = 0;
      for (const l of lines) {
        await qr.query(
          `INSERT INTO "${schema}".offer_items (offer_id, product_id, description, quantity, unit_price, line_total, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [offer.id, l.productId ?? null, l.description, l.quantity, l.unitPrice, l.lineTotal, i++],
        );
      }
      offer.items = lines;
      return offer;
    });
  }

  async updateStatus(schema: string, id: string, status: string) {
    const valid = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'];
    if (!valid.includes(status)) throw new BadRequestException('Invalid status');
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const row = firstRow(await qr.query(`UPDATE "${schema}".offers SET status = $1, updated_at = NOW() WHERE id = $2 AND removed = false RETURNING *`, [status, id]));
      if (!row) throw new NotFoundException('Offer not found');
      return row;
    });
  }

  /** Create an ERP invoice from an accepted offer (copies items + the lead's name). */
  async convertToInvoice(schema: string, id: string) {
    const offer = await this.findById(schema, id);
    const leadName = await this.cm.executeInTenantContext(schema, async (qr) => {
      if (!offer.lead_id) return undefined;
      const l = firstRow(await qr.query(`SELECT first_name, last_name, phone FROM "${schema}".leads WHERE id = $1`, [offer.lead_id]));
      return l ? { name: [l.first_name, l.last_name].filter(Boolean).join(' '), phone: l.phone } : undefined;
    });
    const invoice = await this.invoices.create(schema, {
      customerName: leadName?.name,
      customerPhone: leadName?.phone,
      items: offer.items.map((it: any) => ({ description: it.description, quantity: Number(it.quantity), unitPrice: Number(it.unit_price) })),
      taxRate: Number(offer.tax_rate),
      discount: Number(offer.discount),
      note: `From offer ${offer.offer_number}`,
    });
    await this.updateStatus(schema, id, 'converted');
    return { invoice, offerNumber: offer.offer_number };
  }

  async remove(schema: string, id: string) {
    await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`UPDATE "${schema}".offers SET removed = true, updated_at = NOW() WHERE id = $1`, [id]));
    return { id, removed: true };
  }
}

@Controller('erp/offers')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class OfferController {
  constructor(
    private readonly service: OfferService,
    private readonly documents: ErpDocumentService,
  ) {}

  @Get() @Roles('owner', 'seller')
  list(@Req() req: Request, @Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.list(req.tenantContext.schemaName, { status, page: page ? +page : undefined, limit: limit ? +limit : undefined });
  }
  @Get(':id/pdf') @Roles('owner', 'seller')
  async pdf(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.documents.getOfferPdf(req.tenantContext.schemaName, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }
  @Get(':id') @Roles('owner', 'seller')
  findById(@Req() req: Request, @Param('id') id: string) { return this.service.findById(req.tenantContext.schemaName, id); }
  @Post() @Roles('owner', 'seller')
  create(@Req() req: Request, @Body() body: CreateOfferInput) { return this.service.create(req.tenantContext.schemaName, body); }
  @Patch(':id/status') @Roles('owner', 'seller')
  status(@Req() req: Request, @Param('id') id: string, @Body() body: { status: string }) { return this.service.updateStatus(req.tenantContext.schemaName, id, body.status); }
  @Post(':id/convert') @Roles('owner', 'seller')
  convert(@Req() req: Request, @Param('id') id: string) { return this.service.convertToInvoice(req.tenantContext.schemaName, id); }
  @Put(':id/remove') @Roles('owner')
  remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req.tenantContext.schemaName, id); }
}
