import { Controller, Get, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../config/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const checks: Record<string, string> = {};

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

    const allHealthy = Object.values(checks).every((v) => v === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
