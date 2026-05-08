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
import { CatalogModule } from '../catalog/catalog.module';
import { CommerceSettingsHelper } from '../whatsapp/helpers/commerce-settings.helper';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([Subscription, PhoneNumber]),
    forwardRef(() => OnboardingModule),
    forwardRef(() => WabaModule),
    CatalogModule,
  ],
  controllers: [TenantController, SettingsController],
  providers: [TenantService, TenantProvisioningService, CommerceSettingsHelper],
  exports: [TenantService, TenantProvisioningService, CommerceSettingsHelper],
})
export class TenantModule {}
