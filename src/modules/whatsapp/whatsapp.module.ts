import { Module, forwardRef } from '@nestjs/common';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppApiService } from './whatsapp-api.service';
import { WhatsAppMessageService } from './whatsapp-message.service';
import { WebhookProcessorService } from './webhook-processor.service';
import { WhatsAppOutboundProcessor } from './whatsapp-outbound.processor';
import { TextMessageHandler } from './message-handlers/text-message.handler';
import { InteractiveMessageHandler } from './message-handlers/interactive-message.handler';
import { MediaMessageHandler } from './message-handlers/media-message.handler';
import { ConversationHelper } from './helpers/conversation.helper';
import { TenantModule } from '../tenant/tenant.module';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [TenantModule, forwardRef(() => WorkflowModule)],
  controllers: [WhatsAppWebhookController],
  providers: [
    WhatsAppApiService,
    WhatsAppMessageService,
    WebhookProcessorService,
    WhatsAppOutboundProcessor,
    TextMessageHandler,
    InteractiveMessageHandler,
    MediaMessageHandler,
    ConversationHelper,
  ],
  exports: [WhatsAppApiService, WhatsAppMessageService, ConversationHelper],
})
export class WhatsAppModule {}
