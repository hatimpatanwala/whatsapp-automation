import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

/**
 * AI Insights module — self-contained analytics over the tenant's own data.
 * TenantConnectionManager + ConfigService are globally provided.
 */
@Module({
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
