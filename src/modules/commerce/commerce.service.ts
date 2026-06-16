import { Injectable, Logger, NotFoundException, ConflictException, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaTokenService } from '../waba/meta-token.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.module';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { TenantCatalog } from '../../database/entities/public/tenant-catalog.entity';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { EventBusService } from '../events/event-bus.service';
import {
  CatalogProvisionedEvent,
  CatalogLinkedEvent,
} from '../events/domain-events';

/**
 * Core commerce service for multi-tenant catalog lifecycle management.
 *
 * Architecture: Shared WABA, isolated catalogs per tenant.
 * Each tenant gets a dedicated Meta catalog under the platform's Meta Business,
 * linked to their specific phone number via whatsapp_commerce_settings.
 *
 * Flow:
 * 1. provisionCatalog() → creates Meta catalog for tenant under platform Business
 * 2. linkCatalogToPhone() → connects catalog to tenant's WhatsApp phone number
 * 3. Products synced independently via CatalogSyncService
 */
@Injectable()
export class CommerceService {
  private readonly logger = new Logger(CommerceService.name);
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
    @InjectRepository(PhoneNumber)
    private readonly phoneNumberRepo: Repository<PhoneNumber>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly eventBus: EventBusService,
    @Optional() private readonly metaTokenService?: MetaTokenService,
  ) {
    this.apiUrl = this.configService.get<string>('WHATSAPP_API_URL', 'https://graph.facebook.com');
    this.apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION', 'v21.0');
  }

  // ─── Catalog Provisioning ──────────────────────────────────────────────

  async provisionCatalog(tenantId: string, catalogName?: string): Promise<TenantCatalog> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    // Check if tenant already has a catalog
    const existing = await this.catalogRepo.findOne({ where: { tenantId } });
    if (existing && existing.status === 'active') {
      throw new ConflictException('Tenant already has an active catalog');
    }
    if (existing) {
      // A previously deprovisioned catalog row would violate the
      // unique(tenant_id) constraint on insert — remove it before re-provisioning.
      await this.catalogRepo.delete({ id: existing.id });
    }

    // Resolve WABA and business ID
    const { waba, accessToken } = await this.resolveWabaAndToken(tenant);
    if (!waba?.businessId) {
      throw new NotFoundException('No WABA with businessId found. Complete WABA setup first.');
    }

    const name = catalogName || `${tenant.businessName || tenant.name} - WhatsApp Catalog`;

    // Step 1: Try to find an existing WABA catalog, or create a new one
    let metaCatalogId: string | null = null;

    // 1a. Check if WABA already has catalogs we can reuse
    try {
      const existing = await this.metaApiCall(
        `${waba.wabaId}/product_catalogs`,
        'GET',
        accessToken,
      );
      if (existing?.data?.length > 0) {
        // Use the first available catalog (or an unassigned one)
        metaCatalogId = existing.data[0].id;
        this.logger.log(`Found existing WABA catalog ${metaCatalogId} for tenant ${tenantId}`);
      }
    } catch (err: any) {
      this.logger.debug(`Could not list WABA catalogs: ${err.message}`);
    }

    // 1b. Try listing business-owned catalogs
    if (!metaCatalogId) {
      try {
        const bizCatalogs = await this.metaApiCall(
          `${waba.businessId}/owned_product_catalogs`,
          'GET',
          accessToken,
        );
        if (bizCatalogs?.data?.length > 0) {
          metaCatalogId = bizCatalogs.data[0].id;
          this.logger.log(`Found existing business catalog ${metaCatalogId} for tenant ${tenantId}`);
        }
      } catch (err: any) {
        this.logger.debug(`Could not list business catalogs: ${err.message}`);
      }
    }

    // 1c. Create a new catalog if none found
    if (!metaCatalogId) {
      try {
        const resp = await this.metaApiCall(
          `${waba.businessId}/owned_product_catalogs`,
          'POST',
          accessToken,
          { name },
        );
        metaCatalogId = resp.id;
        this.logger.log(`Created new Meta catalog ${metaCatalogId} for tenant ${tenantId}`);
      } catch (err: any) {
        this.logger.error(`Failed to create Meta catalog: ${err.message}`);
        throw new Error(
          `Cannot create Meta catalog: ${err.message}. ` +
          `Fix: Go to business.facebook.com > Settings > System Users > your system user > ` +
          `Add Assets > select your App > enable "Full Control". Then regenerate the token ` +
          `with catalog_management permission included.`,
        );
      }
    }

    // Step 2: Find tenant's phone number
    const phone = await this.phoneNumberRepo.findOne({
      where: { tenantId: tenant.id, status: 'active' },
    });

    // Step 3: Save catalog record
    const catalog = this.catalogRepo.create({
      tenantId,
      metaCatalogId,
      metaBusinessId: waba.businessId,
      catalogName: name,
      phoneNumberId: phone?.phoneNumberId || tenant.phoneNumberId,
      wabaId: waba.wabaId,
      status: 'active',
      provisionedBy: 'system',
    });
    const saved = await this.catalogRepo.save(catalog);

    // Step 4: Link to phone number
    if (phone || tenant.phoneNumberId) {
      await this.linkCatalogToPhone(saved, accessToken);
    }

    // Step 5: Update tenant commerce settings
    await this.updateTenantCommerceSettings(tenant.schemaName, metaCatalogId, true);

    // Step 6: Record assignment history
    await this.recordAssignment(tenantId, saved.id, metaCatalogId, phone?.phoneNumberId || tenant.phoneNumberId, 'provisioned');

    this.eventBus.emit(new CatalogProvisionedEvent(
      tenant.schemaName, tenantId, metaCatalogId, phone?.phoneNumberId || tenant.phoneNumberId,
    ));

    return saved;
  }

  // ─── Catalog Linking ───────────────────────────────────────────────────

  async linkCatalogToPhone(catalog: TenantCatalog, accessToken?: string): Promise<void> {
    const phoneNumberId = catalog.phoneNumberId;
    if (!phoneNumberId) {
      this.logger.warn(`No phone number to link for catalog ${catalog.id}`);
      return;
    }

    if (!accessToken) {
      const tenant = await this.tenantRepo.findOne({ where: { id: catalog.tenantId } });
      if (!tenant) return;
      const resolved = await this.resolveWabaAndToken(tenant);
      accessToken = resolved.accessToken;
    }

    try {
      // Connect the catalog to the WhatsApp Business Account. This is REQUIRED for
      // the catalog to appear in WhatsApp — the commerce_settings call below only
      // toggles cart/visibility for the phone number, it does not bind the catalog.
      if (catalog.wabaId) {
        try {
          await this.metaApiCall(
            `${catalog.wabaId}/product_catalogs`,
            'POST',
            accessToken,
            { catalog_id: catalog.metaCatalogId },
          );
          this.logger.log(`Connected catalog ${catalog.metaCatalogId} to WABA ${catalog.wabaId}`);
        } catch (err: any) {
          this.logger.warn(`Could not connect catalog to WABA ${catalog.wabaId}: ${err.message}`);
        }
      }

      await this.metaApiCall(
        `${phoneNumberId}/whatsapp_commerce_settings`,
        'POST',
        accessToken,
        {
          is_catalog_visible: true,
          is_cart_enabled: true,
          catalog_id: catalog.metaCatalogId,
        },
      );

      await this.catalogRepo.update(catalog.id, {
        isLinkedToPhone: true,
        isCatalogVisible: true,
        isCartEnabled: true,
      });

      this.logger.log(`Linked catalog ${catalog.metaCatalogId} to phone ${phoneNumberId}`);

      const tenant = await this.tenantRepo.findOne({ where: { id: catalog.tenantId } });
      if (tenant) {
        this.eventBus.emit(new CatalogLinkedEvent(
          tenant.schemaName, catalog.tenantId, catalog.metaCatalogId, phoneNumberId,
        ));
      }
    } catch (err: any) {
      this.logger.error(`Failed to link catalog to phone: ${err.message}`);
      throw new Error(`Failed to link catalog: ${err.message}`);
    }
  }

  async unlinkCatalogFromPhone(tenantId: string): Promise<void> {
    const catalog = await this.catalogRepo.findOne({ where: { tenantId, status: 'active' } });
    if (!catalog || !catalog.phoneNumberId) return;

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) return;

    const { accessToken } = await this.resolveWabaAndToken(tenant);

    try {
      await this.metaApiCall(
        `${catalog.phoneNumberId}/whatsapp_commerce_settings`,
        'POST',
        accessToken,
        {
          is_catalog_visible: false,
          is_cart_enabled: false,
        },
      );

      await this.catalogRepo.update(catalog.id, {
        isLinkedToPhone: false,
        isCatalogVisible: false,
        isCartEnabled: false,
      });

      await this.recordAssignment(tenantId, catalog.id, catalog.metaCatalogId, catalog.phoneNumberId, 'unlinked');
    } catch (err: any) {
      this.logger.error(`Failed to unlink catalog: ${err.message}`);
    }
  }

  // ─── Catalog Visibility ────────────────────────────────────────────────

  async updateVisibility(tenantId: string, catalogVisible: boolean, cartEnabled: boolean): Promise<void> {
    const catalog = await this.catalogRepo.findOne({ where: { tenantId, status: 'active' } });
    if (!catalog) throw new NotFoundException('No active catalog found for this tenant');
    if (!catalog.phoneNumberId) throw new NotFoundException('Catalog not linked to a phone number');

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const { accessToken } = await this.resolveWabaAndToken(tenant);

    await this.metaApiCall(
      `${catalog.phoneNumberId}/whatsapp_commerce_settings`,
      'POST',
      accessToken,
      {
        is_catalog_visible: catalogVisible,
        is_cart_enabled: cartEnabled,
      },
    );

    await this.catalogRepo.update(catalog.id, {
      isCatalogVisible: catalogVisible,
      isCartEnabled: cartEnabled,
    });

    // Update tenant settings
    await this.connectionManager.executeInTenantContext(tenant.schemaName, async (qr) => {
      await qr.query(
        `UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'commerce_catalog_enabled'`,
        [JSON.stringify(catalogVisible)],
      );
      await qr.query(
        `UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'commerce_cart_enabled'`,
        [JSON.stringify(cartEnabled)],
      );
    });
  }

  // ─── Catalog Status & Diagnostics ──────────────────────────────────────

  async getCatalogStatus(tenantId: string): Promise<any> {
    // Only an ACTIVE catalog counts as provisioned. A deprovisioned row must
    // report as not_provisioned so the UI shows the "Provision" option again.
    const catalog = await this.catalogRepo.findOne({ where: { tenantId, status: 'active' } });
    if (!catalog) {
      return {
        status: 'not_provisioned',
        catalog: null,
        syncJobs: [],
        diagnostics: { message: 'No catalog provisioned. Use the provision endpoint to create one.' },
      };
    }

    // Get recent sync jobs
    const syncJobs = await this.catalogRepo.manager.query(
      `SELECT * FROM public.catalog_sync_jobs
       WHERE catalog_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [catalog.id],
    );

    // Get product sync stats from tenant schema
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    let productSyncStats = null;
    if (tenant) {
      try {
        productSyncStats = await this.connectionManager.executeInTenantContext(tenant.schemaName, async (qr) => {
          const rows = await qr.query(`
            SELECT
              sync_status,
              COUNT(*) as count
            FROM product_sync_status
            GROUP BY sync_status
          `);
          return rows;
        });
      } catch {
        // Table might not exist yet if migration hasn't run
      }
    }

    return {
      status: catalog.status,
      catalog: {
        id: catalog.id,
        metaCatalogId: catalog.metaCatalogId,
        catalogName: catalog.catalogName,
        phoneNumberId: catalog.phoneNumberId,
        isLinkedToPhone: catalog.isLinkedToPhone,
        isCatalogVisible: catalog.isCatalogVisible,
        isCartEnabled: catalog.isCartEnabled,
        productCount: catalog.productCount,
        lastSyncAt: catalog.lastSyncAt,
        lastSyncStatus: catalog.lastSyncStatus,
        lastSyncError: catalog.lastSyncError,
        createdAt: catalog.createdAt,
      },
      syncJobs: syncJobs.map((j: any) => ({
        id: j.id,
        jobType: j.job_type,
        status: j.status,
        totalProducts: j.total_products,
        syncedCount: j.synced_count,
        failedCount: j.failed_count,
        startedAt: j.started_at,
        completedAt: j.completed_at,
        createdAt: j.created_at,
      })),
      productSyncStats,
    };
  }

  async getAssignmentHistory(tenantId: string): Promise<any[]> {
    const rows = await this.catalogRepo.manager.query(
      `SELECT * FROM public.catalog_assignment_history
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [tenantId],
    );
    return rows;
  }

  // ─── Delete / Deprovision ──────────────────────────────────────────────

  async deprovisionCatalog(tenantId: string): Promise<void> {
    const catalog = await this.catalogRepo.findOne({ where: { tenantId, status: 'active' } });
    if (!catalog) throw new NotFoundException('No active catalog found');

    // Unlink from phone first
    await this.unlinkCatalogFromPhone(tenantId);

    // Delete catalog from Meta
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (tenant) {
      const { accessToken } = await this.resolveWabaAndToken(tenant);
      try {
        await this.metaApiCall(catalog.metaCatalogId, 'DELETE', accessToken);
        this.logger.log(`Deleted Meta catalog ${catalog.metaCatalogId}`);
      } catch (err: any) {
        this.logger.warn(`Could not delete Meta catalog ${catalog.metaCatalogId}: ${err.message}`);
      }

      await this.updateTenantCommerceSettings(tenant.schemaName, '', false);
    }

    await this.catalogRepo.update(catalog.id, { status: 'deprovisioned' });
    await this.recordAssignment(tenantId, catalog.id, catalog.metaCatalogId, catalog.phoneNumberId, 'deprovisioned');
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  async getTenantCatalog(tenantId: string): Promise<TenantCatalog | null> {
    return this.catalogRepo.findOne({ where: { tenantId, status: 'active' } });
  }

  private async resolveWabaAndToken(tenant: Tenant): Promise<{ waba: WabaAccount; accessToken: string }> {
    let waba: WabaAccount | null = null;

    if (tenant.wabaId) {
      waba = await this.wabaRepo.findOne({ where: { wabaId: tenant.wabaId } });
    }
    if (!waba) {
      waba = await this.wabaRepo.findOne({ where: { status: 'active' }, order: { createdAt: 'ASC' } });
    }
    if (!waba) {
      throw new NotFoundException('No active WABA found');
    }

    // Token resolution: same source as message send/receive — the live system
    // user token stored (encrypted) in meta_tokens for this WABA. Fall back to
    // the tenant's own token, then the platform env token if neither exists.
    let accessToken = '';
    if (this.metaTokenService && waba.id) {
      accessToken = await this.metaTokenService.getActiveToken(waba.id).catch(() => '');
    }
    if (!accessToken) accessToken = tenant.accessToken || '';
    if (!accessToken) {
      const envToken = this.configService.get<string>('META_SYSTEM_USER_TOKEN', '');
      // Ignore the .env placeholder so we fail with a clear message instead of
      // sending an unparseable token to Meta.
      if (envToken && !/^your_/i.test(envToken)) accessToken = envToken;
    }
    if (!accessToken) {
      throw new NotFoundException(
        'No WhatsApp access token available for this WABA. Ensure the number is connected (the same token used for messaging is reused for the catalog).',
      );
    }

    return { waba, accessToken };
  }

  private async updateTenantCommerceSettings(schema: string, catalogId: string, enabled: boolean): Promise<void> {
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('commerce_catalog_id', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [JSON.stringify(catalogId)],
      );
      await qr.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('commerce_catalog_enabled', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [JSON.stringify(enabled)],
      );
      await qr.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('commerce_catalog_status', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [JSON.stringify(enabled ? 'active' : 'not_provisioned')],
      );
    });
  }

  private async recordAssignment(
    tenantId: string, catalogId: string, metaCatalogId: string,
    phoneNumberId: string, action: string,
  ): Promise<void> {
    await this.catalogRepo.manager.query(
      `INSERT INTO public.catalog_assignment_history (tenant_id, catalog_id, meta_catalog_id, phone_number_id, action)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, catalogId, metaCatalogId, phoneNumberId || '', action],
    );
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
