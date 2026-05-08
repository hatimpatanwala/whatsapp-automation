import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { SettingsController } from './settings.controller';
import { DatabaseModule } from '../../database/database.module';
import { Subscription } from '../../database/entities/public/subscription.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { WabaModule } from '../waba/waba.module';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([Subscription, PhoneNumber]),
    forwardRef(() => OnboardingModule),
    forwardRef(() => WabaModule),
  ],
  controllers: [TenantController, SettingsController],
  providers: [TenantService, TenantProvisioningService],
  exports: [TenantService, TenantProvisioningService],
})
export class TenantModule {}
