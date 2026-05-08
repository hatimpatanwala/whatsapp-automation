import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WabaAccount } from '../../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { NumberHealth } from '../../../database/entities/public/number-health.entity';
import { TenantRiskScore } from '../../../database/entities/public/tenant-risk-score.entity';
import { TenantQuotaConfig } from '../../../database/entities/public/tenant-quota-config.entity';
import { WabaAllocationService } from './waba-allocation.service';
import { WabaHealthMonitorService } from './waba-health-monitor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WabaAccount,
      PhoneNumber,
      NumberHealth,
      TenantRiskScore,
      TenantQuotaConfig,
    ]),
  ],
  providers: [WabaAllocationService, WabaHealthMonitorService],
  exports: [WabaAllocationService, WabaHealthMonitorService],
})
export class AllocationModule {}
