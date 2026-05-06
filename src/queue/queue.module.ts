import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

export const QUEUE_WHATSAPP_OUTBOUND = 'whatsapp-outbound';
export const QUEUE_BROADCAST = 'broadcast';
export const QUEUE_RESERVATION_CLEANUP = 'reservation-cleanup';
export const QUEUE_MEDIA_PROCESSING = 'media-processing';
export const QUEUE_PAYMENT_EXPIRY = 'payment-expiry';
export const QUEUE_WORKFLOW_RESUME = 'workflow-resume';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('QUEUE_REDIS_HOST', 'localhost'),
          port: configService.get<number>('QUEUE_REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD', undefined),
        },
      }),
    }),
    BullModule.registerQueue(
      {
        name: QUEUE_WHATSAPP_OUTBOUND,
        defaultJobOptions: {
          removeOnComplete: 1000,
          removeOnFail: 5000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      },
      {
        name: QUEUE_BROADCAST,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 1000,
          attempts: 3,
        },
      },
      {
        name: QUEUE_RESERVATION_CLEANUP,
        defaultJobOptions: {
          removeOnComplete: 100,
          attempts: 2,
        },
      },
      {
        name: QUEUE_MEDIA_PROCESSING,
        defaultJobOptions: {
          removeOnComplete: 100,
          attempts: 3,
        },
      },
      {
        name: QUEUE_PAYMENT_EXPIRY,
        defaultJobOptions: {
          removeOnComplete: 100,
          attempts: 2,
        },
      },
      {
        name: QUEUE_WORKFLOW_RESUME,
        defaultJobOptions: {
          removeOnComplete: 1000,
          removeOnFail: 5000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
