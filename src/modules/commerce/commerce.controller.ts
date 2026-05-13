import { Controller, Get, Post, Put, Delete, Param, Body, Query, Req, UseGuards, Logger } from '@nestjs/common';
import { Request } from 'express';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CommerceService } from './commerce.service';
import { CatalogSyncService } from './catalog-sync.service';
import { CollectionService } from './collection.service';
import { ProductMessageService } from './product-message.service';
import {
  ProvisionCatalogDto,
  UpdateCatalogVisibilityDto,
  TriggerSyncDto,
  CreateCollectionDto,
  UpdateCollectionDto,
  SendProductMessageDto,
  SendMultiProductMessageDto,
  CollectionProductsDto,
} from './dto/commerce.dto';

/**
 * Commerce controller for multi-tenant catalog management.
 *
 * Endpoints:
 * - Catalog lifecycle (provision, deprovision, status, visibility)
 * - Product synchronization (trigger sync, check status)
 * - Collections (CRUD, product assignment)
 * - Product messaging (single product, multi-product, catalog messages)
 *
 * All endpoints are tenant-scoped via TenantGuard.
 */
@Controller('commerce')
@UseGuards(TenantGuard)
export class CommerceController {
  private readonly logger = new Logger(CommerceController.name);

  constructor(
    private readonly commerceService: CommerceService,
    private readonly syncService: CatalogSyncService,
    private readonly collectionService: CollectionService,
    private readonly productMessageService: ProductMessageService,
  ) {}

  // ─── Catalog Lifecycle ─────────────────────────────────────────────────

  @Get('catalog/status')
  async getCatalogStatus(@Req() req: Request) {
    return this.commerceService.getCatalogStatus(req.tenantContext.id);
  }

  @Post('catalog/provision')
  @Roles('owner')
  async provisionCatalog(@Req() req: Request, @Body() dto: ProvisionCatalogDto) {
    return this.commerceService.provisionCatalog(req.tenantContext.id, dto.catalogName);
  }

  @Post('catalog/deprovision')
  @Roles('owner')
  async deprovisionCatalog(@Req() req: Request) {
    await this.commerceService.deprovisionCatalog(req.tenantContext.id);
    return { message: 'Catalog deprovisioned successfully' };
  }

  @Post('catalog/visibility')
  @Roles('owner', 'seller')
  async updateVisibility(@Req() req: Request, @Body() dto: UpdateCatalogVisibilityDto) {
    await this.commerceService.updateVisibility(req.tenantContext.id, dto.isCatalogVisible, dto.isCartEnabled);
    return { message: 'Visibility updated' };
  }

  @Get('catalog/history')
  async getAssignmentHistory(@Req() req: Request) {
    return this.commerceService.getAssignmentHistory(req.tenantContext.id);
  }

  // ─── Product Sync ──────────────────────────────────────────────────────

  @Post('sync')
  @Roles('owner', 'seller')
  async triggerSync(@Req() req: Request, @Body() dto: TriggerSyncDto) {
    const tenantId = req.tenantContext.id;

    if (dto.productIds?.length && !dto.forceFullSync) {
      const jobId = await this.syncService.queueProductSync(tenantId, dto.productIds, 'manual');
      return { syncJobId: jobId, type: 'partial_sync', message: 'Sync job queued' };
    }

    const jobId = await this.syncService.queueFullSync(tenantId, 'manual');
    return { syncJobId: jobId, type: 'full_sync', message: 'Full sync job queued' };
  }

  @Get('sync/:jobId')
  async getSyncJobStatus(@Param('jobId') jobId: string) {
    const job = await this.syncService.getSyncJobStatus(jobId);
    if (!job) return { message: 'Sync job not found' };
    return job;
  }

  // ─── Collections ───────────────────────────────────────────────────────

  @Get('collections')
  async getCollections(@Req() req: Request) {
    return this.collectionService.findAll(req.tenantContext.schemaName);
  }

  @Get('collections/:id')
  async getCollection(@Req() req: Request, @Param('id') id: string) {
    return this.collectionService.findById(req.tenantContext.schemaName, id);
  }

  @Post('collections')
  @Roles('owner', 'seller')
  async createCollection(@Req() req: Request, @Body() dto: CreateCollectionDto) {
    return this.collectionService.create(req.tenantContext.schemaName, dto);
  }

  @Put('collections/:id')
  @Roles('owner', 'seller')
  async updateCollection(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.collectionService.update(req.tenantContext.schemaName, id, dto);
  }

  @Delete('collections/:id')
  @Roles('owner', 'seller')
  async deleteCollection(@Req() req: Request, @Param('id') id: string) {
    await this.collectionService.delete(req.tenantContext.schemaName, id);
    return { message: 'Collection deleted' };
  }

  @Post('collections/:id/products')
  @Roles('owner', 'seller')
  async addCollectionProducts(@Req() req: Request, @Param('id') id: string, @Body() dto: CollectionProductsDto) {
    await this.collectionService.addProducts(req.tenantContext.schemaName, id, dto.productIds);
    return { message: 'Products added to collection' };
  }

  @Delete('collections/:id/products')
  @Roles('owner', 'seller')
  async removeCollectionProducts(@Req() req: Request, @Param('id') id: string, @Body() dto: CollectionProductsDto) {
    await this.collectionService.removeProducts(req.tenantContext.schemaName, id, dto.productIds);
    return { message: 'Products removed from collection' };
  }

  // ─── Product Messaging ─────────────────────────────────────────────────

  @Post('messages/product')
  @Roles('owner', 'seller')
  async sendProductMessage(@Req() req: Request, @Body() dto: SendProductMessageDto) {
    return this.productMessageService.sendProductMessage(
      req.tenantContext.id, req.tenantContext.schemaName,
      dto.to, dto.productId, dto.bodyText, dto.footerText,
    );
  }

  @Post('messages/multi-product')
  @Roles('owner', 'seller')
  async sendMultiProductMessage(@Req() req: Request, @Body() dto: SendMultiProductMessageDto) {
    return this.productMessageService.sendMultiProductMessage(
      req.tenantContext.id, req.tenantContext.schemaName,
      dto.to, dto.productIds, dto.headerText, dto.bodyText, dto.footerText,
    );
  }

  @Post('messages/catalog')
  @Roles('owner', 'seller')
  async sendCatalogMessage(@Req() req: Request, @Body() body: { to: string; bodyText?: string; footerText?: string }) {
    return this.productMessageService.sendCatalogMessage(
      req.tenantContext.id, body.to, body.bodyText, body.footerText,
    );
  }
}
