import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthGuard } from './common/guards/auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { DatabaseModule } from './database/database.module';
import { PlatformConfigModule } from './modules/platform-config/platform-config.module';
import { RedisModule } from './config/redis.module';
import { QueueModule } from './queue/queue.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { OrderModule } from './modules/order/order.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PaymentModule } from './modules/payment/payment.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { CustomerModule } from './modules/customer/customer.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { MediaModule } from './modules/media/media.module';
import { I18nModule } from './modules/i18n/i18n.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { WabaModule } from './modules/waba/waba.module';
import { BillingModule } from './modules/billing/billing.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { SubscriptionPlanModule } from './modules/subscription-plan/subscription-plan.module';
import { QuoteModule } from './modules/quote/quote.module';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { CustomFieldModule } from './modules/custom-field/custom-field.module';
import { BuilderModule } from './modules/builder/builder.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { TenantResolutionMiddleware } from './common/middleware/tenant-resolution.middleware';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    PlatformConfigModule,
    RedisModule,
    QueueModule,
    EventsModule,
    HealthModule,
    AuthModule,
    TenantModule,
    SuperAdminModule,
    WhatsAppModule,
    CatalogModule,
    OrderModule,
    InventoryModule,
    PaymentModule,
    DeliveryModule,
    CustomerModule,
    CampaignModule,
    ConversationModule,
    MediaModule,
    I18nModule,
    WorkflowModule,
    OnboardingModule,
    WabaModule,
    BillingModule,
    CommerceModule,
    SubscriptionPlanModule,
    QuoteModule,
    InvoiceModule,
    CustomFieldModule,
    BuilderModule,
    PromotionsModule,
  ],
  providers: [
    // Global authentication then role enforcement. Routes opt out with @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes('*');
    consumer
      .apply(TenantResolutionMiddleware)
      .exclude('health', 'api/admin/(.*)', 'api/webhook/whatsapp')
      .forRoutes('*');
    consumer
      .apply(RateLimitMiddleware)
      .exclude('health', 'api/webhook/whatsapp')
      .forRoutes('*');
  }
}
