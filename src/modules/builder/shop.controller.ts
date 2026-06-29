import { Controller, Get, Post, Req, Body, Query, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ShopService } from './shop.service';

/**
 * Public, TOKEN-authenticated endpoints for the customer SHOP webview (/m/shop).
 * The X-Builder-Token header (or ?token=) carries a 'shop' session bound to a
 * customer; without it everything 401/403s.
 */
@Controller('m/shop')
@Public()
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  private token(req: Request, q?: string): string {
    return (req.headers['x-builder-token'] as string) || q || '';
  }

  @Get('bootstrap')
  async bootstrap(@Req() req: Request, @Query('token') token?: string) {
    return this.shop.bootstrap(this.token(req, token));
  }

  @Get('products')
  async products(
    @Req() req: Request,
    @Query('token') token?: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('q') q?: string,
  ) {
    return this.shop.products(this.token(req, token), { category, brand, q });
  }

  @Get('cart')
  async cart(@Req() req: Request, @Query('token') token?: string) {
    return this.shop.getCart(this.token(req, token));
  }

  @Post('cart/item')
  @HttpCode(200)
  async setItem(@Req() req: Request, @Query('token') token: string, @Body() body: { productId: string; quantity: number }) {
    return this.shop.setItem(this.token(req, token), body?.productId, body?.quantity);
  }

  @Post('cart/clear')
  @HttpCode(200)
  async clear(@Req() req: Request, @Query('token') token: string) {
    return this.shop.clearCart(this.token(req, token));
  }

  @Post('coupon')
  @HttpCode(200)
  async coupon(@Req() req: Request, @Query('token') token: string, @Body() body: { code: string }) {
    return this.shop.checkCoupon(this.token(req, token), body?.code || '');
  }

  @Post('checkout')
  @HttpCode(200)
  async checkout(@Req() req: Request, @Query('token') token: string, @Body() body: { couponCode?: string; notes?: string }) {
    return this.shop.checkout(this.token(req, token), body || {});
  }

  @Post('quote')
  @HttpCode(200)
  async quote(@Req() req: Request, @Query('token') token: string, @Body() body: { notes?: string }) {
    return this.shop.requestQuote(this.token(req, token), body || {});
  }
}
