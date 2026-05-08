import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WabaAccount } from '../../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { MetaToken } from '../../../database/entities/public/meta-token.entity';
import { AuditLog } from '../../../database/entities/public/audit-log.entity';
import { ComplianceMonitorService } from './compliance-monitor.service';
import { MetaTokenService } from '../meta-token.service';
import { AuditLogService } from '../audit-log.service';
import { MeteringModule } from '../metering/metering.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WabaAccount, PhoneNumber, MetaToken, AuditLog]),
    MeteringModule,
  ],
  providers: [
    ComplianceMonitorService,
    MetaTokenService,
    AuditLogService,
  ],
  exports: [ComplianceMonitorService],
})
export class ComplianceModule {}
