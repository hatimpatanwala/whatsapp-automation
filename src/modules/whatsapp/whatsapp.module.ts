import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../database/entities/public/tenant.entity';
import { WabaAccount } from '../../database/entities/public/waba-account.entity';
import { PhoneNumber } from '../../database/entities/public/phone-number.entity';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppApiService } from './whatsapp-api.service';
import { AdminCommandService } from './admin-command.service';
import { WhatsAppMessageService } from './whatsapp-message.service';
import { WebhookProcessorService } from './webhook-processor.service';
import { WhatsAppOutboundProcessor } from './whatsapp-outbound.processor';
import { WebhookIngestProcessor } from './webhook-ingest.processor';
import { TextMessageHandler } from './message-handlers/text-message.handler';
import { InteractiveMessageHandler } from './message-handlers/interactive-message.handler';
import { MediaMessageHandler } from './message-handlers/media-message.handler';
import { OrderMessageHandler } from './message-handlers/order-message.handler';
import { ConversationHelper } from './helpers/conversation.helper';
import { CommerceSettingsHelper } from './helpers/commerce-settings.helper';
import { MessageOrchestratorService } from './message-orchestrator.service';
import { SmartNotificationService } from './smart-notification.service';
import { SmartNotificationProcessor } from './smart-notification.processor';
import { InvoiceService } from './invoice.service';
import { TenantModule } from '../tenant/tenant.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { WabaModule } from '../waba/waba.module';
import { BuilderModule } from '../builder/builder.module';
import { CustomFieldModule } from '../custom-field/custom-field.module';
import { BuilderNotificationListener } from './builder-notification.listener';
import { PromotionsModule } from '../promotions/promotions.module';
import { LoyaltyNotificationListener } from './loyalty-notification.listener';

@Module({
  imports: [forwardRef(() => TenantModule), forwardRef(() => WorkflowModule), forwardRef(() => WabaModule), BuilderModule, PromotionsModule, CustomFieldModule, TypeOrmModule.forFeature([Tenant, WabaAccount, PhoneNumber])],
  controllers: [WhatsAppWebhookController],
  providers: [
    BuilderNotificationListener,
    LoyaltyNotificationListener,
    WhatsAppApiService,
    WhatsAppMessageService,
    WebhookProcessorService,
    WhatsAppOutboundProcessor,
    WebhookIngestProcessor,
    TextMessageHandler,
    InteractiveMessageHandler,
    MediaMessageHandler,
    OrderMessageHandler,
    ConversationHelper,
    CommerceSettingsHelper,
    MessageOrchestratorService,
    SmartNotificationService,
    SmartNotificationProcessor,
    InvoiceService,
    AdminCommandService,
  ],
  exports: [WhatsAppApiService, WhatsAppMessageService, ConversationHelper, CommerceSettingsHelper, MessageOrchestratorService, SmartNotificationService, InvoiceService],
})
export class WhatsAppModule {}
