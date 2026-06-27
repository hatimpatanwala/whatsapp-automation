import {
  Controller, Get, Post, Put, Patch, Delete, Req, Query, Body, Param,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { BuilderService } from './builder.service';
import { SchemeService } from '../promotions/scheme.service';
import { CouponService } from '../promotions/coupon.service';

/**
 * Public, TOKEN-authenticated schemes/coupons editor — the page the admin opens
 * from WhatsApp ("Schemes & Offers" → Manage) to create/edit/pause/delete offer
 * schemes and coupons. The X-Builder-Token header (or ?token=) resolves a PROMO
 * session to its tenant schema; without a valid promo token everything 401/403s.
 */
@Controller('m/promotions')
@Public()
export class PromoWebviewController {
  constructor(
    private readonly builder: BuilderService,
    private readonly schemes: SchemeService,
    private readonly coupons: CouponService,
  ) {}

  private token(req: Request, q?: string): string {
    return (req.headers['x-builder-token'] as string) || q || '';
  }

  private async schema(req: Request, token?: string): Promise<string> {
    const { schemaName } = await this.builder.getPromoSchema(this.token(req, token));
    return schemaName;
  }

  /** One-shot payload for the webview: schemes + coupons + scope/audience pickers. */
  @Get('bootstrap')
  async bootstrap(@Req() req: Request, @Query('token') token?: string) {
    const schema = await this.schema(req, token);
    const [schemes, coupons, taxonomy] = await Promise.all([
      this.schemes.findAll(schema),
      this.coupons.findAll(schema),
      this.builder.promoTaxonomy(schema),
    ]);
    return { schemes, coupons, taxonomy };
  }

  // ─── Schemes ────────────────────────────────────────────────────────────────
  @Get('schemes')
  async listSchemes(@Req() req: Request, @Query('token') token?: string) {
    return this.schemes.findAll(await this.schema(req, token));
  }

  @Post('schemes')
  async createScheme(@Req() req: Request, @Body() body: any, @Query('token') token?: string) {
    return this.schemes.create(await this.schema(req, token), body, this.token(req, token).slice(0, 12));
  }

  @Put('schemes/:id')
  async updateScheme(@Req() req: Request, @Param('id') id: string, @Body() body: any, @Query('token') token?: string) {
    return this.schemes.update(await this.schema(req, token), id, body);
  }

  @Patch('schemes/:id/status')
  async setSchemeStatus(@Req() req: Request, @Param('id') id: string, @Body() body: { status: string }, @Query('token') token?: string) {
    return this.schemes.setStatus(await this.schema(req, token), id, body.status);
  }

  @Delete('schemes/:id')
  async deleteScheme(@Req() req: Request, @Param('id') id: string, @Query('token') token?: string) {
    return this.schemes.delete(await this.schema(req, token), id);
  }

  // ─── Coupons ────────────────────────────────────────────────────────────────
  @Get('coupons')
  async listCoupons(@Req() req: Request, @Query('token') token?: string) {
    return this.coupons.findAll(await this.schema(req, token));
  }

  @Post('coupons')
  async createCoupon(@Req() req: Request, @Body() body: any, @Query('token') token?: string) {
    return this.coupons.create(await this.schema(req, token), body);
  }

  @Put('coupons/:id')
  async updateCoupon(@Req() req: Request, @Param('id') id: string, @Body() body: any, @Query('token') token?: string) {
    return this.coupons.update(await this.schema(req, token), id, body);
  }

  @Patch('coupons/:id/status')
  async setCouponStatus(@Req() req: Request, @Param('id') id: string, @Body() body: { status: string }, @Query('token') token?: string) {
    return this.coupons.setStatus(await this.schema(req, token), id, body.status);
  }

  @Delete('coupons/:id')
  async deleteCoupon(@Req() req: Request, @Param('id') id: string, @Query('token') token?: string) {
    return this.coupons.delete(await this.schema(req, token), id);
  }
}
