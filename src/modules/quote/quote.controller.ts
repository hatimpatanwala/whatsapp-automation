import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { QuoteService } from './quote.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('quotes')
@UseGuards(TenantGuard)
export class QuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  @Get()
  @Roles('owner', 'seller')
  async findAll(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.quoteService.findAll(req.tenantContext.schemaName, {
      status,
      customerId,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('stats')
  @Roles('owner', 'seller')
  async getStats(@Req() req: Request) {
    return this.quoteService.getStats(req.tenantContext.schemaName);
  }

  @Get(':id')
  @Roles('owner', 'seller')
  async findById(@Req() req: Request, @Param('id') id: string) {
    return this.quoteService.findById(req.tenantContext.schemaName, id);
  }

  @Post()
  @Roles('owner', 'seller')
  async create(@Req() req: Request, @Body() body: {
    customerId: string;
    title?: string;
    notes?: string;
    validUntil?: string;
    discount?: number;
    items: { productId?: string; description: string; quantity: number; unitPrice: number }[];
  }) {
    return this.quoteService.create(req.tenantContext.schemaName, body);
  }

  @Put(':id')
  @Roles('owner', 'seller')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: {
    title?: string;
    notes?: string;
    validUntil?: string;
    customerId?: string;
    items?: { productId?: string; description: string; quantity: number; unitPrice: number }[];
    taxRate?: number;
  }) {
    return this.quoteService.update(req.tenantContext.schemaName, id, body);
  }

  @Patch(':id/status')
  @Roles('owner', 'seller')
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.quoteService.updateStatus(req.tenantContext.schemaName, id, body.status);
  }

  @Post(':id/duplicate')
  @Roles('owner', 'seller')
  async duplicate(@Req() req: Request, @Param('id') id: string) {
    return this.quoteService.duplicate(req.tenantContext.schemaName, id);
  }

  @Delete(':id')
  @Roles('owner')
  async delete(@Req() req: Request, @Param('id') id: string) {
    return this.quoteService.delete(req.tenantContext.schemaName, id);
  }
}
