import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { QualityScore } from '../../../database/entities/public/quality-score.entity';
import { Tenant } from '../../../database/entities/public/tenant.entity';
import { MetaToken } from '../../../database/entities/public/meta-token.entity';
import { AuditLog } from '../../../database/entities/public/audit-log.entity';
import { PhoneOnboardingService } from './phone-onboarding.service';
import { QualityMonitorService } from './quality-monitor.service';
import { PhoneOnboardingController } from './phone-onboarding.controller';
import { MetaCloudApiClient } from '../meta-cloud-api.client';
import { MetaTokenService } from '../meta-token.service';
import { AuditLogService } from '../audit-log.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PhoneNumber, QualityScore, Tenant, MetaToken, AuditLog]),
  ],
  controllers: [PhoneOnboardingController],
  providers: [
    PhoneOnboardingService,
    QualityMonitorService,
    MetaCloudApiClient,
    MetaTokenService,
    AuditLogService,
  ],
  exports: [PhoneOnboardingService, QualityMonitorService],
})
export class PhoneModule {}
