import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RequiresFeature } from '../../common/decorators/requires-feature.decorator';
import { ErpFeatureGuard } from '../../common/guards/erp-feature.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
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

  // ─── Manager: reports, beats & targets (session-authed + RBAC salesmen) ──────
  @Get('reports/performance')
  @UseGuards(ErpFeatureGuard, PermissionGuard)
  @RequiresFeature('sfa') @RequiresPermission('salesmen', 'read')
  performance(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string, @Query('salesmanId') salesmanId?: string) {
    return this.sfa.performance(this.schema(req), { from, to, salesmanId });
  }

  @Get('reports/top-products')
  @UseGuards(ErpFeatureGuard, PermissionGuard)
  @RequiresFeature('sfa') @RequiresPermission('salesmen', 'read')
  topProducts(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string, @Query('salesmanId') salesmanId?: string) {
    return this.sfa.topProducts(this.schema(req), { from, to, salesmanId });
  }

  @Get('reports/visits')
  @UseGuards(ErpFeatureGuard, PermissionGuard)
  @RequiresFeature('sfa') @RequiresPermission('salesmen', 'read')
  reportVisits(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string, @Query('salesmanId') salesmanId?: string, @Query('customerId') customerId?: string) {
    return this.sfa.visits(this.schema(req), { from, to, salesmanId, customerId });
  }

  @Get('salesmen/:id/daywise')
  @UseGuards(ErpFeatureGuard, PermissionGuard)
  @RequiresFeature('sfa') @RequiresPermission('salesmen', 'read')
  daywise(@Req() req: Request, @Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.sfa.dayWise(this.schema(req), id, { from, to });
  }

  @Get('salesmen/:id/beat')
  @UseGuards(ErpFeatureGuard, PermissionGuard)
  @RequiresFeature('sfa') @RequiresPermission('salesmen', 'read')
  getBeat(@Req() req: Request, @Param('id') id: string) {
    return this.sfa.beat(this.schema(req), id);
  }

  @Put('salesmen/:id/beat')
  @UseGuards(ErpFeatureGuard, PermissionGuard)
  @RequiresFeature('sfa') @RequiresPermission('salesmen', 'write')
  setBeat(@Req() req: Request, @Param('id') id: string, @Body() body: { customerIds: string[] }) {
    return this.sfa.setBeat(this.schema(req), id, body?.customerIds || []);
  }

  @Get('salesmen/:id/targets')
  @UseGuards(ErpFeatureGuard, PermissionGuard)
  @RequiresFeature('sfa') @RequiresPermission('salesmen', 'read')
  getTargets(@Req() req: Request, @Param('id') id: string) {
    return this.sfa.targets(this.schema(req), id);
  }

  @Put('salesmen/:id/targets')
  @UseGuards(ErpFeatureGuard, PermissionGuard)
  @RequiresFeature('sfa') @RequiresPermission('salesmen', 'write')
  setTarget(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.sfa.setTarget(this.schema(req), id, body);
  }

  // ─── Salesman portal/app (session-authed; resolves the salesman behind the user) ──
  private async appSalesman(req: Request) {
    const userId = (req.session as any)?.userId;
    const schema = this.schema(req);
    if (!userId) throw new UnauthorizedException('Not signed in');
    const salesman = await this.sfa.resolveByUser(schema, userId);
    return { schema, salesman };
  }

  @Get('app/me')
  async appMe(@Req() req: Request) {
    const { schema, salesman } = await this.appSalesman(req);
    const [home, stats] = await Promise.all([this.sfa.home(schema, salesman.id), this.sfa.myStats(schema, salesman.id)]);
    return { salesman, ...home, stats };
  }

  @Get('app/customers')
  async appCustomers(@Req() req: Request, @Query('q') q?: string) {
    const { schema } = await this.appSalesman(req);
    return this.sfa.customers(schema, q || '');
  }

  @Get('app/customers/:id')
  async appCustomer(@Req() req: Request, @Param('id') id: string) {
    const { schema } = await this.appSalesman(req);
    return this.sfa.customerDetail(schema, id);
  }

  @Post('app/customers')
  async appCreateOutlet(@Req() req: Request, @Body() body: any) {
    const { schema, salesman } = await this.appSalesman(req);
    return this.sfa.createOutlet(schema, salesman.id, body);
  }

  @Get('app/products')
  async appProducts(@Req() req: Request, @Query('q') q?: string) {
    const { schema } = await this.appSalesman(req);
    return this.sfa.products(schema, q || '');
  }

  @Get('app/pending')
  async appPending(@Req() req: Request) {
    const { schema } = await this.appSalesman(req);
    return this.sfa.pending(schema);
  }

  @Post('app/cart')
  async appCart(@Req() req: Request, @Body() body: { customerId?: string; items: any[] }) {
    const { schema } = await this.appSalesman(req);
    return this.sfa.evaluate(schema, body?.customerId, body?.items || []);
  }

  @Post('app/orders')
  async appOrder(@Req() req: Request, @Body() body: any) {
    const { schema, salesman } = await this.appSalesman(req);
    return this.sfa.takeOrder(schema, salesman, body);
  }

  @Post('app/collect')
  async appCollect(@Req() req: Request, @Body() body: any) {
    const { schema, salesman } = await this.appSalesman(req);
    return this.sfa.collect(schema, salesman, body);
  }

  @Post('app/promises')
  async appPromise(@Req() req: Request, @Body() body: any) {
    const { schema, salesman } = await this.appSalesman(req);
    return this.sfa.promise(schema, salesman, body);
  }

  @Get('app/promises')
  async appPromises(@Req() req: Request, @Query('scope') scope?: string) {
    const { schema } = await this.appSalesman(req);
    return this.sfa.promises(schema, (scope as any) || 'due');
  }

  @Get('app/beat')
  async appBeat(@Req() req: Request) {
    const { schema, salesman } = await this.appSalesman(req);
    return this.sfa.beat(schema, salesman.id);
  }

  @Get('app/visits')
  async appVisits(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) {
    const { schema, salesman } = await this.appSalesman(req);
    return this.sfa.visits(schema, { salesmanId: salesman.id, from, to });
  }

  @Post('app/visits')
  async appPlanVisit(@Req() req: Request, @Body() body: any) {
    const { schema, salesman } = await this.appSalesman(req);
    return this.sfa.planVisit(schema, salesman.id, body);
  }

  @Post('app/checkin')
  async appCheckin(@Req() req: Request, @Body() body: any) {
    const { schema, salesman } = await this.appSalesman(req);
    return this.sfa.checkIn(schema, salesman.id, body);
  }

  @Post('app/visits/:id/checkout')
  async appCheckout(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const { schema, salesman } = await this.appSalesman(req);
    return this.sfa.checkOut(schema, salesman.id, id, body || {});
  }

  @Get('app/performance')
  async appPerformance(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) {
    const { schema, salesman } = await this.appSalesman(req);
    const [rows, day] = await Promise.all([
      this.sfa.performance(schema, { from, to, salesmanId: salesman.id }),
      this.sfa.dayWise(schema, salesman.id, { from, to }),
    ]);
    const top = await this.sfa.topProducts(schema, { from, to, salesmanId: salesman.id });
    return { summary: rows?.[0] || null, dayWise: day, topProducts: top };
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

  @Public() @Post('m/customers')
  async createOutletM(@Query('t') t: string, @Query('token') token: string, @Body() body: any) {
    const s = await this.guard(t, token);
    return this.sfa.createOutlet(t, s.id, body);
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

  // ─── Webview: beat, visits & my performance ─────────────────────────────────
  @Public() @Get('m/beat')
  async mBeat(@Query('t') t: string, @Query('token') token: string) {
    const s = await this.guard(t, token);
    return this.sfa.beat(t, s.id);
  }

  @Public() @Get('m/stats')
  async mStats(@Query('t') t: string, @Query('token') token: string) {
    const s = await this.guard(t, token);
    return this.sfa.myStats(t, s.id);
  }

  @Public() @Get('m/visits')
  async mVisits(@Query('t') t: string, @Query('token') token: string, @Query('from') from?: string, @Query('to') to?: string) {
    const s = await this.guard(t, token);
    return this.sfa.visits(t, { salesmanId: s.id, from, to });
  }

  @Public() @Post('m/visits')
  async mPlanVisit(@Query('t') t: string, @Query('token') token: string, @Body() body: any) {
    const s = await this.guard(t, token);
    return this.sfa.planVisit(t, s.id, body);
  }

  @Public() @Post('m/checkin')
  async mCheckin(@Query('t') t: string, @Query('token') token: string, @Body() body: any) {
    const s = await this.guard(t, token);
    return this.sfa.checkIn(t, s.id, body);
  }

  @Public() @Post('m/visits/:id/checkout')
  async mCheckout(@Query('t') t: string, @Query('token') token: string, @Param('id') id: string, @Body() body: any) {
    const s = await this.guard(t, token);
    return this.sfa.checkOut(t, s.id, id, body || {});
  }

  @Public() @Get('m/performance')
  async mPerformance(@Query('t') t: string, @Query('token') token: string, @Query('from') from?: string, @Query('to') to?: string) {
    const s = await this.guard(t, token);
    const [day, top] = await Promise.all([
      this.sfa.dayWise(t, s.id, { from, to }),
      this.sfa.topProducts(t, { from, to, salesmanId: s.id }),
    ]);
    return { dayWise: day, topProducts: top };
  }
}
