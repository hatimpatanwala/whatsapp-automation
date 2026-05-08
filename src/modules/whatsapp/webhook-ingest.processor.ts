import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WebhookProcessorService } from './webhook-processor.service';
import { QUEUE_WEBHOOK_INGEST, QUEUE_WEBHOOK_DLQ } from '../../queue/queue.module';

/**
 * Async webhook processor.
 * Webhooks are acknowledged immediately (200 OK) and pushed to this queue.
 * This ensures Meta's 20-second timeout is never exceeded.
 */
@Processor(QUEUE_WEBHOOK_INGEST, { concurrency: 20 })
export class WebhookIngestProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookIngestProcessor.name);

  constructor(
    private readonly webhookProcessor: WebhookProcessorService,
    @InjectQueue(QUEUE_WEBHOOK_DLQ)
    private readonly dlqQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { payload, receivedAt } = job.data;
    const lag = Date.now() - receivedAt;

    if (lag > 30000) {
      this.logger.warn(`Webhook processing lag: ${lag}ms for job ${job.id}`);
    }

    try {
      await this.webhookProcessor.processWebhook(payload);
    } catch (err: any) {
      this.logger.error(`Webhook processing failed (attempt ${job.attemptsMade + 1}): ${err.message}`);

      // On final attempt, move to DLQ
      if (job.attemptsMade + 1 >= (job.opts.attempts || 3)) {
        await this.dlqQueue.add('failed-webhook', {
          originalPayload: payload,
          error: err.message,
          failedAt: new Date().toISOString(),
          retryCount: job.attemptsMade + 1,
          jobId: job.id,
        });
        this.logger.warn(`Webhook moved to DLQ after ${job.attemptsMade + 1} attempts: ${job.id}`);
        return; // Don't rethrow — prevent further retries
      }

      throw err; // Rethrow for BullMQ retry
    }
  }
}
