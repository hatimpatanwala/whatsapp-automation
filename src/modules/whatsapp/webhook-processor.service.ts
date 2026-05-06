import { Injectable, Logger, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.module';
import { TenantService } from '../tenant/tenant.service';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { EventBusService } from '../events/event-bus.service';
import { WhatsAppMessageReceivedEvent } from '../events/domain-events';
import { TextMessageHandler } from './message-handlers/text-message.handler';
import { InteractiveMessageHandler } from './message-handlers/interactive-message.handler';
import { MediaMessageHandler } from './message-handlers/media-message.handler';
import { ConversationHelper } from './helpers/conversation.helper';
import { WorkflowExecutionEngine } from '../workflow/engine/workflow-execution.engine';
import { WorkflowTriggerMatcher } from '../workflow/engine/workflow-trigger.matcher';
import { ReplyData } from '../workflow/engine/workflow-engine.types';

@Injectable()
export class WebhookProcessorService {
  private readonly logger = new Logger(WebhookProcessorService.name);

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly tenantService: TenantService,
    private readonly connectionManager: TenantConnectionManager,
    private readonly eventBus: EventBusService,
    private readonly textHandler: TextMessageHandler,
    private readonly interactiveHandler: InteractiveMessageHandler,
    private readonly mediaHandler: MediaMessageHandler,
    private readonly conversationHelper: ConversationHelper,
    private readonly workflowEngine: WorkflowExecutionEngine,
    private readonly triggerMatcher: WorkflowTriggerMatcher,
  ) {}

  async processWebhook(payload: any): Promise<void> {
    const entries = payload?.entry;
    if (!entries || !Array.isArray(entries)) return;

    for (const entry of entries) {
      const changes = entry.changes;
      if (!changes) continue;

      for (const change of changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;

        if (!phoneNumberId) continue;

        // Resolve tenant
        const tenant = await this.tenantService.findByPhoneNumberId(phoneNumberId);
        if (!tenant) {
          this.logger.warn(`No tenant found for phone_number_id: ${phoneNumberId}`);
          continue;
        }

        // Process messages
        if (value.messages) {
          for (const message of value.messages) {
            await this.processMessage(tenant.schemaName, tenant, message, value.contacts);
          }
        }

        // Process status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            await this.processStatusUpdate(tenant.schemaName, status);
          }
        }
      }
    }
  }

  private async processMessage(
    schema: string,
    tenant: any,
    message: any,
    contacts: any[],
  ): Promise<void> {
    const messageId = message.id;
    const from = message.from;
    const type = message.type;

    // Idempotency check
    const dedupKey = `webhook:dedup:${schema}:${messageId}`;
    const exists = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!exists) {
      this.logger.debug(`Duplicate webhook message skipped: ${messageId}`);
      return;
    }

    // Store webhook event for audit
    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `INSERT INTO webhook_events (event_id, event_type, payload) VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING`,
        [messageId, `message.${type}`, JSON.stringify(message)],
      );
    });

    // Emit domain event
    this.eventBus.emit(new WhatsAppMessageReceivedEvent(schema, messageId, from, type, message));

    // Get customer name from contacts
    const contactName = contacts?.find((c: any) => c.wa_id === from)?.profile?.name;

    // ─── WORKFLOW ENGINE: Check for active execution first ─────────────
    try {
      const activeExecution = await this.workflowEngine.findActiveExecution(schema, from);
      if (activeExecution) {
        const reply = this.parseReply(message);
        await this.workflowEngine.resumeExecution({
          schema,
          executionId: activeExecution.id,
          reply,
          resumeSource: 'message',
          tenant,
        });
        return; // Workflow handled this message
      }

      // ─── WORKFLOW ENGINE: Check for trigger match ──────────────────────
      const text = message.text?.body || '';
      if (text) {
        const triggerMatch = await this.triggerMatcher.findMatchingWorkflow(schema, text, type);
        if (triggerMatch) {
          // Check subscription limits before starting a new conversation
          const canStart = await this.conversationHelper.canStartConversation(schema);
          if (!canStart.allowed) {
            this.logger.warn(`Subscription limit reached for ${schema}: ${canStart.reason}`);
            // Fall through to hardcoded handlers
          } else {
            const customer = await this.conversationHelper.getOrCreateCustomer(schema, from, contactName);
            const conversation = await this.conversationHelper.getOrCreateConversation(schema, customer.id, from);

            // Log inbound message
            await this.connectionManager.executeInTenantContext(schema, async (qr) => {
              await qr.query(
                `INSERT INTO messages (conversation_id, wa_message_id, direction, type, content, status)
                 VALUES ($1, $2, 'inbound', $3, $4, 'received')`,
                [conversation.id, messageId, type, JSON.stringify(message[type] || message)],
              );
            });

            await this.workflowEngine.startExecution({
              schema,
              tenant,
              workflowId: triggerMatch.workflowId,
              triggerNodeId: triggerMatch.triggerNodeId,
              conversationId: conversation.id,
              customerPhone: from,
              customerId: customer.id,
              customerName: contactName,
              triggerData: { text, messageType: type, raw: message },
            });
            return; // Workflow handled this message
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Workflow engine error: ${err.message}`, err.stack);
      // Fall through to hardcoded handlers on workflow engine failure
    }

    // ─── FALLBACK: Original hardcoded handlers ───────────────────────────
    const context = {
      schema,
      tenant,
      from,
      messageId,
      contactName,
    };

    switch (type) {
      case 'text':
        await this.textHandler.handle(context, message.text.body);
        break;
      case 'interactive':
        await this.interactiveHandler.handle(context, message.interactive);
        break;
      case 'image':
      case 'document':
      case 'video':
      case 'audio':
        await this.mediaHandler.handle(context, message[type], type);
        break;
      case 'location':
        await this.textHandler.handle(context, `📍 Location: ${message.location.latitude},${message.location.longitude}`);
        break;
      default:
        this.logger.warn(`Unhandled message type: ${type}`);
    }
  }

  private parseReply(message: any): ReplyData {
    if (message.type === 'text') {
      return { type: 'text', text: message.text.body };
    }
    if (message.type === 'interactive') {
      if (message.interactive.type === 'button_reply') {
        return {
          type: 'button_reply',
          actionId: message.interactive.button_reply.id,
          actionTitle: message.interactive.button_reply.title,
        };
      }
      if (message.interactive.type === 'list_reply') {
        return {
          type: 'list_reply',
          actionId: message.interactive.list_reply.id,
          actionTitle: message.interactive.list_reply.title,
        };
      }
    }
    if (['image', 'document', 'video', 'audio'].includes(message.type)) {
      return { type: 'media', raw: message[message.type] };
    }
    return { type: 'text', text: '', raw: message };
  }

  private async processStatusUpdate(schema: string, status: any): Promise<void> {
    const { id: waMessageId, status: messageStatus } = status;

    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `UPDATE messages SET status = $1 WHERE wa_message_id = $2`,
        [messageStatus, waMessageId],
      );
    });
  }
}
