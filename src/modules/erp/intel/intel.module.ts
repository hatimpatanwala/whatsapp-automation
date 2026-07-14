import { Module } from '@nestjs/common';
import { ErpModule } from '../erp.module';
import { IntelController } from './intel.controller';
import { ProductAnalyticsService } from './product-analytics.service';
import { ForecastService } from './forecast.service';
import { MarketPriceService } from './market-price.service';
import { RecommendationService } from './recommendation.service';

/**
 * AI Insights Pro (premium BI). Imports ErpModule so the ErpFeatureGuard's
 * PlanFeatureService dependency resolves (same pattern as InsightsModule).
 */
@Module({
  imports: [ErpModule],
  controllers: [IntelController],
  providers: [ProductAnalyticsService, ForecastService, MarketPriceService, RecommendationService],
  exports: [ProductAnalyticsService, ForecastService, MarketPriceService, RecommendationService],
})
export class IntelModule {}
