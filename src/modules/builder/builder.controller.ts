import { Controller, Get, Post, Req, Body, Query, HttpCode } from '@nestjs/common';
import { Request } from 'express';
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
  constructor(private readonly builder: BuilderService) {}

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
}
