import { Controller, Get, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { InsightsService } from './insights.service';

/**
 * AI Insights — a plain-language, data-driven read of the business (sales momentum,
 * profit, product performance, receivables risk, customer concentration, stock).
 * Powers the "AI Insights" card on the Dashboard and the Business Overview. Gated by
 * the ERP plan feature (same as the rest of the business suite).
 */
@Controller('erp/insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  @Roles('owner', 'seller')
  @UseGuards(ErpFeatureGuard)
  @RequiresFeature('erp')
  get(@Req() req: Request, @Query('refresh') refresh?: string) {
    const schema = req.tenantContext?.schemaName;
    if (!schema) throw new UnauthorizedException('No tenant context');
    return this.insights.insights(schema, refresh === '1' || refresh === 'true');
  }
}
