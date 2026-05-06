import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';

@Injectable()
export class TenantConnectionManager {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getQueryRunner(schemaName: string): Promise<QueryRunner> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(`SET search_path TO '${schemaName}'`);
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
