import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PaymentService } from './payment.service';
import { QUEUE_PAYMENT_EXPIRY } from '../../queue/queue.module';

@Processor(QUEUE_PAYMENT_EXPIRY)
export class PaymentExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentExpiryProcessor.name);

  constructor(private readonly paymentService: PaymentService) {
    super();
  }

  async process(job: Job<{ schema: string; paymentId: string; orderId: string }>): Promise<void> {
    const { schema, paymentId, orderId } = job.data;
    this.logger.debug(`Payment expiry check: ${paymentId}`);
    await this.paymentService.handleExpiry(schema, paymentId, orderId);
  }
}
