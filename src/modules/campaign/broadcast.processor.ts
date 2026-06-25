import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { WhatsAppApiService } from '../whatsapp/whatsapp-api.service';
import { MessageOrchestratorService } from '../whatsapp/message-orchestrator.service';
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
    @Optional() private readonly orchestrator: MessageOrchestratorService,
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

    // Resolve the tenant id so the orchestrator can do per-recipient window checks
    // (recipients with an open window get the free-form equivalent, not a template).
    const tenantId = await this.connectionManager.executeGlobal(async (qr) =>
      (await qr.query(`SELECT id FROM tenants WHERE schema_name = $1`, [schema]))[0]?.id);

    const components = template.components
      ? (typeof template.components === 'string' ? JSON.parse(template.components) : template.components)
      : undefined;

    for (const phone of recipients) {
      try {
        if (tenantId && this.orchestrator) {
          await this.orchestrator.sendTemplate(
            tenantId, phoneNumberId, accessToken, phone,
            template.wa_template_name, template.language, components, 'marketing',
          );
        } else {
          await this.whatsappApi.sendTemplate(phoneNumberId, accessToken, phone, template.wa_template_name, template.language, components);
        }
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
