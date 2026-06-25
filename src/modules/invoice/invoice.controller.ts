import { Controller, Get, Post, Param, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { InvoiceService, DocType } from '../whatsapp/invoice.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller()
@UseGuards(TenantGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get('invoices')
  @Roles('owner', 'seller', 'staff')
  async list(@Req() req: Request) {
    return this.invoiceService.listInvoices(req.tenantContext.schemaName);
  }

  @Get('invoices/:id')
  @Roles('owner', 'seller', 'staff')
  async get(@Req() req: Request, @Param('id') id: string) {
    return this.invoiceService.getInvoice(req.tenantContext.schemaName, id);
  }

  /** Generate (and send to the customer) a document for an order. */
  @Post('orders/:orderId/invoice')
  @Roles('owner', 'seller')
  async generate(@Req() req: Request, @Param('orderId') orderId: string, @Body() body: { docType?: DocType }) {
    return this.invoiceService.generateAndSend(
      req.tenantContext.schemaName, req.tenantContext.id, orderId, body?.docType || 'tax_invoice',
    );
  }
}
