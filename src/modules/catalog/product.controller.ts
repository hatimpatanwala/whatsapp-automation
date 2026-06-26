import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, Req, Res, UseGuards, UseInterceptors, UploadedFile, Optional, Logger, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { ProductService } from './product.service';
import { CategoryService } from './category.service';
import { MetaCatalogSyncService } from './meta-catalog-sync.service';
import { BulkUploadService } from './bulk-upload.service';
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
    private readonly bulkUploadService: BulkUploadService,
    @Optional() private readonly catalogSyncService?: MetaCatalogSyncService,
  ) {}

  @Get('categories')
  async getCategories(@Req() req: Request) {
    return this.categoryService.findAll(req.tenantContext.schemaName);
  }

  @Get('bulk-upload/template')
  @Roles('owner', 'seller')
  async downloadTemplate(@Req() req: Request, @Res() res: Response) {
    const buffer = await this.bulkUploadService.generateTemplate(req.tenantContext.schemaName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=product-upload-template.xlsx');
    res.send(Buffer.from(buffer));
  }

  @Get('bulk-upload/export')
  @Roles('owner', 'seller')
  async exportProducts(@Req() req: Request, @Res() res: Response) {
    const buffer = await this.bulkUploadService.exportProducts(req.tenantContext.schemaName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=products-export.xlsx');
    res.send(Buffer.from(buffer));
  }

  @Post('bulk-upload')
  @Roles('owner', 'seller')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async bulkUpload(@Req() req: Request, @UploadedFile() file: { buffer: Buffer; originalname: string; size: number }) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!file.originalname.match(/\.xlsx$/i)) {
      throw new BadRequestException('Only .xlsx files are supported');
    }
    await this.bulkUploadService.processUpload(req.tenantContext.schemaName, file.buffer);
    return { message: 'Upload started', status: 'processing' };
  }

  @Get('bulk-upload/status')
  async getBulkUploadStatus(@Req() req: Request) {
    return this.bulkUploadService.getStatus(req.tenantContext.schemaName);
  }

  @Post('bulk-upload/clear')
  @Roles('owner', 'seller')
  async clearBulkUploadStatus(@Req() req: Request) {
    this.bulkUploadService.clearStatus(req.tenantContext.schemaName);
    return { message: 'Status cleared' };
  }

  @Get()
  async findAll(
    @Req() req: Request,
    @Query() pagination: PaginationDto,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
  ) {
    return this.productService.findAll(req.tenantContext.schemaName, pagination, categoryId, brandId);
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
