import { Controller, Get, Post, Put, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { ErpFeatureGuard } from '../../../common/guards/erp-feature.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { PaymentModeService } from './payment-mode.service';

interface PaymentModeBody {
  name?: string;
  description?: string;
  ref?: string;
  isDefault?: boolean;
  enabled?: boolean;
}

@Controller('erp/payment-modes')
@UseGuards(TenantGuard, ErpFeatureGuard)
@RequiresFeature('erp')
export class PaymentModeController {
  constructor(private readonly service: PaymentModeService) {}

  @Get()
  @Roles('owner', 'seller')
  async list(
    @Req() req: Request,
    @Query('search') search?: string,
    @Query('enabled') enabled?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(req.tenantContext.schemaName, {
      search,
      filters: enabled === undefined ? undefined : { enabled: enabled === 'true' },
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @Roles('owner', 'seller')
  async findById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findById(req.tenantContext.schemaName, id);
  }

  @Post()
  @Roles('owner', 'seller')
  async create(@Req() req: Request, @Body() body: PaymentModeBody) {
    return this.service.create(req.tenantContext.schemaName, this.toRow(body));
  }

  @Put(':id')
  @Roles('owner', 'seller')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: PaymentModeBody) {
    return this.service.update(req.tenantContext.schemaName, id, this.toRow(body));
  }

  @Delete(':id')
  @Roles('owner')
  async remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.remove(req.tenantContext.schemaName, id);
  }

  /** Map the camelCase request body to snake_case table columns. */
  private toRow(body: PaymentModeBody) {
    return {
      name: body.name,
      description: body.description,
      ref: body.ref,
      is_default: body.isDefault,
      enabled: body.enabled,
    };
  }
}
