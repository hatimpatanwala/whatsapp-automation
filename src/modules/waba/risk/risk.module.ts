import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantRiskScore } from '../../../database/entities/public/tenant-risk-score.entity';
import { NumberHealth } from '../../../database/entities/public/number-health.entity';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { Subscription } from '../../../database/entities/public/subscription.entity';
import { RiskScoringService } from './risk-scoring.service';
import { AllocationModule } from '../allocation/allocation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantRiskScore,
      NumberHealth,
      PhoneNumber,
      Subscription,
    ]),
    AllocationModule,
  ],
  providers: [RiskScoringService],
  exports: [RiskScoringService],
})
export class RiskModule {}
