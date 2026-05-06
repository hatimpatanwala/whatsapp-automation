import { Controller, Get, Put, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CustomerService } from './customer.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('customers')
@UseGuards(TenantGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @Roles('owner', 'seller', 'staff')
  async findAll(
    @Req() req: Request,
    @Query() pagination: PaginationDto,
    @Query('search') search?: string,
  ) {
    return this.customerService.findAll(req.tenantContext.schemaName, pagination, search);
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    return this.customerService.findById(req.tenantContext.schemaName, id);
  }

  @Get(':id/orders')
  async getOrders(@Req() req: Request, @Param('id') id: string) {
    return this.customerService.getCustomerOrders(req.tenantContext.schemaName, id);
  }

  @Put(':id/tags')
  @Roles('owner', 'seller')
  async updateTags(@Req() req: Request, @Param('id') id: string, @Body() body: { tags: string[] }) {
    return this.customerService.updateTags(req.tenantContext.schemaName, id, body.tags);
  }
}
