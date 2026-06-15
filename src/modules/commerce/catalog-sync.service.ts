import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaTokenService } from '../waba/meta-token.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { REDIS_CLIENT } from '../../config/redis.module';
import { QUEUE_CATALOG_SYNC } from '../../queue/queue.module';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { TenantCatalog } from '../../database/entities/public/tenant-catalog.entity';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { EventBusService } from '../events/event-bus.service';
import { CatalogSyncCompletedEvent, ProductSyncFailedEvent } from '../events/domain-events';

/**
 * Handles bidirectional product synchronization between the platform and Meta Commerce.
 *
 * Features:
 * - Idempotent sync via content hashing (skip unchanged products)
 * - Batch processing (Meta limit: 20 items per batch)
 * - Per-product sync status tracking
 * - Queue-based async sync for large catalogs
 * - Retry with exponential backoff
 * - Dead-letter tracking for persistent failures
 */
@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);
  private readonly apiUrl: string;
  private readonly apiVersion: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly connectionManager: TenantConnectionManager,
    @InjectRepository(TenantCatalog)
    private readonly catalogRepo: Repository<TenantCatalog>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(WabaAccount)
    private readonly wabaRepo: Repository<WabaAccount>,
    @InjectQueue(QUEUE_CATALOG_SYNC) private readonly syncQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly eventBus: EventBusService,
    @Optional() private readonly metaTokenService?: MetaTokenService,
  ) {
    this.apiUrl = this.configService.get<string>('WHATSAPP_API_URL', 'https://graph.facebook.com');
    this.apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION', 'v21.0');
  }

  // ─── Queue a sync job ──────────────────────────────────────────────────

  async queueFullSync(tenantId: string, triggeredBy = 'system'): Promise<string> {
    const catalog = await this.catalogRepo.findOne({ where: { tenantId, status: 'active' } });
    if (!catalog) throw new Error('No active catalog for tenant');

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new Error('Tenant not found');

    // Create sync job record
    const jobRecord = await this.catalogRepo.manager.query(
      `INSERT INTO public.catalog_sync_jobs (tenant_id, catalog_id, job_type, status, triggered_by)
       VALUES ($1, $2, 'full_sync', 'pending', $3)
       RETURNING id`,
      [tenantId, catalog.id, triggeredBy],
    );
    const syncJobId = jobRecord[0].id;

    // Queue the async job
    await this.syncQueue.add('catalog-full-sync', {
      syncJobId,
      tenantId,
      catalogId: catalog.id,
      metaCatalogId: catalog.metaCatalogId,
      schema: tenant.schemaName,
    }, {
      jobId: `catalog-sync-${tenantId}-${Date.now()}`,
    });

    return syncJobId;
  }

  async queueProductSync(tenantId: string, productIds: string[], triggeredBy = 'system'): Promise<string> {
    const catalog = await this.catalogRepo.findOne({ where: { tenantId, status: 'active' } });
    if (!catalog) throw new Error('No active catalog for tenant');

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new Error('Tenant not found');

    const jobRecord = await this.catalogRepo.manager.query(
      `INSERT INTO public.catalog_sync_jobs (tenant_id, catalog_id, job_type, status, total_products, triggered_by)
       VALUES ($1, $2, 'partial_sync', 'pending', $3, $4)
       RETURNING id`,
      [tenantId, catalog.id, productIds.length, triggeredBy],
    );
    const syncJobId = jobRecord[0].id;

    await this.syncQueue.add('catalog-product-sync', {
      syncJobId,
      tenantId,
      catalogId: catalog.id,
      metaCatalogId: catalog.metaCatalogId,
      schema: tenant.schemaName,
      productIds,
    });

    return syncJobId;
  }

  // ─── Execute full sync ─────────────────────────────────────────────────

  async executeFullSync(
    syncJobId: string, tenantId: string, metaCatalogId: string, schema: string,
  ): Promise<{ synced: number; failed: number; skipped: number }> {
    // Mark job as running
    await this.updateSyncJob(syncJobId, { status: 'running', started_at: new Date() });

    const accessToken = await this.resolveAccessToken(tenantId);
    if (!accessToken) {
      await this.updateSyncJob(syncJobId, { status: 'failed', error_details: JSON.stringify([{ error: 'No access token' }]) });
      return { synced: 0, failed: 0, skipped: 0 };
    }

    // Load all active products with inventory
    const products = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(`
        SELECT p.*,
               COALESCE(i.stock_quantity, 0) - COALESCE(i.reserved_quantity, 0) as available_stock,
               ps.content_hash as existing_hash,
               ps.sync_status as current_sync_status
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id AND i.variant_id IS NULL
        LEFT JOIN product_sync_status ps ON ps.product_id = p.id
        WHERE p.is_active = true
      `);
    });

    await this.updateSyncJob(syncJobId, { total_products: products.length });

    let synced = 0;
    let failed = 0;
    let skipped = 0;
    const errors: any[] = [];
    const batchSize = 20;

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      const requests: any[] = [];
      const batchProducts: any[] = [];

      for (const p of batch) {
        const metaProduct = this.mapProductToMeta(p);
        const contentHash = this.computeContentHash(metaProduct);

        // Skip if content hasn't changed
        if (p.existing_hash === contentHash && p.current_sync_status === 'synced') {
          skipped++;
          continue;
        }

        requests.push({
          method: 'UPDATE',
          retailer_id: metaProduct.retailer_id,
          data: metaProduct,
        });
        batchProducts.push({ product: p, contentHash, retailerId: metaProduct.retailer_id });
      }

      if (requests.length === 0) continue;

      try {
        await this.metaApiCall(
          `${metaCatalogId}/batch`,
          'POST',
          accessToken,
          { item_type: 'PRODUCT_ITEM', requests },
        );

        // Update sync status for each product in the batch
        for (const { product, contentHash, retailerId } of batchProducts) {
          await this.upsertProductSyncStatus(schema, product.id, retailerId, 'synced', contentHash);
        }
        synced += batchProducts.length;
      } catch (err: any) {
        this.logger.error(`Batch sync error: ${err.message}`);
        for (const { product } of batchProducts) {
          await this.upsertProductSyncStatus(schema, product.id, null, 'failed', null, err.message);
          this.eventBus.emit(new ProductSyncFailedEvent(schema, product.id, err.message, 0));
        }
        failed += batchProducts.length;
        errors.push({ batch: i / batchSize, error: err.message });
      }
    }

    // Update catalog record
    await this.catalogRepo.update(
      { metaCatalogId },
      {
        lastSyncAt: new Date(),
        lastSyncStatus: failed === 0 ? 'success' : 'partial',
        lastSyncError: failed > 0 ? `${failed} products failed to sync` : null,
        productCount: synced + skipped,
      },
    );

    // Update sync job
    await this.updateSyncJob(syncJobId, {
      status: 'completed',
      synced_count: synced,
      failed_count: failed,
      skipped_count: skipped,
      completed_at: new Date(),
      error_details: JSON.stringify(errors),
    });

    this.eventBus.emit(new CatalogSyncCompletedEvent(schema, syncJobId, synced, failed));

    return { synced, failed, skipped };
  }

  // ─── Execute partial sync (specific products) ──────────────────────────

  async executeProductSync(
    syncJobId: string, tenantId: string, metaCatalogId: string, schema: string, productIds: string[],
  ): Promise<{ synced: number; failed: number }> {
    await this.updateSyncJob(syncJobId, { status: 'running', started_at: new Date() });

    const accessToken = await this.resolveAccessToken(tenantId);
    if (!accessToken) {
      await this.updateSyncJob(syncJobId, { status: 'failed' });
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;

    // Load products
    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(',');
    const products = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(`
        SELECT p.*,
               COALESCE(i.stock_quantity, 0) - COALESCE(i.reserved_quantity, 0) as available_stock
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id AND i.variant_id IS NULL
        WHERE p.id IN (${placeholders})
      `, productIds);
    });

    // Batch in groups of 20
    const batchSize = 20;
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      const requests = batch.map((p: any) => {
        const metaProduct = this.mapProductToMeta(p);
        return {
          method: p.is_active ? 'UPDATE' : 'DELETE',
          retailer_id: metaProduct.retailer_id,
          data: p.is_active ? metaProduct : undefined,
        };
      });

      try {
        await this.metaApiCall(
          `${metaCatalogId}/batch`,
          'POST',
          accessToken,
          { item_type: 'PRODUCT_ITEM', requests },
        );
        for (const p of batch) {
          const mp = this.mapProductToMeta(p);
          const hash = this.computeContentHash(mp);
          await this.upsertProductSyncStatus(schema, p.id, mp.retailer_id, 'synced', hash);
        }
        synced += batch.length;
      } catch (err: any) {
        for (const p of batch) {
          await this.upsertProductSyncStatus(schema, p.id, null, 'failed', null, err.message);
        }
        failed += batch.length;
      }
    }

    await this.updateSyncJob(syncJobId, {
      status: 'completed',
      synced_count: synced,
      failed_count: failed,
      completed_at: new Date(),
    });

    return { synced, failed };
  }

  // ─── Remove product from Meta catalog ──────────────────────────────────

  async removeProductFromCatalog(tenantId: string, schema: string, productId: string, slug: string): Promise<void> {
    const catalog = await this.catalogRepo.findOne({ where: { tenantId, status: 'active' } });
    if (!catalog) return;

    const accessToken = await this.resolveAccessToken(tenantId);
    if (!accessToken) return;

    try {
      await this.metaApiCall(
        `${catalog.metaCatalogId}/batch`,
        'POST',
        accessToken,
        {
          item_type: 'PRODUCT_ITEM',
          requests: [{ method: 'DELETE', retailer_id: slug || productId }],
        },
      );
      await this.upsertProductSyncStatus(schema, productId, slug, 'deleted', null);
    } catch (err: any) {
      this.logger.error(`Failed to remove product ${productId} from Meta: ${err.message}`);
    }
  }

  // ─── Get sync job status ───────────────────────────────────────────────

  async getSyncJobStatus(syncJobId: string): Promise<any> {
    const rows = await this.catalogRepo.manager.query(
      `SELECT * FROM public.catalog_sync_jobs WHERE id = $1`,
      [syncJobId],
    );
    return rows[0] || null;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private mapProductToMeta(product: any): Record<string, any> {
    const price = parseFloat(product.sale_price || product.base_price);
    const priceCents = Math.round(price * 100);
    const currency = product.currency || 'INR';
    const available = (product.available_stock ?? 0) > 0;
    const images = product.images || [];

    return {
      retailer_id: product.slug || product.id,
      name: product.name,
      description: product.description || product.name,
      price: `${priceCents}`,
      currency,
      availability: available ? 'in stock' : 'out of stock',
      image_url: product.thumbnail || images[0] || '',
      url: product.thumbnail || images[0] || '',
    };
  }

  private computeContentHash(metaProduct: Record<string, any>): string {
    const str = JSON.stringify(metaProduct);
    return createHash('sha256').update(str).digest('hex');
  }

  private async upsertProductSyncStatus(
    schema: string, productId: string, retailerId: string | null,
    status: string, contentHash: string | null, error?: string,
  ): Promise<void> {
    try {
      await this.connectionManager.executeInTenantContext(schema, async (qr) => {
        await qr.query(`
          INSERT INTO product_sync_status (product_id, meta_retailer_id, sync_status, content_hash, last_synced_at, last_sync_error, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
          ON CONFLICT (product_id) DO UPDATE SET
            meta_retailer_id = COALESCE($2, product_sync_status.meta_retailer_id),
            sync_status = $3,
            content_hash = COALESCE($4, product_sync_status.content_hash),
            last_synced_at = CASE WHEN $3 = 'synced' THEN NOW() ELSE product_sync_status.last_synced_at END,
            last_sync_error = $5,
            retry_count = CASE WHEN $3 = 'failed' THEN product_sync_status.retry_count + 1 ELSE 0 END,
            updated_at = NOW()
        `, [productId, retailerId, status, contentHash, error || null]);
      });
    } catch (err: any) {
      this.logger.debug(`Could not update product sync status: ${err.message}`);
    }
  }

  private async updateSyncJob(syncJobId: string, updates: Record<string, any>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
    values.push(syncJobId);

    await this.catalogRepo.manager.query(
      `UPDATE public.catalog_sync_jobs SET ${fields.join(', ')} WHERE id = $${idx}`,
      values,
    );
  }

  private async resolveAccessToken(tenantId: string): Promise<string | null> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) return null;

    if (tenant.accessToken) return tenant.accessToken;

    // Use the same live system-user token that powers messaging (stored encrypted
    // in meta_tokens) — tenant.accessToken is empty for multi-WABA tenants.
    if (this.metaTokenService) {
      // Prefer the tenant's own WABA, then fall back to the platform's active WABA.
      let waba: WabaAccount | null = null;
      if (tenant.wabaId) waba = await this.wabaRepo.findOne({ where: { wabaId: tenant.wabaId } });
      if (!waba) waba = await this.wabaRepo.findOne({ where: { status: 'active' }, order: { createdAt: 'ASC' } });
      if (waba?.id) {
        const token = await this.metaTokenService.getActiveToken(waba.id).catch(() => '');
        if (token) return token;
      }
    }

    // Last resort: a real (non-placeholder) env token.
    const envToken = this.configService.get<string>('META_SYSTEM_USER_TOKEN', '');
    if (envToken && !/^your_/i.test(envToken)) return envToken;
    return null;
  }

  private async metaApiCall(endpoint: string, method: string, accessToken: string, body?: any): Promise<any> {
    const url = `${this.apiUrl}/${this.apiVersion}/${endpoint}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json() as any;
    if (!response.ok) {
      throw new Error(`Meta API ${method} ${endpoint}: ${data?.error?.message || response.statusText}`);
    }
    return data;
  }
}
