import { Module } from '@nestjs/common';
import { SchemeController } from './scheme.controller';
import { SchemeService } from './scheme.service';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';
import { PromotionsEngine } from './promotions-engine.service';
import { LoyaltyService } from './loyalty.service';

@Module({
  controllers: [SchemeController, CouponController],
  providers: [SchemeService, CouponService, PromotionsEngine, LoyaltyService],
  exports: [SchemeService, CouponService, PromotionsEngine, LoyaltyService],
})
export class PromotionsModule {}
