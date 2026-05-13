import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.module';
import { TenantCatalog } from '../../database/entities/public/tenant-catalog.entity';
import { CatalogSyncService } from './catalog-sync.service';

/**
 * Automated catalog sync cron.
 *
 * Runs hourly and queues full sync jobs for all active tenant catalogs.
 * Uses Redis distributed lock to prevent duplicate runs across instances.
 *
 * This replaces the hourly sync in MetaCatalogSyncService for tenants
 * that have been provisioned with the new commerce module.
 */
@Injectable()
export class CatalogSyncCron {
  private readonly logger = new Logger(CatalogSyncCron.name);

  constructor(
    @InjectRepository(TenantCatalog)
    private readonly catalogRepo: Repository<TenantCatalog>,
    private readonly syncService: CatalogSyncService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyCatalogSync(): Promise<void> {
    const lock = await this.redis.set('commerce:catalog:sync:lock', '1', 'EX', 3500, 'NX');
    if (!lock) return;

    try {
      const catalogs = await this.catalogRepo.find({ where: { status: 'active' } });

      this.logger.log(`Starting hourly catalog sync for ${catalogs.length} active catalogs`);

      for (const catalog of catalogs) {
        try {
          await this.syncService.queueFullSync(catalog.tenantId, 'cron');
        } catch (err: any) {
          this.logger.error(`Failed to queue sync for tenant ${catalog.tenantId}: ${err.message}`);
        }
      }
    } finally {
      await this.redis.del('commerce:catalog:sync:lock');
    }
  }
}
