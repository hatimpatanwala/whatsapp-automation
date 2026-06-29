import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [PromotionsModule],
  controllers: [OrderController, CartController],
  providers: [OrderService, CartService],
  exports: [OrderService, CartService],
})
export class OrderModule {}
