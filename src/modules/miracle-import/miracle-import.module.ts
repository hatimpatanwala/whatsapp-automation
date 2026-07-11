import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { TenantModule } from '../tenant/tenant.module';
import { MiracleImportService } from './miracle-import.service';
import { MiracleImportController } from './miracle-import.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), TenantModule],
  controllers: [MiracleImportController],
  providers: [MiracleImportService],
})
export class MiracleImportModule {}
