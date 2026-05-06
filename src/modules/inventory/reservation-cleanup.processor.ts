import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { StockReservationService } from './stock-reservation.service';
import { QUEUE_RESERVATION_CLEANUP } from '../../queue/queue.module';

@Processor(QUEUE_RESERVATION_CLEANUP)
export class ReservationCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(ReservationCleanupProcessor.name);

  constructor(private readonly reservationService: StockReservationService) {
    super();
  }

  async process(job: Job<{ schema: string; reservationId: string; inventoryId: string; quantity: number }>): Promise<void> {
    const { schema, reservationId, inventoryId, quantity } = job.data;
    this.logger.debug(`Expiring reservation: ${reservationId}`);
    await this.reservationService.expireReservation(schema, reservationId, inventoryId, quantity);
  }
}
