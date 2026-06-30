import { Injectable, Controller, UseGuards, Get, Post, Put, Param, Body, Query, Req, Res, BadRequestException, NotFoundException } from '@nestjs/common';
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
interface LineInput { description: string; quantity: number; unitPrice: number; }

/** Shared logic for credit notes (sale returns) and debit notes (purchase returns). */
abstract class ReturnNoteBase {
  protected abstract table: string;
  protected abstract docType: string;
  protected abstract prefix: string;
  constructor(protected readonly cm: TenantConnectionManager, protected readonly sequences: ErpSequenceService) {}

  protected computeTotals(items: LineInput[], taxRate = 0, discount = 0) {
    const lines = items.map((it) => {
      const quantity = Number(it.quantity) || 0;
      const unitPrice = money(Number(it.unitPrice) || 0);
      return { description: it.description, quantity, unitPrice, lineTotal: money(quantity * unitPrice) };
    });
    const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));
    const disc = money(discount);
    const totalTax = money(Math.max(0, subtotal - disc) * Number(taxRate));
    const total = money(Math.max(0, subtotal - disc) + totalTax);
    return { lines, subtotal, disc, totalTax, total };
  }

  async list(schema: string, page = 1, limit = 50) {
    const offset = (Math.max(1, page) - 1) * limit;
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const total = parseInt((await qr.query(`SELECT COUNT(*)::int AS total FROM "${schema}".${this.table} WHERE removed = false`))[0].total);
      const data = await qr.query(`SELECT * FROM "${schema}".${this.table} WHERE removed = false ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    });
  }
  async findById(schema: string, id: string) {
    const row = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`SELECT * FROM "${schema}".${this.table} WHERE id = $1 AND removed = false`, [id]).then(firstRow));
    if (!row) throw new NotFoundException('Not found');
    return row;
  }
  async remove(schema: string, id: string) {
    await this.cm.executeInTenantContext(schema, (qr) => qr.query(`UPDATE "${schema}".${this.table} SET removed = true, updated_at = NOW() WHERE id = $1`, [id]));
    return { id, removed: true };
  }
}

@Injectable()
export class CreditNoteService extends ReturnNoteBase {
  protected table = 'credit_notes'; protected docType = 'credit_note'; protected prefix = 'CN';
  constructor(cm: TenantConnectionManager, sequences: ErpSequenceService) { super(cm, sequences); }

  async create(schema: string, input: { invoiceId?: string; customerId?: string; customerName?: string; customerPhone?: string; items: LineInput[]; taxRate?: number; discount?: number; reason?: string }) {
    if (!input.items?.length) throw new BadRequestException('A credit note needs at least one line item');
    const { lines, subtotal, disc, totalTax, total } = this.computeTotals(input.items, input.taxRate, input.discount);
    const year = new Date().getFullYear();
    return this.cm.executeInTransaction(schema, async (qr) => {
      const { formatted } = await this.sequences.next(schema, this.docType, { year, prefix: this.prefix }, qr);
      return firstRow(await qr.query(
        `INSERT INTO "${schema}".credit_notes (note_number, year, invoice_id, customer_id, customer_name, customer_phone, subtotal, tax_rate, total_tax, discount, total, reason, items)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING *`,
        [formatted, year, input.invoiceId ?? null, input.customerId ?? null, input.customerName ?? null, input.customerPhone ?? null, subtotal, input.taxRate ?? 0, totalTax, disc, total, input.reason ?? null, JSON.stringify(lines)],
      ));
    });
  }
}

@Injectable()
export class DebitNoteService extends ReturnNoteBase {
  protected table = 'debit_notes'; protected docType = 'debit_note'; protected prefix = 'DN';
  constructor(cm: TenantConnectionManager, sequences: ErpSequenceService) { super(cm, sequences); }

  async create(schema: string, input: { supplierId?: string; items: LineInput[]; taxRate?: number; discount?: number; reason?: string }) {
    if (!input.items?.length) throw new BadRequestException('A debit note needs at least one line item');
    const { lines, subtotal, disc, totalTax, total } = this.computeTotals(input.items, input.taxRate, input.discount);
    const year = new Date().getFullYear();
    return this.cm.executeInTransaction(schema, async (qr) => {
      const { formatted } = await this.sequences.next(schema, this.docType, { year, prefix: this.prefix }, qr);
      return firstRow(await qr.query(
        `INSERT INTO "${schema}".debit_notes (note_number, year, supplier_id, subtotal, tax_rate, total_tax, discount, total, reason, items)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
        [formatted, year, input.supplierId ?? null, subtotal, input.taxRate ?? 0, totalTax, disc, total, input.reason ?? null, JSON.stringify(lines)],
      ));
    });
  }
}

@Controller('erp/credit-notes')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class CreditNoteController {
  constructor(private readonly service: CreditNoteService, private readonly documents: ErpDocumentService) {}
  @Get() @Roles('owner', 'seller') list(@Req() req: Request, @Query('page') p?: string, @Query('limit') l?: string) { return this.service.list(req.tenantContext.schemaName, p ? +p : 1, l ? +l : 50); }
  @Get(':id/pdf') @Roles('owner', 'seller') async pdf(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.documents.getReturnNotePdf(req.tenantContext.schemaName, 'credit_notes', id);
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${filename}"`); res.send(buffer);
  }
  @Get(':id') @Roles('owner', 'seller') get(@Req() req: Request, @Param('id') id: string) { return this.service.findById(req.tenantContext.schemaName, id); }
  @Post() @Roles('owner', 'seller') create(@Req() req: Request, @Body() b: any) { return this.service.create(req.tenantContext.schemaName, b); }
  @Put(':id/remove') @Roles('owner') remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req.tenantContext.schemaName, id); }
}

@Controller('erp/debit-notes')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class DebitNoteController {
  constructor(private readonly service: DebitNoteService, private readonly documents: ErpDocumentService) {}
  @Get() @Roles('owner', 'seller') list(@Req() req: Request, @Query('page') p?: string, @Query('limit') l?: string) { return this.service.list(req.tenantContext.schemaName, p ? +p : 1, l ? +l : 50); }
  @Get(':id/pdf') @Roles('owner', 'seller') async pdf(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.documents.getReturnNotePdf(req.tenantContext.schemaName, 'debit_notes', id);
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${filename}"`); res.send(buffer);
  }
  @Get(':id') @Roles('owner', 'seller') get(@Req() req: Request, @Param('id') id: string) { return this.service.findById(req.tenantContext.schemaName, id); }
  @Post() @Roles('owner', 'seller') create(@Req() req: Request, @Body() b: any) { return this.service.create(req.tenantContext.schemaName, b); }
  @Put(':id/remove') @Roles('owner') remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req.tenantContext.schemaName, id); }
}
