import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CouponService, CouponInput } from './coupon.service';
import { CartItemInput } from './promotions-engine.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('coupons')
@UseGuards(TenantGuard)
export class CouponController {
  constructor(private readonly coupons: CouponService) {}

  @Get()
  async findAll(@Req() req: Request) {
    return this.coupons.findAll(req.tenantContext.schemaName);
  }

  @Post('validate')
  async validate(@Req() req: Request, @Body() body: { code: string; items: CartItemInput[]; customerId?: string }) {
    return this.coupons.validate(req.tenantContext.schemaName, body?.code, body?.items || [], body?.customerId);
  }

  @Get(':id')
  async findById(@Req() req: Request, @Param('id') id: string) {
    return this.coupons.findById(req.tenantContext.schemaName, id);
  }

  @Post()
  @Roles('owner', 'seller')
  async create(@Req() req: Request, @Body() body: CouponInput) {
    return this.coupons.create(req.tenantContext.schemaName, body);
  }

  @Put(':id')
  @Roles('owner', 'seller')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: CouponInput) {
    return this.coupons.update(req.tenantContext.schemaName, id, body);
  }

  @Patch(':id/status')
  @Roles('owner', 'seller')
  async setStatus(@Req() req: Request, @Param('id') id: string, @Body() body: { status: string }) {
    return this.coupons.setStatus(req.tenantContext.schemaName, id, body.status);
  }

  @Delete(':id')
  @Roles('owner', 'seller')
  async delete(@Req() req: Request, @Param('id') id: string) {
    return this.coupons.delete(req.tenantContext.schemaName, id);
  }
}
