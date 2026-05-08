import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { WhatsAppApiService, SendMessagePayload, MetaApiError } from './whatsapp-api.service';
import { QUEUE_WHATSAPP_OUTBOUND } from '../../queue/queue.module';
import { REDIS_CLIENT } from '../../config/redis.module';

@Processor(QUEUE_WHATSAPP_OUTBOUND, {
  limiter: {
    max: 70,
    duration: 1000,
  },
  concurrency: 10,
})
export class WhatsAppOutboundProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsAppOutboundProcessor.name);

  constructor(
    private readonly whatsappApi: WhatsAppApiService,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {
    super();
  }

  async process(job: Job<SendMessagePayload>): Promise<any> {
    const { phoneNumberId, accessToken, to, message } = job.data;

    // Message-level deduplication (prevents duplicate sends on retry)
    const contentHash = createHash('md5')
      .update(JSON.stringify({ to, message }))
      .digest('hex');
    const dedupKey = `outbound:dedup:${to}:${contentHash}`;
    const isNew = await this.redis.set(dedupKey, job.id!, 'EX', 300, 'NX');
    if (!isNew) {
      this.logger.debug(`Dedup: skipping duplicate message to ${to} (job ${job.id})`);
      return { deduplicated: true };
    }

    try {
      const result = await this.whatsappApi.sendDirectMessage(
        phoneNumberId,
        accessToken,
        to,
        message,
      );
      this.logger.debug(`Message sent to ${to}, job ${job.id}`);
      return result;
    } catch (error) {
      // Clear dedup key on failure so retries can proceed
      await this.redis.del(dedupKey);

      // Don't retry non-retryable errors
      if (error instanceof MetaApiError && !error.classification.retryable) {
        this.logger.warn(
          `Non-retryable error for ${to}: ${error.classification.action} — skipping retries`,
        );
        return { failed: true, reason: error.classification.action };
      }

      this.logger.error(`Failed to send message to ${to}: ${(error as Error).message}`);
      throw error;
    }
  }
}
