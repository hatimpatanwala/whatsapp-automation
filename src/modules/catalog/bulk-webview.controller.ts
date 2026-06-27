import {
  Controller, Get, Post, Req, Res, Query, Body, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { BuilderService } from '../builder/builder.service';
import { BulkUploadService } from './bulk-upload.service';
import { ProductService } from './product.service';
import { CategoryService } from './category.service';
import { BrandService } from './brand.service';
import { MediaService } from '../media/media.service';

/**
 * Public, TOKEN-authenticated bulk product editor — the page the admin opens
 * from WhatsApp to download all products, edit, and re-upload. The X-Builder-Token
 * header (or ?token=, needed for file downloads) resolves the tenant; without a
 * valid bulk token everything 401/403s.
 */
@Controller('m/products')
@Public()
export class BulkWebviewController {
  constructor(
    private readonly builder: BuilderService,
    private readonly bulk: BulkUploadService,
    private readonly products: ProductService,
    private readonly categories: CategoryService,
    private readonly brands: BrandService,
    private readonly media: MediaService,
  ) {}

  private token(req: Request, q?: string): string {
    return (req.headers['x-builder-token'] as string) || q || '';
  }

  @Get('template')
  async template(@Req() req: Request, @Res() res: Response, @Query('token') token?: string) {
    const { schemaName } = await this.builder.getBulkSchema(this.token(req, token));
    const buf = await this.bulk.generateTemplate(schemaName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=product-template.xlsx');
    res.send(Buffer.from(buf));
  }

  @Get('export')
  async export(@Req() req: Request, @Res() res: Response, @Query('token') token?: string) {
    const { schemaName } = await this.builder.getBulkSchema(this.token(req, token));
    const buf = await this.bulk.exportProducts(schemaName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=products-export.xlsx');
    res.send(Buffer.from(buf));
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @Req() req: Request,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @Query('token') token?: string,
  ) {
    const { schemaName } = await this.builder.getBulkSchema(this.token(req, token));
    if (!file) throw new BadRequestException('No file uploaded');
    if (!file.originalname?.match(/\.xlsx$/i)) throw new BadRequestException('Only .xlsx files are supported');
    await this.bulk.processUpload(schemaName, file.buffer);
    return { message: 'Upload started', status: 'processing' };
  }

  @Get('status')
  async status(@Req() req: Request, @Query('token') token?: string) {
    const { schemaName } = await this.builder.getBulkSchema(this.token(req, token));
    return this.bulk.getStatus(schemaName);
  }

  /** Upload a product image from the web form → returns a public URL. */
  @Post('upload-image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async uploadImage(
    @Req() req: Request,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
    @Query('token') token?: string,
  ) {
    const { schemaName } = await this.builder.getBulkSchema(this.token(req, token));
    if (!file) throw new BadRequestException('No file uploaded');
    if (!/^image\//.test(file.mimetype || '')) throw new BadRequestException('Please upload an image file.');
    const safeName = (file.originalname || 'image').replace(/[^a-zA-Z0-9._-]/g, '_');
    const url = await this.media.uploadBuffer(schemaName, file.buffer, safeName, file.mimetype);
    return { url };
  }

  /** Categories + brands for the single-product add web form. */
  @Get('taxonomy')
  async taxonomy(@Req() req: Request, @Query('token') token?: string) {
    const { schemaName, tenantId } = await this.builder.getBulkSchema(this.token(req, token));
    const [categories, brands, whatsappPhone] = await Promise.all([
      this.categories.findAll(schemaName).catch(() => []),
      this.brands.findAll(schemaName).catch(() => []),
      this.builder.tenantWhatsappPhone(tenantId).catch(() => ''),
    ]);
    return {
      categories: categories.map((c: any) => ({ id: c.id, name: c.name })),
      brands: brands.map((b: any) => ({ id: b.id, name: b.name })),
      whatsappPhone,
    };
  }

  /** Create a single product from the web form (token-authed). */
  @Post('create')
  async createProduct(@Req() req: Request, @Body() body: any, @Query('token') token?: string) {
    const { schemaName } = await this.builder.getBulkSchema(this.token(req, token));
    if (!body?.name?.trim()) throw new BadRequestException('Product name is required.');
    const tags = typeof body.tags === 'string' && body.tags.trim()
      ? body.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : undefined;
    const product = await this.products.create(schemaName, {
      name: body.name.trim(),
      description: body.description || undefined,
      shortDescription: body.shortDescription || undefined,
      categoryId: body.categoryId || undefined,
      brandId: body.brandId || undefined,
      hsnCode: body.hsnCode || undefined,
      gstRate: body.taxRate != null && body.taxRate !== '' ? Number(body.taxRate) : undefined,
      price: Number(body.price) || 0,
      salePrice: body.salePrice != null && body.salePrice !== '' ? Number(body.salePrice) : undefined,
      sku: body.sku || undefined,
      uom: body.uom || 'pcs',
      barcode: body.barcode || undefined,
      status: body.status || 'active',
      tags,
      initialStock: body.stock != null && body.stock !== '' ? Number(body.stock) : 0,
      lowStockThreshold: body.lowStockThreshold != null && body.lowStockThreshold !== '' ? Number(body.lowStockThreshold) : undefined,
      imageUrls: body.imageUrl ? [body.imageUrl] : undefined,
    } as any);
    return { id: product.id, name: product.name };
  }
}
