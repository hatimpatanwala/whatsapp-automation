import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import { QuoteModule } from '../quote/quote.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { ErpModule } from '../erp/erp.module';
import { BuilderService } from './builder.service';
import { BuilderController } from './builder.controller';
import { BuilderAdminController } from './builder-admin.controller';
import { PromoWebviewController } from './promo-webview.controller';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { ErpWebviewController } from './erp-webview.controller';
import { ErpWebviewService } from './erp-webview.service';

@Module({
  imports: [OrderModule, QuoteModule, PromotionsModule, ErpModule],
  controllers: [BuilderController, BuilderAdminController, PromoWebviewController, ShopController, ErpWebviewController],
  providers: [BuilderService, ShopService, ErpWebviewService],
  exports: [BuilderService, ShopService],
})
export class BuilderModule {}
