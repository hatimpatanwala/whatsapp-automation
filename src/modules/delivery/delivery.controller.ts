import { Controller, Get, Post, Put, Param, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { DeliveryService } from './delivery.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('deliveries')
@UseGuards(TenantGuard)
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get()
  @Roles('owner', 'seller', 'staff')
  async findAll(@Req() req: Request) {
    return this.deliveryService.findAll(req.tenantContext.schemaName);
  }

  @Post(':id/assign')
  @Roles('owner', 'seller')
  async assign(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { assignedTo: string; estimatedDelivery?: string },
  ) {
    return this.deliveryService.assignDelivery(
      req.tenantContext.schemaName, id, body.assignedTo,
      body.estimatedDelivery ? new Date(body.estimatedDelivery) : undefined,
    );
  }

  @Put(':id/status')
  @Roles('owner', 'seller', 'staff')
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status: string; notes?: string },
  ) {
    return this.deliveryService.updateStatus(req.tenantContext.schemaName, id, body.status, body.notes);
  }
}
