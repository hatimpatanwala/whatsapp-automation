import { Get, Post, Put, Delete, Param, Body, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { BaseTenantCrudService } from './base-tenant-crud.service';

/** Convert object keys from camelCase to snake_case (one level deep). */
function toSnakeKeys(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    out[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = v;
  }
  return out;
}

/**
 * Abstract REST controller for a BaseTenantCrudService-backed entity. Concrete
 * controllers only declare `@Controller('erp/<x>')` + guards and provide the
 * service — they inherit list/read/create/update/delete here.
 *
 * The frontend speaks camelCase; request bodies are snake_cased before reaching
 * the service (whose insertable/updatable columns are snake_case). The global
 * response interceptor camelCases output, so the round-trip is consistent.
 */
export abstract class BaseErpCrudController {
  protected abstract readonly service: BaseTenantCrudService;

  @Get()
  @Roles('owner', 'seller')
  list(
    @Req() req: Request,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(req.tenantContext.schemaName, {
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @Roles('owner', 'seller')
  findById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findById(req.tenantContext.schemaName, id);
  }

  @Post()
  @Roles('owner', 'seller')
  create(@Req() req: Request, @Body() body: Record<string, any>) {
    return this.service.create(req.tenantContext.schemaName, toSnakeKeys(body));
  }

  @Put(':id')
  @Roles('owner', 'seller')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    return this.service.update(req.tenantContext.schemaName, id, toSnakeKeys(body));
  }

  @Delete(':id')
  @Roles('owner')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.remove(req.tenantContext.schemaName, id);
  }
}
