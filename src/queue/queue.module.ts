import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

export const QUEUE_WHATSAPP_OUTBOUND = 'whatsapp-outbound';
export const QUEUE_BROADCAST = 'broadcast';
export const QUEUE_RESERVATION_CLEANUP = 'reservation-cleanup';
export const QUEUE_MEDIA_PROCESSING = 'media-processing';
export const QUEUE_PAYMENT_EXPIRY = 'payment-expiry';
export const QUEUE_WORKFLOW_RESUME = 'workflow-resume';
export const QUEUE_ONBOARDING = 'onboarding';
export const QUEUE_CONVERSATION_ACCOUNTING = 'conversation-accounting';
export const QUEUE_RISK_SCORING = 'risk-scoring';
export const QUEUE_BILLING = 'billing';
export const QUEUE_WEBHOOK_INGEST = 'webhook-ingest';
export const QUEUE_WEBHOOK_DLQ = 'webhook-dlq';
export const QUEUE_TOKEN_HEALTH = 'token-health';
export const QUEUE_COMPLIANCE = 'compliance';
export const QUEUE_CATALOG_SYNC = 'catalog-sync';
export const QUEUE_CATALOG_WEBHOOK = 'catalog-webhook';

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
      {
        name: QUEUE_ONBOARDING,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: { type: 'exponential', delay: 3000 },
        },
      },
      {
        name: QUEUE_CONVERSATION_ACCOUNTING,
        defaultJobOptions: {
          removeOnComplete: 500,
          removeOnFail: 2000,
          attempts: 2,
        },
      },
      {
        name: QUEUE_RISK_SCORING,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 2,
        },
      },
      {
        name: QUEUE_BILLING,
        defaultJobOptions: {
          removeOnComplete: 200,
          removeOnFail: 1000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      },
      {
        name: QUEUE_WEBHOOK_INGEST,
        defaultJobOptions: {
          removeOnComplete: 1000,
          removeOnFail: 5000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      },
      {
        name: QUEUE_WEBHOOK_DLQ,
        defaultJobOptions: {
          removeOnComplete: false,
          removeOnFail: false,
          attempts: 1,
        },
      },
      {
        name: QUEUE_TOKEN_HEALTH,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 2,
          backoff: { type: 'exponential', delay: 300000 },
        },
      },
      {
        name: QUEUE_COMPLIANCE,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 2,
          backoff: { type: 'exponential', delay: 600000 },
        },
      },
      {
        name: QUEUE_CATALOG_SYNC,
        defaultJobOptions: {
          removeOnComplete: 500,
          removeOnFail: 2000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      },
      {
        name: QUEUE_CATALOG_WEBHOOK,
        defaultJobOptions: {
          removeOnComplete: 500,
          removeOnFail: 2000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
