import { Controller, Get, Put, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { OrderService } from './order.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('orders')
@UseGuards(TenantGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

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
}
