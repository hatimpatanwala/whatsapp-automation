import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, Req, UseGuards, Optional, Logger } from '@nestjs/common';
import { Request } from 'express';
import { ProductService } from './product.service';
import { CategoryService } from './category.service';
import { MetaCatalogSyncService } from './meta-catalog-sync.service';
import { CreateProductDto } from './dto/create-product.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('products')
@UseGuards(TenantGuard)
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(
    private readonly productService: ProductService,
    private readonly categoryService: CategoryService,
    @Optional() private readonly catalogSyncService?: MetaCatalogSyncService,
  ) {}

  @Get('categories')
  async getCategories(@Req() req: Request) {
    return this.categoryService.findAll(req.tenantContext.schemaName);
  }

  @Get()
  async findAll(
    @Req() req: Request,
    @Query() pagination: PaginationDto,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.productService.findAll(req.tenantContext.schemaName, pagination, categoryId);
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    return this.productService.findById(req.tenantContext.schemaName, id);
  }

  @Post()
  @Roles('owner', 'seller')
  async create(@Req() req: Request, @Body() dto: CreateProductDto) {
    return this.productService.create(req.tenantContext.schemaName, dto);
  }

  @Put(':id')
  @Roles('owner', 'seller')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: Partial<CreateProductDto>) {
    return this.productService.update(req.tenantContext.schemaName, id, dto);
  }

  @Patch(':id')
  @Roles('owner', 'seller')
  async patch(@Req() req: Request, @Param('id') id: string, @Body() dto: Partial<CreateProductDto>) {
    return this.productService.update(req.tenantContext.schemaName, id, dto);
  }

  @Post('sync-catalog')
  @Roles('owner', 'seller')
  async syncCatalog(@Req() req: Request, @Body() body?: { productIds?: string[] }) {
    if (!this.catalogSyncService) {
      return { synced: 0, errors: 0, message: 'Catalog sync service not available' };
    }

    const schema = req.tenantContext.schemaName;

    // If specific product IDs provided, sync individually
    if (body?.productIds?.length) {
      let synced = 0;
      let errors = 0;
      for (const id of body.productIds) {
        try {
          await this.catalogSyncService.syncProduct(schema, id);
          synced++;
        } catch {
          errors++;
        }
      }
      return { synced, errors };
    }

    // Otherwise, full sync
    return this.catalogSyncService.fullSync(schema);
  }

  @Delete(':id')
  @Roles('owner', 'seller')
  async delete(@Req() req: Request, @Param('id') id: string) {
    await this.productService.delete(req.tenantContext.schemaName, id);
    return { message: 'Product deleted' };
  }
}
