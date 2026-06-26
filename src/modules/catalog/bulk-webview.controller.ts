import {
  Controller, Get, Post, Req, Res, Query, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { BuilderService } from '../builder/builder.service';
import { BulkUploadService } from './bulk-upload.service';

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
}
