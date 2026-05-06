import { Controller, Get, Post, Put, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CartService } from './cart.service';
import { OrderService } from './order.service';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('carts')
@UseGuards(TenantGuard)
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly orderService: OrderService,
  ) {}

  @Get(':customerId')
  async getCart(@Req() req: Request, @Param('customerId') customerId: string) {
    return this.cartService.getActiveCart(req.tenantContext.schemaName, customerId);
  }

  @Post(':customerId/items')
  async addItem(
    @Req() req: Request,
    @Param('customerId') customerId: string,
    @Body() body: { productId: string; variantId?: string; quantity?: number },
  ) {
    return this.cartService.addItem(
      req.tenantContext.schemaName, customerId, body.productId, body.variantId || null, body.quantity || 1,
    );
  }

  @Put(':customerId/items/:itemId')
  async updateItem(
    @Req() req: Request,
    @Param('customerId') customerId: string,
    @Param('itemId') itemId: string,
    @Body() body: { quantity: number },
  ) {
    return this.cartService.updateItemQuantity(req.tenantContext.schemaName, customerId, itemId, body.quantity);
  }

  @Delete(':customerId/items/:itemId')
  async removeItem(
    @Req() req: Request,
    @Param('customerId') customerId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.cartService.removeItem(req.tenantContext.schemaName, customerId, itemId);
  }

  @Post(':customerId/checkout')
  async checkout(
    @Req() req: Request,
    @Param('customerId') customerId: string,
    @Body() body: { addressId: string },
  ) {
    return this.orderService.createFromCart(req.tenantContext.schemaName, customerId, body.addressId);
  }
}
