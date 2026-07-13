import { Module } from '@nestjs/common';
import { ErpModule } from '../erp.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

/**
 * AI Insights module — self-contained analytics over the tenant's own data.
 * Imports ErpModule so the ErpFeatureGuard's PlanFeatureService dependency resolves
 * (same pattern as SfaModule). TenantConnectionManager + ConfigService are global.
 */
@Module({
  imports: [ErpModule],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
