import { Controller, Get, Post, Put, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CustomerService } from './customer.service';
import { SegmentService } from '../campaign/segment.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('customers')
@UseGuards(TenantGuard)
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly segmentService: SegmentService,
  ) {}

  @Get()
  @Roles('owner', 'seller', 'staff')
  async findAll(
    @Req() req: Request,
    @Query() pagination: PaginationDto,
    @Query('search') search?: string,
  ) {
    return this.customerService.findAll(req.tenantContext.schemaName, pagination, search);
  }

  @Get('stats')
  @Roles('owner', 'seller')
  async getStats(@Req() req: Request) {
    return this.customerService.getStats(req.tenantContext.schemaName);
  }

  @Get('segments')
  @Roles('owner', 'seller')
  async getSegments(@Req() req: Request) {
    return this.segmentService.findAll(req.tenantContext.schemaName);
  }

  @Post('segments')
  @Roles('owner', 'seller')
  async createSegment(@Req() req: Request, @Body() body: { name: string; rules: any }) {
    return this.segmentService.create(req.tenantContext.schemaName, body);
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
