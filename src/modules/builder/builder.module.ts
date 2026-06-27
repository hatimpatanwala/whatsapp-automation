import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import { QuoteModule } from '../quote/quote.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { BuilderService } from './builder.service';
import { BuilderController } from './builder.controller';
import { BuilderAdminController } from './builder-admin.controller';
import { PromoWebviewController } from './promo-webview.controller';

@Module({
  imports: [OrderModule, QuoteModule, PromotionsModule],
  controllers: [BuilderController, BuilderAdminController, PromoWebviewController],
  providers: [BuilderService],
  exports: [BuilderService],
})
export class BuilderModule {}
