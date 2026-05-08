import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationSession } from '../../../database/entities/public/conversation-session.entity';
import { ConversationCost } from '../../../database/entities/public/conversation-cost.entity';
import { MetaPricing } from '../../../database/entities/public/meta-pricing.entity';
import { TenantUsageMonthly } from '../../../database/entities/public/tenant-usage-monthly.entity';
import { TenantQuotaConfig } from '../../../database/entities/public/tenant-quota-config.entity';
import { Subscription } from '../../../database/entities/public/subscription.entity';
import { ConversationAccountingService } from './conversation-accounting.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversationSession,
      ConversationCost,
      MetaPricing,
      TenantUsageMonthly,
      TenantQuotaConfig,
      Subscription,
    ]),
  ],
  providers: [ConversationAccountingService],
  exports: [ConversationAccountingService],
})
export class AccountingModule {}
