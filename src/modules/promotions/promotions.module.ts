import { Module } from '@nestjs/common';
import { SchemeController } from './scheme.controller';
import { SchemeService } from './scheme.service';
import { PromotionsEngine } from './promotions-engine.service';

@Module({
  controllers: [SchemeController],
  providers: [SchemeService, PromotionsEngine],
  exports: [SchemeService, PromotionsEngine],
})
export class PromotionsModule {}
