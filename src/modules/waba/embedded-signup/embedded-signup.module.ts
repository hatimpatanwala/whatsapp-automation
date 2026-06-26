import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../../database/entities/public/tenant.entity';
import { WabaAccount } from '../../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { MetaToken } from '../../../database/entities/public/meta-token.entity';
import { AuditLog } from '../../../database/entities/public/audit-log.entity';
import { EmbeddedSignupSession } from '../../../database/entities/public/embedded-signup-session.entity';
import { WebhookSubscription } from '../../../database/entities/public/webhook-subscription.entity';
import { CoexistenceSession } from '../../../database/entities/public/coexistence-session.entity';
import { TemplateRegistry } from '../../../database/entities/public/template-registry.entity';
import { EmbeddedSignupService } from './embedded-signup.service';
import { EmbeddedSignupController } from './embedded-signup.controller';
import { SystemTokenService } from './system-token.service';
import { WebhookSubscriptionService } from './webhook-subscription.service';
import { CoexistenceService } from './coexistence.service';
import { CreditLineService } from './credit-line.service';
import { OnboardingRollbackService } from './onboarding-rollback.service';
import { WabaService } from '../waba.service';
import { PhoneNumberService } from '../phone-number.service';
import { MetaTokenService } from '../meta-token.service';
import { MetaCloudApiClient } from '../meta-cloud-api.client';
import { AuditLogService } from '../audit-log.service';
import { TemplateService } from '../template/template.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant, WabaAccount, PhoneNumber, MetaToken, AuditLog,
      EmbeddedSignupSession, WebhookSubscription, CoexistenceSession, TemplateRegistry,
    ]),
  ],
  controllers: [EmbeddedSignupController],
  providers: [
    EmbeddedSignupService,
    SystemTokenService,
    WebhookSubscriptionService,
    CoexistenceService,
    CreditLineService,
    OnboardingRollbackService,
    WabaService,
    PhoneNumberService,
    MetaTokenService,
    MetaCloudApiClient,
    AuditLogService,
    TemplateService,
  ],
  exports: [
    EmbeddedSignupService,
    SystemTokenService,
    WebhookSubscriptionService,
    CoexistenceService,
  ],
})
export class EmbeddedSignupModule {}
