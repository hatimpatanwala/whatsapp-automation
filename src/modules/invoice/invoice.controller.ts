import { Controller, Get, Post, Param, Body, Query, Req, Res, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { InvoiceService, DocType } from '../whatsapp/invoice.service';
import { OrderService } from '../order/order.service';
import { BuilderService } from '../builder/builder.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

interface DirectInvoiceBody {
  customerId: string;
  items: { productId?: string; productName?: string; quantity: number; unitPrice: number }[];
  notes?: string;
  discount?: number;
  deliveryFee?: number;
  taxAmount?: number;
  status?: string;           // order status to set (pending|confirmed|processing|delivered|...)
  docType?: DocType;         // tax_invoice | bill_of_supply | delivery_challan
  invoiceNumber?: string;    // optional custom number
  send?: boolean;            // deliver the invoice PDF to the customer (default true)
}

@Controller()
@UseGuards(TenantGuard)
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly orderService: OrderService,
    private readonly builder: BuilderService,
  ) {}

  /** Mint a WhatsApp webview session so the admin can bill a customer from chat. */
  @Post('invoices/webview-session')
  @Roles('owner', 'seller')
  async webviewSession(@Req() req: Request, @Body() body: { customerId?: string }) {
    const t = req.tenantContext;
    const session = await this.builder.createInvoiceSession({ tenantId: t.id, schemaName: t.schemaName, customerId: body?.customerId });
    return { token: session.token, url: session.url };
  }

  /**
   * Quick-create: build an order from line items, set its status, then issue
   * (and optionally send) the invoice — all in one step. The "create invoice
   * first → order then status → customer" admin flow.
   */
  @Post('invoices/direct')
  @Roles('owner', 'seller')
  async createDirect(@Req() req: Request, @Body() body: DirectInvoiceBody) {
    const t = req.tenantContext;
    if (!body?.customerId) throw new BadRequestException('A customer is required.');
    if (!body?.items?.length) throw new BadRequestException('Add at least one line item.');

    const order = await this.orderService.createDirect(t.schemaName, {
      customerId: body.customerId,
      items: body.items,
      notes: body.notes,
      discount: body.discount,
      deliveryFee: body.deliveryFee,
      taxAmount: body.taxAmount,
    });

    if (body.status && body.status !== 'pending') {
      await this.orderService.updateStatus(t.schemaName, order.id, body.status).catch(() => undefined);
    }

    const docType = body.docType || 'tax_invoice';
    let invoiceNumber: string | undefined;
    let sent = false;
    let reason: string | undefined;

    if (body.send === false) {
      const inv = await this.invoiceService.createInvoiceForOrder(t.schemaName, order.id, docType, body.invoiceNumber);
      invoiceNumber = inv?.invoice_number;
    } else {
      const res = await this.invoiceService.generateAndSend(t as any, order.id, docType, { customNumber: body.invoiceNumber });
      invoiceNumber = res?.invoiceNumber;
      sent = !!res?.ok;
      reason = res?.ok ? undefined : res?.reason;
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      status: body.status || 'pending',
      invoiceNumber: invoiceNumber || null,
      sent,
      reason,
    };
  }

  @Get('invoices')
  @Roles('owner', 'seller', 'staff')
  async list(@Req() req: Request, @Query('orderId') orderId?: string) {
    return this.invoiceService.listInvoices(req.tenantContext.schemaName, orderId);
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
