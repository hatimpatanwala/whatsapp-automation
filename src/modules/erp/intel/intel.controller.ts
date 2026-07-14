import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { ProductAnalyticsService } from './product-analytics.service';
import { ForecastService } from './forecast.service';
import { MarketPriceService } from './market-price.service';

/**
 * AI Insights Pro — premium business intelligence (plan feature `premiumInsights`):
 * product performance scores, market price comparison, 4-month demand forecast and
 * the stock planner. Entirely separate from the included /erp/insights card.
 */
@Controller('erp/intel')
export class IntelController {
  constructor(
    private readonly analytics: ProductAnalyticsService,
    private readonly forecasts: ForecastService,
    private readonly market: MarketPriceService,
  ) {}

  private schema(req: Request): string {
    const schema = req.tenantContext?.schemaName;
    if (!schema) throw new UnauthorizedException('No tenant context');
    return schema;
  }

  @Get('overview')
  @Roles('owner', 'seller') @UseGuards(ErpFeatureGuard) @RequiresFeature('premiumInsights')
  async overview(@Req() req: Request) {
    const schema = this.schema(req);
    const [perf, fc, mkt] = await Promise.all([
      this.analytics.performance(schema),
      this.forecasts.forecast(schema),
      this.market.list(schema),
    ]);
    const risers = perf.products.filter((p) => p.flags.includes('rising'));
    const stockoutRisks = perf.products.filter((p) => p.flags.includes('stockout-risk'));
    const deadStock = perf.products.filter((p) => p.flags.includes('dead-stock'));
    const priced = mkt.products.filter((p) => p.position);
    return {
      asOf: perf.asOf,
      topPerformer: perf.products[0] || null,
      topRiser: risers[0] || null,
      forecastWinner: fc.products[0] || null,
      stockoutRiskCount: stockoutRisks.length,
      deadStockCount: deadStock.length,
      pricedCount: priced.length,
      underpricedCount: priced.filter((p) => p.position === 'under').length,
      overpricedCount: priced.filter((p) => p.position === 'over').length,
      searchAvailable: mkt.searchAvailable,
    };
  }

  @Get('performance')
  @Roles('owner', 'seller') @UseGuards(ErpFeatureGuard) @RequiresFeature('premiumInsights')
  performance(@Req() req: Request, @Query('refresh') refresh?: string) {
    return this.analytics.performance(this.schema(req), refresh === '1');
  }

  @Get('forecast')
  @Roles('owner', 'seller') @UseGuards(ErpFeatureGuard) @RequiresFeature('premiumInsights')
  forecast(@Req() req: Request, @Query('refresh') refresh?: string) {
    return this.forecasts.forecast(this.schema(req), refresh === '1');
  }

  @Get('stock-plan')
  @Roles('owner', 'seller') @UseGuards(ErpFeatureGuard) @RequiresFeature('premiumInsights')
  stockPlan(@Req() req: Request, @Query('leadTimeDays') leadTimeDays?: string) {
    const lt = Math.min(90, Math.max(1, parseInt(leadTimeDays || '14', 10) || 14));
    return this.forecasts.stockPlan(this.schema(req), lt);
  }

  @Get('market-prices')
  @Roles('owner', 'seller') @UseGuards(ErpFeatureGuard) @RequiresFeature('premiumInsights')
  marketPrices(@Req() req: Request) {
    return this.market.list(this.schema(req));
  }

  @Post('market-prices/manual')
  @Roles('owner', 'seller') @UseGuards(ErpFeatureGuard) @RequiresFeature('premiumInsights')
  manualPrice(@Req() req: Request, @Body() body: any) {
    return this.market.saveManual(this.schema(req), body);
  }

  @Post('market-prices/refresh/:productId')
  @Roles('owner', 'seller') @UseGuards(ErpFeatureGuard) @RequiresFeature('premiumInsights')
  refreshPrice(@Req() req: Request, @Param('productId') productId: string) {
    return this.market.refresh(this.schema(req), productId);
  }
}
