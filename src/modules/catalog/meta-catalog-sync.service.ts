import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.module';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { CommerceSettingsHelper } from '../whatsapp/helpers/commerce-settings.helper';
import { MetaTokenService } from '../waba/meta-token.service';

/**
 * Syncs the platform's product catalog to Meta's Commerce Catalog API.
 *
 * Flow:
 * 1. Tenant enables commerce → provisionCatalog() creates a Meta catalog + links to phone
 * 2. Product created/updated/deleted → syncProduct() / removeProduct() pushes to Meta
 * 3. Hourly cron → fullSync() reconciles all products
 *
 * Meta Graph API endpoints used:
 * - POST /{business-id}/owned_product_catalogs  → create catalog
 * - POST /{catalog-id}/batch                    → batch upsert/delete products
 * - POST /{phone-number-id}/whatsapp_commerce_settings → link catalog to WhatsApp
 */
@Injectable()
export class MetaCatalogSyncService {
  private readonly logger = new Logger(MetaCatalogSyncService.name);
  private readonly apiUrl: string;
  private readonly apiVersion: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly connectionManager: TenantConnectionManager,
    @InjectRepository(WabaAccount)
    private readonly wabaRepo: Repository<WabaAccount>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumberRepo: Repository<PhoneNumber>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly commerceSettings: CommerceSettingsHelper,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly metaTokenService?: MetaTokenService,
  ) {
    this.apiUrl = this.configService.get<string>('WHATSAPP_API_URL', 'https://graph.facebook.com');
    this.apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION', 'v21.0');
  }

  // ─── Provision a new Meta catalog for a tenant ──────────────────────────

  async provisionCatalog(tenantId: string): Promise<string | null> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      this.logger.warn(`Cannot provision catalog: tenant ${tenantId} not found`);
      return null;
    }

    // Find WABA — try tenant's own, then fall back to platform's shared WABA
    let waba: WabaAccount | null = null;
    if (tenant.wabaId) {
      waba = await this.wabaRepo.findOne({ where: { wabaId: tenant.wabaId } });
    }
    if (!waba) {
      waba = await this.wabaRepo.findOne({ where: { status: 'active' }, order: { createdAt: 'ASC' } });
    }
    if (!waba || !waba.businessId) {
      this.logger.warn(`Cannot provision catalog: no WABA with businessId found for tenant ${tenantId}`);
      return null;
    }

    const accessToken = await this.resolveAccessToken(tenant);
    if (!accessToken) {
      this.logger.warn(`Cannot provision catalog: no access token for tenant ${tenantId}`);
      return null;
    }

    try {
      let catalogId: string | null = null;

      // Step 1: Check if WABA already has a connected catalog
      try {
        const existing = await this.metaApiCall(
          `${waba.wabaId}/product_catalogs`,
          'GET',
          accessToken,
        );
        if (existing?.data?.length > 0) {
          catalogId = existing.data[0].id;
          this.logger.log(`Found existing Meta catalog ${catalogId} for WABA ${waba.wabaId}`);
        }
      } catch (err: any) {
        this.logger.debug(`Could not list WABA catalogs: ${err.message}`);
      }

      // Step 2: If no catalog, try to create one (requires catalog_management permission)
      if (!catalogId) {
        try {
          const catalogName = `${tenant.businessName || tenant.name} - WhatsApp Catalog`;
          const createResp = await this.metaApiCall(
            `${waba.businessId}/owned_product_catalogs`,
            'POST',
            accessToken,
            { name: catalogName },
          );
          catalogId = createResp?.id || null;
          if (catalogId) {
            this.logger.log(`Created Meta catalog ${catalogId} for tenant ${tenantId}`);
          }
        } catch (err: any) {
          this.logger.warn(
            `Cannot create Meta catalog (likely missing catalog_management permission): ${err.message}. ` +
            `To fix: go to developers.facebook.com → Your App → Permissions → enable catalog_management, ` +
            `then regenerate the system user token.`,
          );
          return null;
        }
      }

      if (!catalogId) return null;

      // Step 3: Save catalog ID in tenant settings
      await this.saveCommerceSettingValue(tenant.schemaName, 'commerce_catalog_id', catalogId);

      // Step 4: Link catalog to WhatsApp phone number
      await this.linkCatalogToPhone(tenant, catalogId, accessToken);

      // Step 5: Do initial full sync
      await this.fullSync(tenant.schemaName);

      return catalogId;
    } catch (err: any) {
      this.logger.warn(`Catalog provisioning skipped for tenant ${tenantId}: ${err.message} — platform catalog will be used instead`);
      return null;
    }
  }

  // ─── Link catalog to WhatsApp phone number ─────────────────────────────

  private async linkCatalogToPhone(tenant: Tenant, catalogId: string, accessToken: string): Promise<void> {
    // Find the tenant's phone number
    const phone = await this.phoneNumberRepo.findOne({
      where: { tenantId: tenant.id, status: 'active' },
    });

    if (!phone) {
      this.logger.warn(`No active phone found for tenant ${tenant.id} — catalog not linked`);
      return;
    }

    try {
      await this.metaApiCall(
        `${phone.phoneNumberId}/whatsapp_commerce_settings`,
        'POST',
        accessToken,
        {
          is_catalog_visible: true,
          is_cart_enabled: true,
          catalog_id: catalogId,
        },
      );
      this.logger.log(`Linked catalog ${catalogId} to phone ${phone.phoneNumberId}`);
    } catch (err: any) {
      this.logger.error(`Failed to link catalog to phone: ${err.message}`);
    }
  }

  // ─── Sync a single product to Meta catalog ─────────────────────────────

  async syncProduct(schema: string, productId: string): Promise<void> {
    const settings = await this.commerceSettings.getCommerceSettings(schema);
    if (!settings.catalogEnabled || !settings.catalogId) return;

    const product = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `SELECT p.*, COALESCE(i.stock_quantity, 0) - COALESCE(i.reserved_quantity, 0) as available_stock
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id AND i.variant_id IS NULL
         WHERE p.id = $1`,
        [productId],
      );
      return rows[0];
    });

    if (!product) return;

    const accessToken = await this.resolveAccessTokenBySchema(schema);
    if (!accessToken) return;

    const metaProduct = this.mapProductToMeta(product);

    try {
      await this.metaApiCall(
        `${settings.catalogId}/batch`,
        'POST',
        accessToken,
        {
          item_type: 'PRODUCT_ITEM',
          requests: [
            {
              method: 'UPDATE',
              retailer_id: metaProduct.retailer_id,
              data: metaProduct,
            },
          ],
        },
      );
      this.logger.log(`Synced product ${productId} (${product.name}) to Meta catalog ${settings.catalogId}`);
    } catch (err: any) {
      this.logger.error(`Failed to sync product ${productId}: ${err.message}`);
    }
  }

  // ─── Remove a product from Meta catalog ─────────────────────────────────

  async removeProduct(schema: string, productId: string, slug: string): Promise<void> {
    const settings = await this.commerceSettings.getCommerceSettings(schema);
    if (!settings.catalogEnabled || !settings.catalogId) return;

    const accessToken = await this.resolveAccessTokenBySchema(schema);
    if (!accessToken) return;

    try {
      await this.metaApiCall(
        `${settings.catalogId}/batch`,
        'POST',
        accessToken,
        {
          item_type: 'PRODUCT_ITEM',
          requests: [
            {
              method: 'DELETE',
              retailer_id: slug || productId,
            },
          ],
        },
      );
      this.logger.log(`Removed product ${slug || productId} from Meta catalog`);
    } catch (err: any) {
      this.logger.error(`Failed to remove product from Meta catalog: ${err.message}`);
    }
  }

  // ─── Full sync: push all active products to Meta ────────────────────────

  async fullSync(schema: string): Promise<{ synced: number; errors: number }> {
    const settings = await this.commerceSettings.getCommerceSettings(schema);
    if (!settings.catalogEnabled || !settings.catalogId) {
      return { synced: 0, errors: 0 };
    }

    const accessToken = await this.resolveAccessTokenBySchema(schema);
    if (!accessToken) return { synced: 0, errors: 0 };

    const products = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT p.*, COALESCE(i.stock_quantity, 0) - COALESCE(i.reserved_quantity, 0) as available_stock
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id AND i.variant_id IS NULL
         WHERE p.is_active = true`,
      );
    });

    if (!products || products.length === 0) {
      return { synced: 0, errors: 0 };
    }

    // Batch in groups of 20 (Meta batch API limit)
    let synced = 0;
    let errors = 0;
    const batchSize = 20;

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      const requests = batch.map((p: any) => {
        const metaProduct = this.mapProductToMeta(p);
        return {
          method: 'UPDATE' as const,
          retailer_id: metaProduct.retailer_id,
          data: metaProduct,
        };
      });

      try {
        await this.metaApiCall(
          `${settings.catalogId}/batch`,
          'POST',
          accessToken,
          { item_type: 'PRODUCT_ITEM', requests },
        );
        synced += batch.length;
      } catch (err: any) {
        this.logger.error(`Batch sync error for ${schema}: ${err.message}`);
        errors += batch.length;
      }
    }

    this.logger.log(`Full sync for ${schema}: ${synced} synced, ${errors} errors (${products.length} total)`);
    return { synced, errors };
  }

  // ─── Update commerce visibility settings on the phone ──────────────────

  async updateCommerceVisibility(schema: string, catalogVisible: boolean, cartEnabled: boolean): Promise<void> {
    const settings = await this.commerceSettings.getCommerceSettings(schema);
    if (!settings.catalogId) return;

    const tenant = await this.tenantRepo.findOne({ where: { schemaName: schema } });
    if (!tenant) return;

    const accessToken = await this.resolveAccessToken(tenant);
    if (!accessToken) return;

    const phone = await this.phoneNumberRepo.findOne({
      where: { tenantId: tenant.id, status: 'active' },
    });
    if (!phone) return;

    try {
      await this.metaApiCall(
        `${phone.phoneNumberId}/whatsapp_commerce_settings`,
        'POST',
        accessToken,
        {
          is_catalog_visible: catalogVisible,
          is_cart_enabled: cartEnabled,
        },
      );
      this.logger.log(`Updated commerce visibility for ${schema}: catalog=${catalogVisible}, cart=${cartEnabled}`);
    } catch (err: any) {
      this.logger.error(`Failed to update commerce visibility: ${err.message}`);
    }
  }

  // ─── Hourly full sync cron ───────────────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyCatalogSync(): Promise<void> {
    const lock = await this.redis.set('catalog:sync:lock', '1', 'EX', 3600, 'NX');
    if (!lock) return; // Another instance is already running

    try {
      const tenants = await this.tenantRepo.find({ where: { status: 'active' } });

      for (const tenant of tenants) {
        try {
          const settings = await this.commerceSettings.getCommerceSettings(tenant.schemaName);
          if (!settings.catalogEnabled || !settings.catalogId) continue;

          const result = await this.fullSync(tenant.schemaName);
          if (result.synced > 0 || result.errors > 0) {
            this.logger.log(`Hourly sync for ${tenant.schemaName}: ${result.synced} synced, ${result.errors} errors`);
          }
        } catch (err: any) {
          this.logger.error(`Hourly sync failed for ${tenant.schemaName}: ${err.message}`);
        }
      }
    } finally {
      await this.redis.del('catalog:sync:lock');
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private mapProductToMeta(product: any): Record<string, any> {
    const price = parseFloat(product.sale_price || product.base_price);
    const priceCents = Math.round(price * 100); // Meta expects price in cents
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
      url: product.thumbnail || images[0] || '', // Meta requires a URL; use image as fallback
    };
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

  private async resolveAccessToken(tenant: Tenant): Promise<string | null> {
    if (tenant.accessToken) return tenant.accessToken;

    if (!this.metaTokenService) return null;

    // Try tenant's own WABA token first
    if (tenant.wabaId) {
      try {
        const waba = await this.wabaRepo.findOne({ where: { wabaId: tenant.wabaId } });
        if (waba) {
          return await this.metaTokenService.getActiveToken(waba.id);
        }
      } catch (err: any) {
        this.logger.debug(`No token for tenant WABA ${tenant.wabaId}: ${err.message}`);
      }
    }

    // Fallback: use the platform's shared WABA token (for manually-entered numbers)
    try {
      const platformWaba = await this.wabaRepo.findOne({
        where: { status: 'active' },
        order: { createdAt: 'ASC' },
      });
      if (platformWaba) {
        return await this.metaTokenService.getActiveToken(platformWaba.id);
      }
    } catch (err: any) {
      this.logger.debug(`No platform WABA token available: ${err.message}`);
    }

    return null;
  }

  private async resolveAccessTokenBySchema(schema: string): Promise<string | null> {
    const tenant = await this.tenantRepo.findOne({ where: { schemaName: schema } });
    if (!tenant) return null;
    return this.resolveAccessToken(tenant);
  }

  private async saveCommerceSettingValue(schema: string, key: string, value: any): Promise<void> {
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, JSON.stringify(value)],
      );
    });
    await this.commerceSettings.invalidateCache(schema);
  }
}
