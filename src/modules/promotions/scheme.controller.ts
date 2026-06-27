import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SchemeService, SchemeInput } from './scheme.service';
import { PromotionsEngine, CartItemInput } from './promotions-engine.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('schemes')
@UseGuards(TenantGuard)
export class SchemeController {
  constructor(
    private readonly schemes: SchemeService,
    private readonly engine: PromotionsEngine,
  ) {}

  @Get()
  async findAll(@Req() req: Request, @Query('status') status?: string, @Query('type') type?: string) {
    return this.schemes.findAll(req.tenantContext.schemaName, { status, type });
  }

  /** Discount badges per category/brand/product for showcasing on the catalog. */
  @Get('badges')
  async badges(@Req() req: Request) {
    return this.engine.productBadges(req.tenantContext.schemaName);
  }

  /** Evaluate a cart → applicable offers + recommended selection. */
  @Post('evaluate')
  async evaluate(@Req() req: Request, @Body() body: { items: CartItemInput[]; customerId?: string }) {
    return this.engine.evaluateCart(req.tenantContext.schemaName, body?.items || [], body?.customerId);
  }

  @Get(':id')
  async findById(@Req() req: Request, @Param('id') id: string) {
    return this.schemes.findById(req.tenantContext.schemaName, id);
  }

  @Post()
  @Roles('owner', 'seller')
  async create(@Req() req: Request, @Body() body: SchemeInput) {
    return this.schemes.create(req.tenantContext.schemaName, body, (req as any).session?.userId);
  }

  @Put(':id')
  @Roles('owner', 'seller')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: SchemeInput) {
    return this.schemes.update(req.tenantContext.schemaName, id, body);
  }

  @Patch(':id/status')
  @Roles('owner', 'seller')
  async setStatus(@Req() req: Request, @Param('id') id: string, @Body() body: { status: string }) {
    return this.schemes.setStatus(req.tenantContext.schemaName, id, body.status);
  }

  @Delete(':id')
  @Roles('owner', 'seller')
  async delete(@Req() req: Request, @Param('id') id: string) {
    return this.schemes.delete(req.tenantContext.schemaName, id);
  }
}
