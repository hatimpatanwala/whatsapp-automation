import { Controller, Get, Put, Param, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { InventoryService } from './inventory.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('inventory')
@UseGuards(TenantGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles('owner', 'seller')
  async getAll(@Req() req: Request) {
    return this.inventoryService.getAll(req.tenantContext.schemaName);
  }

  @Get('low-stock')
  @Roles('owner', 'seller')
  async getLowStock(@Req() req: Request) {
    return this.inventoryService.getLowStock(req.tenantContext.schemaName);
  }

  @Put(':id/adjust')
  @Roles('owner', 'seller')
  async adjustStock(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { adjustment: number; reason?: string },
  ) {
    return this.inventoryService.adjustStock(
      req.tenantContext.schemaName, id, body.adjustment, body.reason,
    );
  }
}
