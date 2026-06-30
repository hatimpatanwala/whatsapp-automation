import { Controller, Get, Post, Param, Body, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { ErpInvoiceService, CreateInvoiceInput, RecordPaymentInput } from './erp-invoice.service';
import { ErpDocumentService } from './erp-document.service';

@Controller('erp/invoices')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class ErpInvoiceController {
  constructor(
    private readonly service: ErpInvoiceService,
    private readonly documents: ErpDocumentService,
  ) {}

  @Get()
  @Roles('owner', 'seller')
  async list(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('customerId') customerId?: string,
    @Query('branchId') branchId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(req.tenantContext.schemaName, {
      status,
      paymentStatus,
      customerId,
      branchId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @Roles('owner', 'seller')
  async findById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findById(req.tenantContext.schemaName, id);
  }

  /** Stream the invoice as a PDF. @Res() bypasses the response-envelope interceptor. */
  @Get(':id/pdf')
  @Roles('owner', 'seller')
  async pdf(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.documents.getInvoicePdf(req.tenantContext.schemaName, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }

  /** Stream a payment receipt PDF for one payment. */
  @Get('payments/:paymentId/receipt')
  @Roles('owner', 'seller')
  async receipt(@Req() req: Request, @Param('paymentId') paymentId: string, @Res() res: Response) {
    const { buffer, filename } = await this.documents.getPaymentReceiptPdf(req.tenantContext.schemaName, paymentId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }

  @Post()
  @Roles('owner', 'seller')
  async create(@Req() req: Request, @Body() body: CreateInvoiceInput) {
    return this.service.create(req.tenantContext.schemaName, body);
  }

  @Post(':id/payments')
  @Roles('owner', 'seller')
  async recordPayment(@Req() req: Request, @Param('id') id: string, @Body() body: RecordPaymentInput) {
    return this.service.recordPayment(req.tenantContext.schemaName, id, body);
  }
}
