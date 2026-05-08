import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TenantConnectionManager } from './tenant-connection.manager';

/**
 * Data archival and cleanup service.
 * Prevents unbounded table growth by purging old records on a schedule.
 *
 * Retention policies:
 * - webhook_events: 90 days
 * - messages (delivered/read): 365 days
 * - workflow_executions (completed/failed): 90 days
 * - webhook_dlq (replayed): 30 days
 * - token_health_checks: 90 days
 */
@Injectable()
export class DataArchivalService {
  private readonly logger = new Logger(DataArchivalService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async archiveOldData(): Promise<void> {
    this.logger.log('Starting data archival job');
    let totalDeleted = 0;

    // 1. Archive per-tenant data
    try {
      const schemas = await this.dataSource.query(
        `SELECT schema_name FROM public.tenants WHERE schema_name IS NOT NULL`,
      );

      for (const { schema_name: schema } of schemas) {
        try {
          const deleted = await this.archiveTenantData(schema);
          totalDeleted += deleted;
        } catch (err: any) {
          this.logger.error(`Archival failed for schema ${schema}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to get tenant schemas: ${err.message}`);
    }

    // 2. Archive public schema data
    try {
      totalDeleted += await this.archivePublicData();
    } catch (err: any) {
      this.logger.error(`Public data archival failed: ${err.message}`);
    }

    this.logger.log(`Data archival complete: ${totalDeleted} records removed`);
  }

  private async archiveTenantData(schema: string): Promise<number> {
    let deleted = 0;

    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      // Webhook events > 90 days
      const webhookResult = await qr.query(`
        DELETE FROM webhook_events WHERE created_at < NOW() - INTERVAL '90 days'
      `);
      deleted += webhookResult?.[1] || 0;

      // Completed workflow executions > 90 days
      const wfResult = await qr.query(`
        DELETE FROM workflow_executions
        WHERE status IN ('completed', 'failed', 'timed_out')
          AND completed_at < NOW() - INTERVAL '90 days'
      `);
      deleted += wfResult?.[1] || 0;
    });

    return deleted;
  }

  private async archivePublicData(): Promise<number> {
    let deleted = 0;

    // Replayed DLQ entries > 30 days
    const dlqResult = await this.dataSource.query(`
      DELETE FROM public.webhook_dlq
      WHERE replayed = TRUE AND replayed_at < NOW() - INTERVAL '30 days'
    `);
    deleted += dlqResult?.[1] || 0;

    // Old token health checks > 90 days
    const thcResult = await this.dataSource.query(`
      DELETE FROM public.token_health_checks
      WHERE checked_at < NOW() - INTERVAL '90 days'
    `);
    deleted += thcResult?.[1] || 0;

    // Resolved compliance events > 180 days
    const ceResult = await this.dataSource.query(`
      DELETE FROM public.compliance_events
      WHERE resolved = TRUE AND resolved_at < NOW() - INTERVAL '180 days'
    `);
    deleted += ceResult?.[1] || 0;

    return deleted;
  }
}
