import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';

@Module({
  controllers: [OrderController, CartController],
  providers: [OrderService, CartService],
  exports: [OrderService, CartService],
})
export class OrderModule {}
