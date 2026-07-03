import { Body, Controller, Get, Param, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PricingService } from './pricing.service';

/** Price levels + per-party credit settings (masters for the entry screens). */
@Controller('entry/pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  private schema(req: Request): string {
    const schema = req.tenantContext?.schemaName;
    if (!schema) throw new UnauthorizedException('No tenant context');
    return schema;
  }

  @Get('levels')
  levels(@Req() req: Request) {
    return this.pricing.listLevels(this.schema(req));
  }

  @Post('levels')
  createLevel(@Req() req: Request, @Body() body: { name: string }) {
    return this.pricing.createLevel(this.schema(req), body?.name);
  }

  @Get('levels/:id/rates')
  rates(@Req() req: Request, @Param('id') id: string) {
    return this.pricing.levelRates(this.schema(req), id);
  }

  @Post('levels/:id/rates')
  saveRates(@Req() req: Request, @Param('id') id: string, @Body() body: { items: Array<{ productId: string; rate: number }> }) {
    return this.pricing.saveLevelRates(this.schema(req), id, body?.items || []);
  }

  @Patch('customer/:id/settings')
  customerSettings(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { priceLevelId?: string | null; creditLimit?: number | null; creditDays?: number | null },
  ) {
    return this.pricing.updateCustomerSettings(this.schema(req), id, body || {});
  }
}
