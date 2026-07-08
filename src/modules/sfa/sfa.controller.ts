import { Body, Controller, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RequiresFeature } from '../../common/decorators/requires-feature.decorator';
import { ErpFeatureGuard } from '../../common/guards/erp-feature.guard';
import { SfaService } from './sfa.service';

/**
 * SFA — salesman field app.
 * `/sfa/*` = admin (session-authed, tenant from context): manage salesmen + share links.
 * `/sfa/m/*` = the salesman webview (public; authenticated per-request by the
 * schema-in-URL + long-lived access token, same trust model as /pay/webhook).
 */
@Controller('sfa')
export class SfaController {
  constructor(private readonly sfa: SfaService) {}

  private schema(req: Request): string {
    const schema = req.tenantContext?.schemaName;
    if (!schema) throw new UnauthorizedException('No tenant context');
    return schema;
  }

  // ─── Admin (session-authed; gated by the `sfa` plan feature) ────────────────
  @Get('salesmen')
  @UseGuards(ErpFeatureGuard)
  @RequiresFeature('sfa')
  async list(@Req() req: Request) {
    const schema = this.schema(req);
    const rows = await this.sfa.listSalesmen(schema);
    return rows.map((s: any) => ({
      ...s,
      webviewPath: `/m/sales?t=${schema}&token=${s.access_token}`,
    }));
  }

  @Post('salesmen')
  @UseGuards(ErpFeatureGuard)
  @RequiresFeature('sfa')
  async add(@Req() req: Request, @Body() body: any) {
    const schema = this.schema(req);
    const s = await this.sfa.addSalesman(schema, body);
    return { ...s, webviewPath: `/m/sales?t=${schema}&token=${s.access_token}` };
  }

  @Patch('salesmen/:id')
  @UseGuards(ErpFeatureGuard)
  @RequiresFeature('sfa')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.sfa.updateSalesman(this.schema(req), id, body);
  }

  @Get('promises')
  @UseGuards(ErpFeatureGuard)
  @RequiresFeature('sfa')
  adminPromises(@Req() req: Request, @Query('scope') scope?: string) {
    return this.sfa.promises(this.schema(req), (scope as any) || 'all');
  }

  // ─── Salesman webview (token-authed) ────────────────────────────────────────
  private async guard(t: string, token: string) {
    return this.sfa.auth(t, token);
  }

  @Public() @Get('m/me')
  async me(@Query('t') t: string, @Query('token') token: string) {
    const s = await this.guard(t, token);
    const home = await this.sfa.home(t, s.id);
    return { salesman: s, ...home };
  }

  @Public() @Get('m/customers')
  async customers(@Query('t') t: string, @Query('token') token: string, @Query('q') q?: string) {
    await this.guard(t, token);
    return this.sfa.customers(t, q || '');
  }

  @Public() @Get('m/customers/:id')
  async customer(@Query('t') t: string, @Query('token') token: string, @Param('id') id: string) {
    await this.guard(t, token);
    return this.sfa.customerDetail(t, id);
  }

  @Public() @Get('m/customers/:id/schemes')
  async customerSchemes(@Query('t') t: string, @Query('token') token: string, @Param('id') id: string) {
    await this.guard(t, token);
    return this.sfa.customerSchemes(t, id);
  }

  @Public() @Get('m/customers/:id/cart')
  async customerCart(@Query('t') t: string, @Query('token') token: string, @Param('id') id: string) {
    await this.guard(t, token);
    return this.sfa.customerCart(t, id);
  }

  @Public() @Post('m/customers/:id/cart/items')
  async addCartItem(@Query('t') t: string, @Query('token') token: string, @Param('id') id: string, @Body() body: { productId: string; quantity: number }) {
    await this.guard(t, token);
    return this.sfa.addToCustomerCart(t, id, body?.productId, body?.quantity);
  }

  @Public() @Patch('m/customers/:id/cart/items/:itemId')
  async setCartQty(@Query('t') t: string, @Query('token') token: string, @Param('id') id: string, @Param('itemId') itemId: string, @Body() body: { quantity: number }) {
    await this.guard(t, token);
    return this.sfa.setCustomerCartQty(t, id, itemId, body?.quantity);
  }

  @Public() @Post('m/customers/:id/cart/clear')
  async clearCart(@Query('t') t: string, @Query('token') token: string, @Param('id') id: string) {
    await this.guard(t, token);
    return this.sfa.clearCustomerCart(t, id);
  }

  @Public() @Get('m/products')
  async products(@Query('t') t: string, @Query('token') token: string, @Query('q') q?: string) {
    await this.guard(t, token);
    return this.sfa.products(t, q || '');
  }

  @Public() @Get('m/schemes')
  async schemes(@Query('t') t: string, @Query('token') token: string) {
    await this.guard(t, token);
    return this.sfa.schemes(t);
  }

  @Public() @Post('m/cart')
  async cart(@Query('t') t: string, @Query('token') token: string, @Body() body: { customerId?: string; items: any[] }) {
    await this.guard(t, token);
    return this.sfa.evaluate(t, body?.customerId, body?.items || []);
  }

  @Public() @Get('m/pending')
  async pending(@Query('t') t: string, @Query('token') token: string) {
    await this.guard(t, token);
    return this.sfa.pending(t);
  }

  @Public() @Post('m/orders')
  async order(@Query('t') t: string, @Query('token') token: string, @Body() body: any) {
    const s = await this.guard(t, token);
    return this.sfa.takeOrder(t, s, body);
  }

  @Public() @Post('m/collect')
  async collect(@Query('t') t: string, @Query('token') token: string, @Body() body: any) {
    const s = await this.guard(t, token);
    return this.sfa.collect(t, s, body);
  }

  @Public() @Post('m/promises')
  async promise(@Query('t') t: string, @Query('token') token: string, @Body() body: any) {
    const s = await this.guard(t, token);
    return this.sfa.promise(t, s, body);
  }

  @Public() @Get('m/promises')
  async promises(@Query('t') t: string, @Query('token') token: string, @Query('scope') scope?: string) {
    await this.guard(t, token);
    return this.sfa.promises(t, (scope as any) || 'due');
  }

  @Public() @Patch('m/promises/:id')
  async setPromise(@Query('t') t: string, @Query('token') token: string, @Param('id') id: string, @Body() body: { status: 'kept' | 'broken' | 'open' }) {
    await this.guard(t, token);
    return this.sfa.updatePromise(t, id, body?.status || 'kept');
  }
}
