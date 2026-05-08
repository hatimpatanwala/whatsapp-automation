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

  async findAll(schema: string, pagination?: { page?: number; limit?: number }): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 50;
      const offset = (page - 1) * limit;

      const countResult = await qr.query(`SELECT COUNT(*) as total FROM campaigns`);
      const total = parseInt(countResult[0].total);

      const campaigns = await qr.query(
        `SELECT * FROM campaigns ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      );

      // Map stats sub-object from individual columns
      const mappedCampaigns = campaigns.map((c: any) => ({
        ...c,
        stats: {
          total_recipients: c.total_recipients || 0,
          sent: c.sent_count || 0,
          delivered: c.delivered_count || 0,
          read: c.read_count || 0,
          replied: c.replied_count || 0,
          failed: c.failed_count || 0,
          opt_outs: c.opt_out_count || 0,
          delivery_rate: c.total_recipients > 0 ? Math.round(((c.delivered_count || 0) / c.total_recipients) * 100) : 0,
          read_rate: (c.delivered_count || 0) > 0 ? Math.round(((c.read_count || 0) / (c.delivered_count || 1)) * 100) : 0,
          reply_rate: (c.delivered_count || 0) > 0 ? Math.round(((c.replied_count || 0) / (c.delivered_count || 1)) * 100) : 0,
        },
      }));

      return {
        data: mappedCampaigns,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
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

  async getStats(schema: string, campaignId: string): Promise<any> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const campaign = await qr.query(`SELECT * FROM campaigns WHERE id = $1`, [campaignId]);
      if (!campaign[0]) return null;
      const c = campaign[0];
      const totalRecipients = c.total_recipients || 0;
      const sent = c.sent_count || 0;
      const delivered = c.delivered_count || 0;
      const read = c.read_count || 0;
      const replied = c.replied_count || 0;
      const failed = c.failed_count || 0;
      const optOuts = c.opt_out_count || 0;
      return {
        total_recipients: totalRecipients,
        sent,
        delivered,
        read,
        replied,
        failed,
        opt_outs: optOuts,
        delivery_rate: totalRecipients > 0 ? Math.round((delivered / totalRecipients) * 100 * 10) / 10 : 0,
        read_rate: delivered > 0 ? Math.round((read / delivered) * 100 * 10) / 10 : 0,
        reply_rate: delivered > 0 ? Math.round((replied / delivered) * 100 * 10) / 10 : 0,
      };
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
