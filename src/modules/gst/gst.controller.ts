import { Body, Controller, Get, Post, Param, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { GstReturnsService } from './gst-returns.service';
import { EInvoiceService } from './einvoice.service';
import { Gstr2bService } from './gstr2b.service';
import { SellerProfileService } from './seller-profile.service';

/** Convert a 'YYYY-MM' month (or empty) to the portal 'MMYYYY' period. */
function toPeriod(month?: string): string {
  const now = new Date();
  const m = /^\d{4}-\d{2}$/.test(month || '') ? (month as string) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [y, mm] = m.split('-');
  return `${mm}${y}`;
}

/**
 * GST compliance API (Phase 5) — returns + e-invoicing. Tenant-scoped via the login
 * session. Routes under /api/gst.
 */
@Controller('gst')
export class GstController {
  constructor(
    private readonly returns: GstReturnsService,
    private readonly einvoice: EInvoiceService,
    private readonly gstr2b: Gstr2bService,
    private readonly sellerProfile: SellerProfileService,
  ) {}

  /** Seller master (invoice_* settings) — used by the invoice print format. */
  @Get('seller-profile')
  seller(@Req() req: Request) {
    return this.sellerProfile.get(this.schema(req));
  }

  private schema(req: Request): string {
    const schema = req.tenantContext?.schemaName;
    if (!schema) throw new UnauthorizedException('No tenant context');
    return schema;
  }

  @Get('gstr-1')
  gstr1(@Req() req: Request, @Query('month') month?: string) {
    return this.returns.gstr1(this.schema(req), month);
  }

  @Get('gstr-3b')
  gstr3b(@Req() req: Request, @Query('month') month?: string) {
    return this.returns.gstr3b(this.schema(req), month);
  }

  @Get('hsn-summary')
  hsn(@Req() req: Request, @Query('month') month?: string) {
    return this.returns.hsnSummary(this.schema(req), month);
  }

  @Get('gstr-1/json')
  gstr1Json(@Req() req: Request, @Query('month') month?: string, @Query('gstin') gstin = '') {
    return this.returns.gstr1Json(this.schema(req), month, gstin);
  }

  @Get('einvoice/:invoiceId/payload')
  async payload(@Req() req: Request, @Param('invoiceId') invoiceId: string) {
    const schema = this.schema(req);
    const inv = await this.einvoice.getInvoice(schema, invoiceId);
    return this.einvoice.buildPayloadForInvoice(schema, inv);
  }

  @Post('einvoice/:invoiceId')
  generateIrn(@Req() req: Request, @Param('invoiceId') invoiceId: string) {
    return this.einvoice.generateIrn(this.schema(req), invoiceId);
  }

  // ─── GSTR-2B reconciliation ────────────────────────────────────────────────
  @Post('gstr-2b/import')
  import2b(@Req() req: Request, @Body() body: { month?: string; json: any }) {
    return this.gstr2b.import2b(this.schema(req), toPeriod(body?.month), body?.json);
  }

  @Get('gstr-2b/reconcile')
  reconcile2b(@Req() req: Request, @Query('month') month?: string) {
    return this.gstr2b.reconcile(this.schema(req), toPeriod(month));
  }
}
