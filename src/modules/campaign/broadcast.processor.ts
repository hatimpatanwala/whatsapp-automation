import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WhatsAppApiService } from '../whatsapp/whatsapp-api.service';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { QUEUE_BROADCAST } from '../../queue/queue.module';

@Processor(QUEUE_BROADCAST, {
  concurrency: 3,
  limiter: {
    max: 50,
    duration: 1000,
  },
})
export class BroadcastProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastProcessor.name);

  constructor(
    private readonly whatsappApi: WhatsAppApiService,
    private readonly connectionManager: TenantConnectionManager,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { schema, campaignId, phoneNumberId, accessToken, template, recipients, batchIndex } = job.data;

    let sentCount = 0;
    let failedCount = 0;

    this.logger.log(
      `Processing broadcast batch${batchIndex != null ? ` #${batchIndex}` : ''} for campaign ${campaignId}: ${recipients.length} recipients`,
    );

    for (const phone of recipients) {
      try {
        await this.whatsappApi.sendTemplate(
          phoneNumberId,
          accessToken,
          phone,
          template.wa_template_name,
          template.language,
          template.components ? JSON.parse(template.components) : undefined,
        );
        sentCount++;
      } catch (error) {
        failedCount++;
        this.logger.error(`Failed to send to ${phone}: ${(error as Error).message}`);
      }
    }

    // Update campaign counters
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `UPDATE campaigns SET sent_count = sent_count + $1, failed_count = failed_count + $2 WHERE id = $3`,
        [sentCount, failedCount, campaignId],
      );
    });

    this.logger.log(
      `Broadcast batch${batchIndex != null ? ` #${batchIndex}` : ''} complete: ${sentCount} sent, ${failedCount} failed`,
    );
  }
}
