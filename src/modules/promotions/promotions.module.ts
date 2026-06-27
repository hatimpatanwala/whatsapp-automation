import { Module } from '@nestjs/common';
import { SchemeController } from './scheme.controller';
import { SchemeService } from './scheme.service';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';
import { PromotionsEngine } from './promotions-engine.service';

@Module({
  controllers: [SchemeController, CouponController],
  providers: [SchemeService, CouponService, PromotionsEngine],
  exports: [SchemeService, CouponService, PromotionsEngine],
})
export class PromotionsModule {}
