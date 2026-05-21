import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingEngineService } from './engine/onboarding-engine.service';
import { NumberStateDetectorService } from './engine/number-state-detector.service';
import { MigrationGuideService } from './engine/migration-guide.service';
import { AdminWhatsAppService } from './admin-whatsapp.service';
import { TemplateProvisioningService } from './template-provisioning.service';
import { AdminNotificationService } from './admin-notification.service';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { MetaToken } from '../../database/entities/public/meta-token.entity';
import { OnboardingSession } from '../../database/entities/public/onboarding-session.entity';
import { WabaModule } from '../waba/waba.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, PhoneNumber, WabaAccount, MetaToken, OnboardingSession]),
    forwardRef(() => WabaModule),
    forwardRef(() => WhatsAppModule),
  ],
  controllers: [OnboardingController],
  providers: [
    OnboardingService,
    OnboardingEngineService,
    NumberStateDetectorService,
    MigrationGuideService,
    AdminWhatsAppService,
    TemplateProvisioningService,
    AdminNotificationService,
  ],
  exports: [OnboardingService, OnboardingEngineService, AdminWhatsAppService, TemplateProvisioningService, AdminNotificationService],
})
export class OnboardingModule {}
