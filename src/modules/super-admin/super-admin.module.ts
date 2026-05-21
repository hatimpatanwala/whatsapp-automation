import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { SuperAdmin } from '../../database/entities/public/super-admin.entity';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { Subscription } from '../../database/entities/public/subscription.entity';
import { TenantModule } from '../tenant/tenant.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { QuoteModule } from '../quote/quote.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SuperAdmin, Tenant, Subscription]),
    TenantModule,
    OnboardingModule,
    QuoteModule,
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
