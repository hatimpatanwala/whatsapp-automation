import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CollectService } from './collect.service';

/** Payments & Collections API (PAYMENTS_MODULE_README §9). */
@Controller('pay')
export class CollectController {
  constructor(private readonly collect: CollectService) {}

  private schema(req: Request): string {
    const schema = req.tenantContext?.schemaName;
    if (!schema) throw new UnauthorizedException('No tenant context');
    return schema;
  }

  // Setup
  @Get('config') config(@Req() req: Request) { return this.collect.getConfig(this.schema(req)); }
  @Post('config') setConfig(@Req() req: Request, @Body() body: any) { return this.collect.setConfig(this.schema(req), body); }
  @Get('methods') methods(@Req() req: Request) { return this.collect.listMethods(this.schema(req)); }
  @Post('methods') addMethod(@Req() req: Request, @Body() body: any) { return this.collect.addMethod(this.schema(req), body); }
  @Patch('methods/:id') updateMethod(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.collect.updateMethod(this.schema(req), id, body);
  }

  // Operations
  @Get('collections') list(@Req() req: Request, @Query('status') status?: string) {
    return this.collect.list(this.schema(req), status);
  }
  @Get('unmatched') unmatched(@Req() req: Request) { return this.collect.unmatched(this.schema(req)); }
  @Post('invoice/:invoiceId') createForInvoice(@Req() req: Request, @Param('invoiceId') invoiceId: string) {
    return this.collect.createForInvoice(this.schema(req), invoiceId);
  }
  @Post('collections/:id/claim') claim(@Req() req: Request, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.collect.claim(this.schema(req), id, body?.note);
  }
  /** Mode-A "Payment Received" — the only manual path to CONFIRMED. */
  @Post('collections/:id/confirm') confirmOne(@Req() req: Request, @Param('id') id: string) {
    return this.collect.confirm(this.schema(req), id, (req as any).user?.email || 'admin', 'admin');
  }
  @Post('collections/:id/refund') refund(@Req() req: Request, @Param('id') id: string, @Body() body: { amount: number; reason?: string }) {
    return this.collect.refund(this.schema(req), id, Number(body?.amount) || 0, body?.reason || '', (req as any).user?.email || 'admin');
  }

  /**
   * Provider webhook (Modes B/C). Public — authenticated by the per-tenant HMAC
   * signature, never by session. The tenant schema rides in the URL the merchant
   * registers with the provider.
   */
  @Public()
  @Post('webhook/:schema')
  webhook(@Param('schema') schema: string, @Req() req: Request, @Headers('x-razorpay-signature') signature: string) {
    if (!/^tenant_[a-z0-9_]+$/.test(schema)) throw new UnauthorizedException('Bad tenant');
    const raw = (req as any).rawBody?.toString?.() || JSON.stringify(req.body ?? {});
    return this.collect.webhook(schema, raw, signature || '');
  }
}
