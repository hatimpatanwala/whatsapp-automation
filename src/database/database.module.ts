import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionManager } from './tenant-connection.manager';
import { TenantMigrationService } from './tenant-migration.service';
import { DataArchivalService } from './data-archival.service';
import { Tenant } from './entities/public/tenant.entity';
import { Subscription } from './entities/public/subscription.entity';
import { SuperAdmin } from './entities/public/super-admin.entity';
import { TenantMigrationHistory } from './entities/public/tenant-migration-history.entity';
import { PhoneNumber } from './entities/public/phone-number.entity';
import { WabaAccount } from './entities/public/waba-account.entity';
import { MetaToken } from './entities/public/meta-token.entity';
import { ConversationSession } from './entities/public/conversation-session.entity';
import { ConversationCost } from './entities/public/conversation-cost.entity';
import { TemplateRegistry } from './entities/public/template-registry.entity';
import { QualityScore } from './entities/public/quality-score.entity';
import { AuditLog } from './entities/public/audit-log.entity';
import { OnboardingSession } from './entities/public/onboarding-session.entity';
import { TenantQuotaConfig } from './entities/public/tenant-quota-config.entity';
import { MetaPricing } from './entities/public/meta-pricing.entity';
import { NumberHealth } from './entities/public/number-health.entity';
import { TenantRiskScore } from './entities/public/tenant-risk-score.entity';
import { TenantUsageMonthly } from './entities/public/tenant-usage-monthly.entity';
import { EmbeddedSignupSession } from './entities/public/embedded-signup-session.entity';
import { WebhookSubscription } from './entities/public/webhook-subscription.entity';
import { CoexistenceSession } from './entities/public/coexistence-session.entity';
import { TenantCatalog } from './entities/public/tenant-catalog.entity';
import { SubscriptionPlan } from './entities/public/subscription-plan.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'whatsapp_commerce'),
        entities: [
          Tenant, Subscription, SuperAdmin, TenantMigrationHistory,
          PhoneNumber, WabaAccount, MetaToken,
          ConversationSession, ConversationCost, TemplateRegistry, QualityScore, AuditLog,
          OnboardingSession, TenantQuotaConfig, MetaPricing, NumberHealth, TenantRiskScore, TenantUsageMonthly,
          EmbeddedSignupSession, WebhookSubscription, CoexistenceSession, TenantCatalog,
          SubscriptionPlan,
        ],
        synchronize: configService.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
        logging: configService.get<string>('NODE_ENV') === 'development',
        poolSize: configService.get<number>('DB_POOL_SIZE', 50),
      }),
    }),
    TypeOrmModule.forFeature([Tenant, Subscription, SuperAdmin, TenantMigrationHistory]),
  ],
  providers: [TenantConnectionManager, TenantMigrationService, DataArchivalService],
  exports: [TypeOrmModule, TenantConnectionManager, TenantMigrationService, DataArchivalService],
})
export class DatabaseModule {}
