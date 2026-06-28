import { Controller, Get, Post, Put, Patch, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
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
    @Query('segment') segment?: string,
  ) {
    return this.customerService.findAll(req.tenantContext.schemaName, pagination, search, segment);
  }

  @Get('stats')
  @Roles('owner', 'seller')
  async getStats(@Req() req: Request) {
    return this.customerService.getStats(req.tenantContext.schemaName);
  }

  @Get('segment-summary')
  @Roles('owner', 'seller', 'staff')
  async segmentSummary(@Req() req: Request) {
    return this.customerService.segmentSummary(req.tenantContext.schemaName);
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

  @Get(':id/cart')
  async getCart(@Req() req: Request, @Param('id') id: string) {
    return this.customerService.getActiveCart(req.tenantContext.schemaName, id);
  }

  @Patch(':id')
  @Roles('owner', 'seller')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { name?: string; displayName?: string; email?: string; notes?: string; tags?: string[]; optedIn?: boolean },
  ) {
    return this.customerService.update(req.tenantContext.schemaName, id, body);
  }

  @Post(':id/block')
  @Roles('owner', 'seller')
  async block(@Req() req: Request, @Param('id') id: string) {
    return this.customerService.update(req.tenantContext.schemaName, id, { optedIn: false });
  }

  @Post(':id/unblock')
  @Roles('owner', 'seller')
  async unblock(@Req() req: Request, @Param('id') id: string) {
    return this.customerService.update(req.tenantContext.schemaName, id, { optedIn: true });
  }

  @Put(':id/tags')
  @Roles('owner', 'seller')
  async updateTags(@Req() req: Request, @Param('id') id: string, @Body() body: { tags: string[] }) {
    return this.customerService.updateTags(req.tenantContext.schemaName, id, body.tags);
  }
}
