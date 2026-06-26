import { Controller, Get, Post, Put, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { BrandService } from './brand.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('brands')
@UseGuards(TenantGuard)
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Get()
  async findAll(@Req() req: Request) {
    return this.brandService.findAll(req.tenantContext.schemaName);
  }

  @Get(':id')
  async findById(@Req() req: Request, @Param('id') id: string) {
    return this.brandService.findById(req.tenantContext.schemaName, id);
  }

  @Post()
  @Roles('owner', 'seller')
  async create(
    @Req() req: Request,
    @Body() body: { name: string; description?: string; logoUrl?: string; sortOrder?: number },
  ) {
    return this.brandService.create(req.tenantContext.schemaName, body);
  }

  @Put(':id')
  @Roles('owner', 'seller')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.brandService.update(req.tenantContext.schemaName, id, body);
  }

  @Delete(':id')
  @Roles('owner', 'seller')
  async delete(@Req() req: Request, @Param('id') id: string) {
    return this.brandService.delete(req.tenantContext.schemaName, id);
  }
}
