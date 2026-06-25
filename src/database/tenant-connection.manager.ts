import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';

const SCHEMA_NAME_REGEX = /^tenant_[a-z0-9_]{1,50}$/;

@Injectable()
export class TenantConnectionManager {
  private readonly logger = new Logger(TenantConnectionManager.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private validateSchemaName(schema: string): string {
    if (!SCHEMA_NAME_REGEX.test(schema)) {
      this.logger.error(`Rejected invalid schema name: ${schema}`);
      throw new Error(`Invalid schema name: ${schema}`);
    }
    return schema;
  }

  async getQueryRunner(schemaName: string): Promise<QueryRunner> {
    const safe = this.validateSchemaName(schemaName);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(`SET search_path TO "${safe}"`);
    return queryRunner;
  }

  async executeInTenantContext<T>(
    schemaName: string,
    callback: (queryRunner: QueryRunner) => Promise<T>,
  ): Promise<T> {
    const queryRunner = await this.getQueryRunner(schemaName);
    try {
      return await callback(queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Run a query against the shared public schema (platform tables like
   * tenants / waba_accounts). Use this instead of executeInTenantContext('public'),
   * which the tenant-schema validator rejects.
   */
  async executeGlobal<T>(callback: (queryRunner: QueryRunner) => Promise<T>): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(`SET search_path TO public`);
    try {
      return await callback(queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  async executeInTransaction<T>(
    schemaName: string,
    callback: (queryRunner: QueryRunner) => Promise<T>,
  ): Promise<T> {
    const queryRunner = await this.getQueryRunner(schemaName);
    await queryRunner.startTransaction();
    try {
      const result = await callback(queryRunner);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  getDataSource(): DataSource {
    return this.dataSource;
  }
}
