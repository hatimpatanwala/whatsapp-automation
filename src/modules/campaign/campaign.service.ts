import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { EventBusService } from '../events/event-bus.service';
import { CampaignStartedEvent } from '../events/domain-events';
import { SegmentService } from './segment.service';
import { QUEUE_BROADCAST } from '../../queue/queue.module';

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly eventBus: EventBusService,
    private readonly segmentService: SegmentService,
    @InjectQueue(QUEUE_BROADCAST)
    private readonly broadcastQueue: Queue,
  ) {}

  async findAll(schema: string): Promise<any[]> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(`SELECT * FROM campaigns ORDER BY created_at DESC`);
    });
  }

  async create(schema: string, data: { name: string; templateId?: string; segmentId?: string; scheduledAt?: string }): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const result = await qr.query(
        `INSERT INTO campaigns (name, template_id, segment_id, scheduled_at) VALUES ($1, $2, $3, $4) RETURNING *`,
        [data.name, data.templateId, data.segmentId, data.scheduledAt],
      );
      return result[0];
    });
  }

  async sendCampaign(schema: string, campaignId: string, tenant: any): Promise<void> {
    await this.connectionManager.executeInTransaction(schema, async (qr) => {
      const campaign = await qr.query(`SELECT * FROM campaigns WHERE id = $1`, [campaignId]);
      if (!campaign[0]) throw new Error('Campaign not found');

      // Get segment customers
      let customers: any[];
      if (campaign[0].segment_id) {
        const segment = await qr.query(`SELECT * FROM campaign_segments WHERE id = $1`, [campaign[0].segment_id]);
        customers = await this.segmentService.getCustomersForSegment(schema, JSON.parse(segment[0].rules));
      } else {
        customers = await qr.query(`SELECT * FROM customers WHERE opted_in = true`);
      }

      // Update campaign status
      await qr.query(
        `UPDATE campaigns SET status = 'sending', started_at = NOW(), total_recipients = $1 WHERE id = $2`,
        [customers.length, campaignId],
      );

      // Get template
      const template = await qr.query(`SELECT * FROM templates WHERE id = $1`, [campaign[0].template_id]);

      // Queue broadcast jobs in batches
      const batchSize = 50;
      for (let i = 0; i < customers.length; i += batchSize) {
        const batch = customers.slice(i, i + batchSize);
        await this.broadcastQueue.add('send-batch', {
          schema,
          campaignId,
          phoneNumberId: tenant.phoneNumberId,
          accessToken: tenant.accessToken,
          template: template[0],
          recipients: batch.map((c: any) => c.phone),
        });
      }

      this.eventBus.emit(new CampaignStartedEvent(schema, campaignId, customers.length));
    });
  }
}
