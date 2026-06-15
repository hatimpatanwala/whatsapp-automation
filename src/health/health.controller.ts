import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../config/redis.module';
import { QUEUE_WHATSAPP_OUTBOUND, QUEUE_WEBHOOK_INGEST } from '../queue/queue.module';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
@Public()
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    @Optional() @InjectQueue(QUEUE_WHATSAPP_OUTBOUND)
    private readonly outboundQueue: Queue,
    @Optional() @InjectQueue(QUEUE_WEBHOOK_INGEST)
    private readonly webhookQueue: Queue,
  ) {}

  @Get()
  async check() {
    const checks: Record<string, string | number> = {};

    // Database check
    try {
      await this.dataSource.query('SELECT 1');
      checks.database = 'healthy';
    } catch {
      checks.database = 'unhealthy';
    }

    // Redis check
    try {
      await this.redis.ping();
      checks.redis = 'healthy';
    } catch {
      checks.redis = 'unhealthy';
    }

    // Queue depth checks
    if (this.outboundQueue) {
      try {
        const waiting = await this.outboundQueue.getWaitingCount();
        checks.outboundQueueDepth = waiting;
        checks.outboundQueue = waiting < 50000 ? 'healthy' : 'backpressure';
      } catch {
        checks.outboundQueue = 'unknown';
      }
    }

    if (this.webhookQueue) {
      try {
        const waiting = await this.webhookQueue.getWaitingCount();
        checks.webhookQueueDepth = waiting;
        checks.webhookQueue = waiting < 5000 ? 'healthy' : 'backpressure';
      } catch {
        checks.webhookQueue = 'unknown';
      }
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    checks.memoryHeapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    checks.memoryRssMB = Math.round(memUsage.rss / 1024 / 1024);
    checks.memory = memUsage.heapUsed < 1024 * 1024 * 1024 ? 'healthy' : 'high'; // > 1GB

    // DB connection pool
    try {
      const poolResult = await this.dataSource.query(
        `SELECT count(*) as total, count(*) FILTER (WHERE state = 'active') as active FROM pg_stat_activity WHERE datname = current_database()`,
      );
      checks.dbConnectionsTotal = parseInt(poolResult[0]?.total || '0');
      checks.dbConnectionsActive = parseInt(poolResult[0]?.active || '0');
    } catch {
      // Non-critical
    }

    // Meta API health (cached — don't call on every health check)
    try {
      const metaHealth = await this.redis.get('health:meta_api');
      checks.metaApi = metaHealth || 'unknown';
    } catch {
      checks.metaApi = 'unknown';
    }

    const coreHealthy = checks.database === 'healthy' && checks.redis === 'healthy';
    const allHealthy = coreHealthy
      && checks.outboundQueue !== 'backpressure'
      && checks.webhookQueue !== 'backpressure'
      && checks.memory !== 'high';

    return {
      status: !coreHealthy ? 'unhealthy' : !allHealthy ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      checks,
    };
  }

  @Get('liveness')
  async liveness() {
    return { status: 'ok' };
  }

  @Get('readiness')
  async readiness() {
    try {
      await this.dataSource.query('SELECT 1');
      await this.redis.ping();
      return { status: 'ready' };
    } catch {
      return { status: 'not_ready' };
    }
  }
}
