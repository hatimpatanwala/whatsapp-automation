import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationSession } from '../../../database/entities/public/conversation-session.entity';
import { ConversationCost } from '../../../database/entities/public/conversation-cost.entity';
import { Subscription } from '../../../database/entities/public/subscription.entity';
import { Tenant } from '../../../database/entities/public/tenant.entity';
import { ConversationMeteringService } from './conversation-metering.service';
import { QuotaEnforcementService } from './quota-enforcement.service';
import { MeteringCronService } from './metering-cron.service';
import { RateLimitService } from './rate-limit.service';
import { ThroughputGovernorService } from './throughput-governor.service';
import { AuditLogService } from '../audit-log.service';
import { AuditLog } from '../../../database/entities/public/audit-log.entity';
import { PhoneNumber } from '../../../database/entities/public/phone-number.entity';
import { BillingModule } from '../../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversationSession,
      ConversationCost,
      Subscription,
      Tenant,
      AuditLog,
      PhoneNumber,
    ]),
    BillingModule,
  ],
  providers: [
    ConversationMeteringService,
    QuotaEnforcementService,
    MeteringCronService,
    RateLimitService,
    ThroughputGovernorService,
    AuditLogService,
  ],
  exports: [
    ConversationMeteringService,
    QuotaEnforcementService,
    RateLimitService,
    ThroughputGovernorService,
  ],
})
export class MeteringModule {}
