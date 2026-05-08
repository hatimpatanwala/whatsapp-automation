import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { MetaToken } from '../../database/entities/public/meta-token.entity';
import { ConversationSession } from '../../database/entities/public/conversation-session.entity';
import { ConversationCost } from '../../database/entities/public/conversation-cost.entity';
import { TemplateRegistry } from '../../database/entities/public/template-registry.entity';
import { QualityScore } from '../../database/entities/public/quality-score.entity';
import { AuditLog } from '../../database/entities/public/audit-log.entity';
import { WabaService } from './waba.service';
import { PhoneNumberService } from './phone-number.service';
import { MetaTokenService } from './meta-token.service';
import { MetaCloudApiClient } from './meta-cloud-api.client';
import { AuditLogService } from './audit-log.service';
import { TokenHealthService } from './token-health.service';
import { WabaController } from './waba.controller';
import { MeteringModule } from './metering/metering.module';
import { TemplateModule } from './template/template.module';
import { PhoneModule } from './phone/phone.module';
import { EmbeddedSignupModule } from './embedded-signup/embedded-signup.module';
import { AllocationModule } from './allocation/allocation.module';
import { AccountingModule } from './accounting/accounting.module';
import { RiskModule } from './risk/risk.module';
import { ComplianceModule } from './compliance/compliance.module';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WabaAccount,
      PhoneNumber,
      MetaToken,
      ConversationSession,
      ConversationCost,
      TemplateRegistry,
      QualityScore,
      AuditLog,
    ]),
    forwardRef(() => OnboardingModule),
    MeteringModule,
    TemplateModule,
    PhoneModule,
    EmbeddedSignupModule,
    AllocationModule,
    AccountingModule,
    RiskModule,
    ComplianceModule,
  ],
  controllers: [WabaController],
  providers: [
    WabaService,
    PhoneNumberService,
    MetaTokenService,
    MetaCloudApiClient,
    AuditLogService,
    TokenHealthService,
  ],
  exports: [
    WabaService,
    PhoneNumberService,
    MetaTokenService,
    MetaCloudApiClient,
    AuditLogService,
    TokenHealthService,
    MeteringModule,
    TemplateModule,
    PhoneModule,
    EmbeddedSignupModule,
    AllocationModule,
    AccountingModule,
    RiskModule,
    ComplianceModule,
  ],
})
export class WabaModule {}
