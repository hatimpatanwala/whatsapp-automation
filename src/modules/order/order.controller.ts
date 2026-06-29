import { Controller, Get, Post, Put, Param, Body, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { OrderService } from './order.service';
import { CouponService } from '../promotions/coupon.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('orders')
@UseGuards(TenantGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly coupons: CouponService,
  ) {}

  @Get()
  @Roles('owner', 'seller', 'staff')
  async findAll(
    @Req() req: Request,
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.orderService.findAll(req.tenantContext.schemaName, pagination, status, search, paymentStatus);
  }

  /** Create an order from the in-portal "New order" page. */
  @Post()
  @Roles('owner', 'seller')
  async create(
    @Req() req: Request,
    @Body() body: {
      customerId: string;
      items: { productId?: string; productName?: string; quantity: number; unitPrice: number }[];
      notes?: string;
      discount?: number;
      deliveryFee?: number;
      taxAmount?: number;
      status?: string;
      couponCode?: string;
    },
  ) {
    const schema = req.tenantContext.schemaName;
    if (!body?.customerId) throw new BadRequestException('A customer is required.');
    if (!body?.items?.length) throw new BadRequestException('Add at least one line item.');

    // Coupon: validate server-side (never trust the client's amount), fold its
    // discount in, and record the redemption after the order is created.
    let couponId: string | null = null;
    let couponDiscount = 0;
    if (body.couponCode && body.couponCode.trim()) {
      const cartItems = body.items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) }));
      const v = await this.coupons.validate(schema, body.couponCode, cartItems, body.customerId);
      if (!v.valid) throw new BadRequestException(v.reason || 'Coupon could not be applied.');
      couponId = v.coupon!.id;
      couponDiscount = v.discount;
    }
    const totalDiscount = Math.round(((Number(body.discount) || 0) + couponDiscount) * 100) / 100;

    const order = await this.orderService.createDirect(schema, {
      customerId: body.customerId,
      items: body.items,
      notes: body.notes,
      discount: totalDiscount,
      deliveryFee: body.deliveryFee,
      taxAmount: body.taxAmount,
    });
    if (body.status && body.status !== 'pending') {
      await this.orderService.updateStatus(schema, order.id, body.status).catch(() => undefined);
    }
    if (couponId && couponDiscount > 0) {
      await this.coupons.redeem(schema, couponId, body.customerId, order.id, couponDiscount).catch(() => undefined);
    }
    return order;
  }

  @Get('stats')
  @Roles('owner', 'seller')
  async getStats(@Req() req: Request) {
    return this.orderService.getStats(req.tenantContext.schemaName);
  }

  @Get('dashboard/counts')
  @Roles('owner', 'seller')
  async getDashboardCounts(@Req() req: Request) {
    return this.orderService.getDashboardCounts(req.tenantContext.schemaName);
  }

  @Get('dashboard/chart')
  @Roles('owner', 'seller')
  async getChartData(@Req() req: Request, @Query('days') days?: string) {
    return this.orderService.getChartData(req.tenantContext.schemaName, days ? parseInt(days) : 7);
  }

  @Get(':id')
  @Roles('owner', 'seller', 'staff')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    return this.orderService.findById(req.tenantContext.schemaName, id);
  }

  @Put(':id/status')
  @Roles('owner', 'seller')
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status: string; reason?: string },
  ) {
    return this.orderService.updateStatus(req.tenantContext.schemaName, id, body.status, body.reason);
  }

  @Put(':id')
  @Roles('owner', 'seller')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: {
      items?: { productId?: string; productName?: string; quantity: number; unitPrice: number }[];
      discount?: number;
      deliveryFee?: number;
      notes?: string;
      status?: string;
    },
  ) {
    return this.orderService.updateOrder(req.tenantContext.schemaName, id, body);
  }
}
