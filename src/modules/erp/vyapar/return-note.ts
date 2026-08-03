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
import { EventBusService } from '../../events/event-bus.service';
import { CreditNoteCreatedEvent, DebitNoteCreatedEvent } from '../../events/domain-events';

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
  constructor(cm: TenantConnectionManager, sequences: ErpSequenceService, private readonly eventBus: EventBusService) { super(cm, sequences); }

  async create(schema: string, input: { invoiceId?: string; customerId?: string; customerName?: string; customerPhone?: string; items: LineInput[]; taxRate?: number; discount?: number; reason?: string }) {
    if (!input.items?.length) throw new BadRequestException('A credit note needs at least one line item');
    const { lines, subtotal, disc, totalTax, total } = this.computeTotals(input.items, input.taxRate, input.discount);
    const year = new Date().getFullYear();
    const note = await this.cm.executeInTransaction(schema, async (qr) => {
      const { formatted } = await this.sequences.next(schema, this.docType, { year, prefix: this.prefix }, qr);
      return firstRow(await qr.query(
        `INSERT INTO "${schema}".credit_notes (note_number, year, invoice_id, customer_id, customer_name, customer_phone, subtotal, tax_rate, total_tax, discount, total, reason, items)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING *`,
        [formatted, year, input.invoiceId ?? null, input.customerId ?? null, input.customerName ?? null, input.customerPhone ?? null, subtotal, input.taxRate ?? 0, totalTax, disc, total, input.reason ?? null, JSON.stringify(lines)],
      ));
    });
    // Auto-post: Dr Sales Returns + Output Tax, Cr Customer. Best-effort.
    if (note?.id) this.eventBus.emit(new CreditNoteCreatedEvent(schema, note.id, note.customer_id ?? null, Number(note.total) || 0));
    return note;
  }
}

@Injectable()
export class DebitNoteService extends ReturnNoteBase {
  protected table = 'debit_notes'; protected docType = 'debit_note'; protected prefix = 'DN';
  constructor(cm: TenantConnectionManager, sequences: ErpSequenceService, private readonly eventBus: EventBusService) { super(cm, sequences); }

  async create(schema: string, input: { supplierId?: string; items: LineInput[]; taxRate?: number; discount?: number; reason?: string }) {
    if (!input.items?.length) throw new BadRequestException('A debit note needs at least one line item');
    const { lines, subtotal, disc, totalTax, total } = this.computeTotals(input.items, input.taxRate, input.discount);
    const year = new Date().getFullYear();
    const note = await this.cm.executeInTransaction(schema, async (qr) => {
      const { formatted } = await this.sequences.next(schema, this.docType, { year, prefix: this.prefix }, qr);
      return firstRow(await qr.query(
        `INSERT INTO "${schema}".debit_notes (note_number, year, supplier_id, subtotal, tax_rate, total_tax, discount, total, reason, items)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
        [formatted, year, input.supplierId ?? null, subtotal, input.taxRate ?? 0, totalTax, disc, total, input.reason ?? null, JSON.stringify(lines)],
      ));
    });
    // Auto-post: Dr Supplier, Cr Purchase Returns + Input Tax. Best-effort.
    if (note?.id) this.eventBus.emit(new DebitNoteCreatedEvent(schema, note.id, note.supplier_id ?? null, Number(note.total) || 0));
    return note;
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

/**
 * Returns register — one place to see every return: sales returns (credit notes,
 * party = customer) and purchase returns (debit notes, party = supplier), each
 * with the party name resolved and period totals.
 */
@Injectable()
export class ReturnsRegisterService {
  constructor(private readonly cm: TenantConnectionManager) {}
  async register(schema: string, opts: { from?: string; to?: string } = {}) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const range = `AND created_at::date >= COALESCE($1::date, CURRENT_DATE - INTERVAL '365 days')
                     AND created_at::date <  COALESCE($2::date, CURRENT_DATE) + INTERVAL '1 day'`;
      const salesReturns = await qr.query(
        `SELECT cn.id, cn.note_number, cn.created_at, cn.invoice_id,
                COALESCE(NULLIF(cn.customer_name,''), c.name, 'Walk-in') AS party,
                cn.total::float AS total, cn.total_tax::float AS tax, cn.reason, cn.status
         FROM "${schema}".credit_notes cn
         LEFT JOIN "${schema}".customers c ON c.id = cn.customer_id
         WHERE cn.removed = false ${range}
         ORDER BY cn.created_at DESC LIMIT 500`, [opts.from || null, opts.to || null]);
      const purchaseReturns = await qr.query(
        `SELECT dn.id, dn.note_number, dn.created_at,
                COALESCE(s.company, 'Unknown supplier') AS party,
                dn.total::float AS total, dn.total_tax::float AS tax, dn.reason, dn.status
         FROM "${schema}".debit_notes dn
         LEFT JOIN "${schema}".suppliers s ON s.id = dn.supplier_id
         WHERE dn.removed = false ${range}
         ORDER BY dn.created_at DESC LIMIT 500`, [opts.from || null, opts.to || null]);
      const sum = (a: any[]) => Math.round(a.reduce((s, r) => s + (Number(r.total) || 0), 0) * 100) / 100;
      return {
        salesReturns, purchaseReturns,
        totals: {
          salesCount: salesReturns.length, salesValue: sum(salesReturns),
          purchaseCount: purchaseReturns.length, purchaseValue: sum(purchaseReturns),
        },
      };
    });
  }
}

@Controller('erp/returns')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class ReturnsController {
  constructor(private readonly service: ReturnsRegisterService) {}
  @Get() @Roles('owner', 'seller') register(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.register(req.tenantContext.schemaName, { from, to });
  }
}
