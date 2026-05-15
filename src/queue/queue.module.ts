import { Module, Global, Logger } from '@nestjs/common';
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

const defaultJobOpts = (roc = 100, rof = 500, att = 3, bo?: any) => ({
  removeOnComplete: roc, removeOnFail: rof, attempts: att, ...(bo ? { backoff: bo } : {}),
});

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL');
        const logger = new Logger('QueueModule');

        if (url) {
          logger.log('BullMQ connecting to Upstash Redis');
          return {
            connection: {
              url,
              tls: { rejectUnauthorized: false },
              maxRetriesPerRequest: null,
              enableReadyCheck: false,
              connectTimeout: 10000,
            },
          };
        }

        logger.log('BullMQ connecting to localhost Redis');
        return {
          connection: {
            host: config.get<string>('QUEUE_REDIS_HOST', config.get<string>('REDIS_HOST', 'localhost')),
            port: config.get<number>('QUEUE_REDIS_PORT', config.get<number>('REDIS_PORT', 6379)),
            password: config.get<string>('REDIS_PASSWORD', undefined),
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_WHATSAPP_OUTBOUND, defaultJobOptions: defaultJobOpts(1000, 5000, 3, { type: 'exponential', delay: 2000 }) },
      { name: QUEUE_BROADCAST, defaultJobOptions: defaultJobOpts(100, 1000) },
      { name: QUEUE_RESERVATION_CLEANUP, defaultJobOptions: defaultJobOpts(100, 500, 2) },
      { name: QUEUE_MEDIA_PROCESSING, defaultJobOptions: defaultJobOpts() },
      { name: QUEUE_PAYMENT_EXPIRY, defaultJobOptions: defaultJobOpts(100, 500, 2) },
      { name: QUEUE_WORKFLOW_RESUME, defaultJobOptions: defaultJobOpts(1000, 5000, 3, { type: 'exponential', delay: 2000 }) },
      { name: QUEUE_ONBOARDING, defaultJobOptions: defaultJobOpts(100, 500, 3, { type: 'exponential', delay: 3000 }) },
      { name: QUEUE_CONVERSATION_ACCOUNTING, defaultJobOptions: defaultJobOpts(500, 2000, 2) },
      { name: QUEUE_RISK_SCORING, defaultJobOptions: defaultJobOpts(100, 500, 2) },
      { name: QUEUE_BILLING, defaultJobOptions: defaultJobOpts(200, 1000, 3, { type: 'exponential', delay: 5000 }) },
      { name: QUEUE_WEBHOOK_INGEST, defaultJobOptions: defaultJobOpts(1000, 5000, 3, { type: 'exponential', delay: 1000 }) },
      { name: QUEUE_WEBHOOK_DLQ, defaultJobOptions: { removeOnComplete: false, removeOnFail: false, attempts: 1 } },
      { name: QUEUE_TOKEN_HEALTH, defaultJobOptions: defaultJobOpts(100, 500, 2, { type: 'exponential', delay: 300000 }) },
      { name: QUEUE_COMPLIANCE, defaultJobOptions: defaultJobOpts(100, 500, 2, { type: 'exponential', delay: 600000 }) },
      { name: QUEUE_CATALOG_SYNC, defaultJobOptions: defaultJobOpts(500, 2000, 3, { type: 'exponential', delay: 5000 }) },
      { name: QUEUE_CATALOG_WEBHOOK, defaultJobOptions: defaultJobOpts(500, 2000, 3, { type: 'exponential', delay: 2000 }) },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
