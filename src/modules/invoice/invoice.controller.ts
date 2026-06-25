import { Controller, Get, Post, Param, Body, Req, Res, UseGuards, NotFoundException } from '@nestjs/common';
import { Request, Response } from 'express';
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

  /** Download the PDF for an invoice. */
  @Get('invoices/:id/pdf')
  @Roles('owner', 'seller', 'staff')
  async pdf(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const out = await this.invoiceService.getInvoicePdfBuffer(req.tenantContext.schemaName, id);
    if (!out) throw new NotFoundException('Invoice not found');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${out.filename}"`);
    res.send(out.buffer);
  }

  /** Generate (and send to the customer) a document for an order. */
  @Post('orders/:orderId/invoice')
  @Roles('owner', 'seller')
  async generate(@Req() req: Request, @Param('orderId') orderId: string, @Body() body: { docType?: DocType; invoiceNumber?: string }) {
    return this.invoiceService.generateAndSend(
      req.tenantContext as any, orderId, body?.docType || 'tax_invoice',
      { customNumber: body?.invoiceNumber },
    );
  }
}
