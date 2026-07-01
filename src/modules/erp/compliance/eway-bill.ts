import { Injectable, Controller, UseGuards, Get, Post, Put, Param, Body, Query, Req, Res, BadRequestException, NotFoundException } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { ErpSequenceService } from '../common/erp-sequence.service';
import { firstRow } from '../common/sql-result.util';
import { buildEwayBillPdf } from './eway-pdf';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';

interface EwayInput {
  invoiceId?: string;
  transportMode?: string;
  vehicleNumber?: string;
  transporter?: string;
  fromPlace?: string;
  toPlace?: string;
  distanceKm?: number;
}

/**
 * E-way bills (goods transport document). Generates a local 12-digit EWB number and
 * a validity window (1 day per 200km, min 1 day — the standard rule). Real GSTN
 * e-way generation needs the NIC API + credentials; this records the bill locally
 * so it can be printed/tracked and later pushed to the portal.
 */
@Injectable()
export class EwayBillService {
  constructor(private readonly cm: TenantConnectionManager, private readonly sequences: ErpSequenceService) {}

  async list(schema: string, page = 1, limit = 50) {
    const offset = (Math.max(1, page) - 1) * limit;
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const total = parseInt((await qr.query(`SELECT COUNT(*)::int AS total FROM "${schema}".eway_bills WHERE removed = false`))[0].total);
      const data = await qr.query(`SELECT * FROM "${schema}".eway_bills WHERE removed = false ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    });
  }

  async create(schema: string, input: EwayInput) {
    const year = new Date().getFullYear();
    return this.cm.executeInTransaction(schema, async (qr) => {
      let invoiceNumber: string | null = null, value: number | null = null;
      if (input.invoiceId) {
        const inv = firstRow(await qr.query(`SELECT invoice_number, total FROM "${schema}".invoices WHERE id = $1`, [input.invoiceId]));
        if (!inv) throw new NotFoundException('Invoice not found');
        invoiceNumber = inv.invoice_number; value = Number(inv.total);
      }
      // 12-digit EWB-style number from the per-year sequence.
      const { seq } = await this.sequences.next(schema, 'eway', { year, pad: 8 }, qr);
      const ewayNumber = `${year}${String(seq).padStart(8, '0')}`.slice(0, 12);
      // Validity: 1 day per 200 km (min 1 day).
      const days = Math.max(1, Math.ceil((Number(input.distanceKm) || 0) / 200));
      const validUntil = new Date(Date.now() + days * 86400000).toISOString();
      return firstRow(await qr.query(
        `INSERT INTO "${schema}".eway_bills
           (eway_number, invoice_id, invoice_number, transport_mode, vehicle_number, transporter, from_place, to_place, distance_km, value, valid_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [ewayNumber, input.invoiceId ?? null, invoiceNumber, input.transportMode ?? 'road', input.vehicleNumber ?? null,
         input.transporter ?? null, input.fromPlace ?? null, input.toPlace ?? null, input.distanceKm ?? null, value, validUntil],
      ));
    });
  }

  /** Standard-format (EWB-01) PDF for one e-way bill, with its linked invoice's goods. */
  async getEwayPdf(schema: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const { eway, invoice, settings } = await this.cm.executeInTenantContext(schema, async (qr) => {
      const eway = firstRow(await qr.query(`SELECT * FROM "${schema}".eway_bills WHERE id = $1 AND removed = false`, [id]));
      if (!eway) throw new NotFoundException('E-way bill not found');
      let invoice: any = null;
      if (eway.invoice_id) {
        invoice = firstRow(await qr.query(`SELECT * FROM "${schema}".invoices WHERE id = $1`, [eway.invoice_id]));
      }
      const rows = await qr.query(
        `SELECT key, value FROM "${schema}".settings
         WHERE key IN ('business_name','invoice_legal_name','invoice_address','invoice_gstin','erp_currency','currency')`,
      );
      const m: Record<string, any> = {};
      for (const r of rows) m[r.key] = r.value;
      const settings = {
        businessName: m.invoice_legal_name || m.business_name || 'Your Business',
        address: m.invoice_address || undefined,
        gstin: m.invoice_gstin || undefined,
        currency: m.erp_currency || m.currency || 'INR',
      };
      return { eway, invoice, settings };
    });
    const buffer = await buildEwayBillPdf(eway, invoice, settings);
    const filename = `eway-${String(eway.eway_number).replace(/[^\w.-]/g, '_')}.pdf`;
    return { buffer, filename };
  }

  async cancel(schema: string, id: string) {
    const row = await this.cm.executeInTenantContext(schema, (qr) =>
      qr.query(`UPDATE "${schema}".eway_bills SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND removed = false RETURNING id`, [id]).then(firstRow));
    if (!row) throw new NotFoundException('E-way bill not found');
    return { id, cancelled: true };
  }
}

@Controller('erp/eway-bills')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class EwayBillController {
  constructor(private readonly service: EwayBillService) {}
  @Get() @Roles('owner', 'seller') list(@Req() req: Request, @Query('page') p?: string, @Query('limit') l?: string) { return this.service.list(req.tenantContext.schemaName, p ? +p : 1, l ? +l : 50); }
  @Post() @Roles('owner', 'seller') create(@Req() req: Request, @Body() b: EwayInput) { return this.service.create(req.tenantContext.schemaName, b); }
  @Put(':id/cancel') @Roles('owner', 'seller') cancel(@Req() req: Request, @Param('id') id: string) { return this.service.cancel(req.tenantContext.schemaName, id); }

  /** Download the e-way bill as a standard-format PDF. @Res() bypasses the JSON envelope. */
  @Get(':id/pdf')
  @Roles('owner', 'seller')
  async pdf(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.service.getEwayPdf(req.tenantContext.schemaName, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }
}
