import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  QUEUE_WHATSAPP_OUTBOUND,
  QUEUE_BROADCAST,
  QUEUE_WEBHOOK_INGEST,
  QUEUE_WEBHOOK_DLQ,
  QUEUE_WORKFLOW_RESUME,
} from './queue.module';

export interface QueueHealthReport {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  healthy: boolean;
}

@Injectable()
export class QueueHealthService {
  private readonly logger = new Logger(QueueHealthService.name);

  private readonly queues: Map<string, Queue>;
  private readonly thresholds: Map<string, number> = new Map([
    [QUEUE_WHATSAPP_OUTBOUND, 10000],
    [QUEUE_BROADCAST, 5000],
    [QUEUE_WEBHOOK_INGEST, 5000],
    [QUEUE_WEBHOOK_DLQ, 500],
    [QUEUE_WORKFLOW_RESUME, 1000],
  ]);

  constructor(
    @InjectQueue(QUEUE_WHATSAPP_OUTBOUND) outbound: Queue,
    @InjectQueue(QUEUE_BROADCAST) broadcast: Queue,
    @InjectQueue(QUEUE_WEBHOOK_INGEST) webhookIngest: Queue,
    @InjectQueue(QUEUE_WEBHOOK_DLQ) webhookDlq: Queue,
    @InjectQueue(QUEUE_WORKFLOW_RESUME) workflowResume: Queue,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.queues = new Map([
      [QUEUE_WHATSAPP_OUTBOUND, outbound],
      [QUEUE_BROADCAST, broadcast],
      [QUEUE_WEBHOOK_INGEST, webhookIngest],
      [QUEUE_WEBHOOK_DLQ, webhookDlq],
      [QUEUE_WORKFLOW_RESUME, workflowResume],
    ]);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkQueueHealth(): Promise<void> {
    for (const [name, queue] of this.queues) {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'failed', 'delayed');
        const threshold = this.thresholds.get(name) || 10000;

        if (counts.waiting > threshold) {
          this.logger.error(`Queue ${name} backpressure: ${counts.waiting} waiting (threshold: ${threshold})`);
          this.eventEmitter.emit('queue.backpressure', { queue: name, waiting: counts.waiting, threshold });
        }

        if (counts.failed > 1000) {
          this.logger.error(`Queue ${name} failure spike: ${counts.failed} failed jobs`);
          this.eventEmitter.emit('queue.failure_spike', { queue: name, failed: counts.failed });
        }
      } catch (err: any) {
        this.logger.error(`Queue health check failed for ${name}: ${err.message}`);
      }
    }
  }

  async getHealthReport(): Promise<QueueHealthReport[]> {
    const reports: QueueHealthReport[] = [];
    for (const [name, queue] of this.queues) {
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      const threshold = this.thresholds.get(name) || 10000;
      reports.push({
        name,
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
        healthy: (counts.waiting || 0) < threshold && (counts.failed || 0) < 1000,
      });
    }
    return reports;
  }
}
