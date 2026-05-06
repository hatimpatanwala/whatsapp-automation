import { Controller, Get, Post, Put, Param, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CategoryService } from './category.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('categories')
@UseGuards(TenantGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  async findAll(@Req() req: Request) {
    return this.categoryService.findAll(req.tenantContext.schemaName);
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    return this.categoryService.findById(req.tenantContext.schemaName, id);
  }

  @Post()
  @Roles('owner', 'seller')
  async create(@Req() req: Request, @Body() body: { name: string; parentId?: string; sortOrder?: number; translations?: any }) {
    return this.categoryService.create(req.tenantContext.schemaName, body);
  }

  @Put(':id')
  @Roles('owner', 'seller')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.categoryService.update(req.tenantContext.schemaName, id, body);
  }
}
