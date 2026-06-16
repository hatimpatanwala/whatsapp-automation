import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NOTIFICATION_FLUSH } from '../../queue/queue.module';
import { SmartNotificationService, NotifyChannel } from './smart-notification.service';

interface FlushJob {
  schema: string;
  phone: string;
  channel: NotifyChannel;
}

@Processor(QUEUE_NOTIFICATION_FLUSH)
export class SmartNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(SmartNotificationProcessor.name);

  constructor(private readonly smartNotification: SmartNotificationService) {
    super();
  }

  async process(job: Job<FlushJob>): Promise<void> {
    const { schema, phone, channel } = job.data;
    try {
      await this.smartNotification.flush(schema, phone, channel);
    } catch (err: any) {
      this.logger.error(`Flush failed for ${schema}/${phone}/${channel}: ${err.message}`);
    }
  }
}
