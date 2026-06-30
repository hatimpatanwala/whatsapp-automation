import { Injectable, Controller, UseGuards, Get, Post, Put, Param, Body, Query, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { ErpSequenceService } from '../common/erp-sequence.service';
import { firstRow } from '../common/sql-result.util';
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
}
