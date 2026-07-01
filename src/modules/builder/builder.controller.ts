import { Controller, Get, Post, Req, Res, Body, Query, HttpCode } from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { BuilderService } from './builder.service';

/**
 * Public, TOKEN-authenticated endpoints for the Builder webview.
 * No session/login — the X-Builder-Token header (or ?token=) is the only auth,
 * and it resolves the tenant. Without a valid token these return 401/403, so the
 * page cannot be used from a plain browser.
 */
@Controller('m/builder')
@Public()
export class BuilderController {
  constructor(
    private readonly builder: BuilderService,
    private readonly config: ConfigService,
  ) {}

  private token(req: Request, q?: string): string {
    return (req.headers['x-builder-token'] as string) || q || '';
  }

  @Get('session')
  async session(@Req() req: Request, @Query('token') token?: string) {
    return this.builder.getSession(this.token(req, token));
  }

  @Get('products')
  async products(@Req() req: Request, @Query('token') token?: string) {
    return this.builder.getProducts(this.token(req, token));
  }

  @Get('customers')
  async customers(@Req() req: Request, @Query('q') q?: string, @Query('token') token?: string) {
    return this.builder.searchCustomers(this.token(req, token), q || '');
  }

  /** Read-only order/quote details behind a VIEW token (for the customer). */
  @Get('result')
  async result(@Req() req: Request, @Query('token') token?: string) {
    return this.builder.getResult(this.token(req, token));
  }

  /** Customer accepts/rejects the quote behind a VIEW token. */
  @Post('respond')
  @HttpCode(200)
  async respond(@Req() req: Request, @Query('token') token: string, @Body() body: { action: 'accept' | 'reject' }) {
    return this.builder.respondToQuote(this.token(req, token), body?.action === 'reject' ? 'reject' : 'accept');
  }

  @Post('offers')
  @HttpCode(200)
  async offers(@Req() req: Request, @Query('token') token: string, @Body() body: any) {
    return this.builder.evaluateOffers(this.token(req, token), body?.items || []);
  }

  @Post('coupon')
  @HttpCode(200)
  async coupon(@Req() req: Request, @Query('token') token: string, @Body() body: any) {
    return this.builder.applyCoupon(this.token(req, token), body?.code || '', body?.items || []);
  }

  @Post('submit')
  @HttpCode(200)
  async submit(@Req() req: Request, @Query('token') token: string, @Body() body: any) {
    return this.builder.submit(this.token(req, token), body);
  }

  /**
   * Admin Portal auto-login bridge. Validates + consumes a one-time 'portal'
   * token, establishes the web session as the tenant owner, then redirects into
   * the full portal. `to` is an allow-listed portal path (open-redirect safe).
   */
  @Get('portal-login')
  async portalLogin(
    @Req() req: Request,
    @Res() res: Response,
    @Query('token') token?: string,
    @Query('to') to?: string,
  ): Promise<void> {
    const base = (this.config.get<string>('FRONTEND_URL', '') || '').replace(/\/$/, '');
    try {
      const { tenantId, schemaName, user, createdBy } = await this.builder.consumePortalSession(this.token(req, token));
      req.session.userId = user.id;
      req.session.userRole = user.role;
      req.session.tenantId = tenantId;
      req.session.tenantSchema = schemaName;
      // Admin's WhatsApp number (when the portal was opened from WhatsApp) — lets
      // the portal deliver PDFs to their chat while running in the WhatsApp webview.
      if (createdBy) req.session.adminPhone = createdBy;
      // Persist the session first so the auth cookie is set on THIS response.
      await new Promise<void>((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
      // Tag the landing URL so the SPA knows it's running inside the WhatsApp
      // webview (reliable across iOS/Android where the userAgent isn't) and
      // should deliver PDFs to chat instead of trying to download them.
      const path = this.safePortalPath(to);
      const marked = path.includes('?') ? `${path}&ctx=wa` : `${path}?ctx=wa`;
      return res.redirect(`${base}${marked}`);
    } catch {
      return res.redirect(`${base}/auth/login?error=portal_link_expired`);
    }
  }

  /** Only redirect to known first-party portal paths — prevents open redirects. */
  private safePortalPath(to?: string): string {
    const allow = ['/dashboard', '/orders', '/products', '/quotes', '/invoices', '/customers',
      '/erp', '/inventory', '/payments', '/deliveries', '/schemes', '/campaigns', '/settings'];
    if (to && to.startsWith('/') && !to.startsWith('//')) {
      if (allow.some((a) => to === a || to.startsWith(`${a}/`) || to.startsWith(`${a}?`))) return to;
    }
    return '/dashboard';
  }
}
