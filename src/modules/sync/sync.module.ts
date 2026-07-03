import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

/**
 * Offline-sync API (Phase 2). TenantConnectionManager comes from the global
 * DatabaseModule; the Tenant repo resolves the single local tenant for desktop nodes.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
