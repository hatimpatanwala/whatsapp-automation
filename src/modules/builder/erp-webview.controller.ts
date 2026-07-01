import { Body, Controller, Get, Param, Post, Query, Req, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ErpWebviewService } from './erp-webview.service';

/**
 * Public, TOKEN-authenticated API for the ERP Console webview (`/m/erp`). The
 * `erp` session token (X-Builder-Token header or ?token=) is the only auth and
 * resolves the tenant — without it every endpoint 401/403s, so the console is
 * useless in a plain browser. Mirrors the BuilderController convention.
 */
@Controller('m/erp')
@Public()
export class ErpWebviewController {
  constructor(private readonly svc: ErpWebviewService) {}

  private token(req: Request, q?: string): string {
    return (req.headers['x-builder-token'] as string) || q || '';
  }

  @Get('session')
  session(@Req() req: Request, @Query('token') token?: string) {
    return this.svc.session(this.token(req, token));
  }

  @Get('dashboard')
  dashboard(@Req() req: Request, @Query('token') token?: string) {
    return this.svc.dashboard(this.token(req, token));
  }

  // ── Orders ──
  @Get('orders')
  orders(@Req() req: Request, @Query('status') status?: string, @Query('token') token?: string) {
    return this.svc.orders(this.token(req, token), status);
  }

  @Get('orders/:id')
  order(@Req() req: Request, @Param('id') id: string, @Query('token') token?: string) {
    return this.svc.order(this.token(req, token), id);
  }

  @Post('orders/:id/status')
  @HttpCode(200)
  setOrderStatus(@Req() req: Request, @Param('id') id: string, @Body() body: { status: string }, @Query('token') token?: string) {
    return this.svc.setOrderStatus(this.token(req, token), id, body?.status);
  }

  // ── Invoices ──
  @Get('invoices')
  invoices(@Req() req: Request, @Query('paymentStatus') paymentStatus?: string, @Query('token') token?: string) {
    return this.svc.invoices(this.token(req, token), paymentStatus);
  }

  @Get('payment-modes')
  paymentModes(@Req() req: Request, @Query('token') token?: string) {
    return this.svc.paymentModes(this.token(req, token));
  }

  @Get('invoices/:id')
  invoice(@Req() req: Request, @Param('id') id: string, @Query('token') token?: string) {
    return this.svc.invoice(this.token(req, token), id);
  }

  @Post('invoices/:id/payment')
  @HttpCode(200)
  payInvoice(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { amount: number; paymentModeId?: string; ref?: string },
    @Query('token') token?: string,
  ) {
    return this.svc.payInvoice(this.token(req, token), id, body);
  }

  // ── Catalog ──
  @Get('products')
  products(@Req() req: Request, @Query('q') q?: string, @Query('token') token?: string) {
    return this.svc.products(this.token(req, token), q);
  }

  @Post('products/:id')
  @HttpCode(200)
  updateProduct(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { name?: string; price?: number; stock?: number; active?: boolean },
    @Query('token') token?: string,
  ) {
    return this.svc.updateProduct(this.token(req, token), id, body);
  }

  // ── Customers ──
  @Get('customers')
  customers(@Req() req: Request, @Query('q') q?: string, @Query('token') token?: string) {
    return this.svc.customers(this.token(req, token), q);
  }

  // ── Create actions (mint the focused builder/invoice webviews) ──
  @Post('new/builder')
  @HttpCode(200)
  newBuilder(@Req() req: Request, @Body() body: { type?: 'order' | 'quote' }, @Query('token') token?: string) {
    return this.svc.newBuilder(this.token(req, token), body?.type === 'quote' ? 'quote' : 'order');
  }

  @Post('new/invoice')
  @HttpCode(200)
  newInvoice(@Req() req: Request, @Query('token') token?: string) {
    return this.svc.newInvoice(this.token(req, token));
  }
}
