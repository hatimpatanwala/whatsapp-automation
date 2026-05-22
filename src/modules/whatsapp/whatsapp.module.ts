import { Module, forwardRef } from '@nestjs/common';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppApiService } from './whatsapp-api.service';
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
import { TenantModule } from '../tenant/tenant.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { WabaModule } from '../waba/waba.module';

@Module({
  imports: [forwardRef(() => TenantModule), forwardRef(() => WorkflowModule), forwardRef(() => WabaModule)],
  controllers: [WhatsAppWebhookController],
  providers: [
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
  ],
  exports: [WhatsAppApiService, WhatsAppMessageService, ConversationHelper, CommerceSettingsHelper, MessageOrchestratorService],
})
export class WhatsAppModule {}
