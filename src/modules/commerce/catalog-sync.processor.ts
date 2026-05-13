import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_CATALOG_SYNC } from '../../queue/queue.module';
import { CatalogSyncService } from './catalog-sync.service';

@Processor(QUEUE_CATALOG_SYNC, { concurrency: 3 })
export class CatalogSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CatalogSyncProcessor.name);

  constructor(private readonly syncService: CatalogSyncService) {
    super();
  }

  async process(job: Job): Promise<any> {
    const { syncJobId, tenantId, metaCatalogId, schema, productIds } = job.data;

    this.logger.log(`Processing catalog sync job ${syncJobId} for tenant ${tenantId} (type: ${job.name})`);

    try {
      switch (job.name) {
        case 'catalog-full-sync':
          return await this.syncService.executeFullSync(syncJobId, tenantId, metaCatalogId, schema);

        case 'catalog-product-sync':
          return await this.syncService.executeProductSync(syncJobId, tenantId, metaCatalogId, schema, productIds);

        default:
          this.logger.warn(`Unknown catalog sync job type: ${job.name}`);
          return { synced: 0, failed: 0 };
      }
    } catch (err: any) {
      this.logger.error(`Catalog sync job ${syncJobId} failed: ${err.message}`, err.stack);
      throw err; // Let BullMQ handle retry
    }
  }
}
