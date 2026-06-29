import { Controller, Get, Post, Put, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CustomFieldService, CustomFieldEntity, CustomFieldDefinitionInput } from './custom-field.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/** Admin CRUD for customer/product custom field definitions. */
@Controller('custom-fields')
@UseGuards(TenantGuard)
export class CustomFieldController {
  constructor(private readonly service: CustomFieldService) {}

  @Get()
  @Roles('owner', 'seller', 'staff')
  async list(@Req() req: Request, @Query('entity') entity?: CustomFieldEntity) {
    return this.service.list(req.tenantContext.schemaName, entity);
  }

  @Post()
  @Roles('owner', 'seller')
  async create(@Req() req: Request, @Body() body: CustomFieldDefinitionInput) {
    return this.service.create(req.tenantContext.schemaName, body);
  }

  @Put(':id')
  @Roles('owner', 'seller')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: Partial<CustomFieldDefinitionInput>) {
    return this.service.update(req.tenantContext.schemaName, id, body);
  }

  @Delete(':id')
  @Roles('owner', 'seller')
  async remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.remove(req.tenantContext.schemaName, id);
  }
}
