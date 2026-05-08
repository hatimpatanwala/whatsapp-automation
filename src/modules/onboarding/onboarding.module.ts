import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingEngineService } from './engine/onboarding-engine.service';
import { NumberStateDetectorService } from './engine/number-state-detector.service';
import { MigrationGuideService } from './engine/migration-guide.service';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { MetaToken } from '../../database/entities/public/meta-token.entity';
import { OnboardingSession } from '../../database/entities/public/onboarding-session.entity';
import { WabaModule } from '../waba/waba.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, PhoneNumber, WabaAccount, MetaToken, OnboardingSession]),
    forwardRef(() => WabaModule),
  ],
  controllers: [OnboardingController],
  providers: [
    OnboardingService,
    OnboardingEngineService,
    NumberStateDetectorService,
    MigrationGuideService,
  ],
  exports: [OnboardingService, OnboardingEngineService],
})
export class OnboardingModule {}
