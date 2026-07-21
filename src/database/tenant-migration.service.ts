import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Tenant } from './entities/public/tenant.entity';
import { TenantMigrationHistory } from './entities/public/tenant-migration-history.entity';
import { tenantMigrations } from './migrations/tenant';

@Injectable()
export class TenantMigrationService implements OnModuleInit {
  private readonly logger = new Logger(TenantMigrationService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.runPendingMigrations();
    } catch (err) {
      this.logger.error(`Failed to run pending migrations on startup: ${(err as Error).message}`);
    }
  }

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantMigrationHistory)
    private readonly migrationHistoryRepository: Repository<TenantMigrationHistory>,
  ) {}

  async createTenantSchema(schemaName: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      this.logger.log(`Schema created: ${schemaName}`);
    } finally {
      await queryRunner.release();
    }
  }

  async runMigrationsForSchema(schemaName: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      for (const migration of tenantMigrations) {
        this.logger.log(`Running migration ${migration.name} on schema ${schemaName}`);
        await migration.up(queryRunner, schemaName);
      }
    } finally {
      await queryRunner.release();
    }
  }

  async runPendingMigrations(batchSize = 10): Promise<void> {
    const tenants = await this.tenantRepository.find({
      where: { status: 'active' },
    });

    const applied = await this.migrationHistoryRepository.find();
    const appliedNames = new Set(applied.map((m) => m.migrationName));
    const pending = tenantMigrations.filter((m) => !appliedNames.has(m.name));

    if (pending.length === 0) {
      this.logger.log('No pending migrations');
      return;
    }

    this.logger.log(`Running ${pending.length} pending migrations on ${tenants.length} tenants`);

    const failedTenants: string[] = [];
    for (let i = 0; i < tenants.length; i += batchSize) {
      const batch = tenants.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (tenant) => {
          const queryRunner = this.dataSource.createQueryRunner();
          await queryRunner.connect();
          try {
            for (const migration of pending) {
              await migration.up(queryRunner, tenant.schemaName);
            }
          } catch (error) {
            failedTenants.push(tenant.slug);
            this.logger.error(
              `Migration failed for tenant ${tenant.slug}: ${(error as Error).message}`,
            );
          } finally {
            await queryRunner.release();
          }
        }),
      );
    }

    // Record applied migrations — but ONLY when every tenant succeeded. Tenant
    // migrations are idempotent by convention (IF NOT EXISTS / additive
    // backfills), so retrying all of them next boot is safe; marking a data
    // backfill (e.g. 091) applied while a tenant silently errored is not.
    if (failedTenants.length) {
      this.logger.warn(
        `Not recording migrations as applied — failed for ${failedTenants.length} tenant(s): ${failedTenants.join(', ')}. They will retry on next startup.`,
      );
      return;
    }
    for (const migration of pending) {
      await this.migrationHistoryRepository.save({
        migrationName: migration.name,
        appliedAt: new Date(),
      });
    }

    this.logger.log('All pending migrations completed');
  }

  async dropTenantSchema(schemaName: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      this.logger.log(`Schema dropped: ${schemaName}`);
    } finally {
      await queryRunner.release();
    }
  }
}
