import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WhatsAppApiService, SendMessagePayload } from './whatsapp-api.service';
import { QUEUE_WHATSAPP_OUTBOUND } from '../../queue/queue.module';

@Processor(QUEUE_WHATSAPP_OUTBOUND, {
  limiter: {
    max: 70,
    duration: 1000,
  },
  concurrency: 10,
})
export class WhatsAppOutboundProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsAppOutboundProcessor.name);

  constructor(private readonly whatsappApi: WhatsAppApiService) {
    super();
  }

  async process(job: Job<SendMessagePayload>): Promise<any> {
    const { phoneNumberId, accessToken, to, message } = job.data;

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
      this.logger.error(`Failed to send message to ${to}: ${(error as Error).message}`);
      throw error;
    }
  }
}
