import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { ConversationMeteringService } from '../waba/metering/conversation-metering.service';
import { QuotaEnforcementService } from '../waba/metering/quota-enforcement.service';
import { RateLimitService } from '../waba/metering/rate-limit.service';
import { PhoneNumberService } from '../waba/phone-number.service';
import { MetaTokenService } from '../waba/meta-token.service';
import { ComplianceMonitorService } from '../waba/compliance/compliance-monitor.service';

@Injectable()
export class WebhookProcessorService {
  private readonly logger = new Logger(WebhookProcessorService.name);
  private readonly graphApiVersion: string;

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
    @Optional() private readonly phoneNumberService: PhoneNumberService,
    @Optional() private readonly metaTokenService: MetaTokenService,
    @Optional() private readonly meteringService: ConversationMeteringService,
    @Optional() private readonly quotaService: QuotaEnforcementService,
    @Optional() private readonly rateLimitService: RateLimitService,
    @Optional() private readonly complianceMonitor: ComplianceMonitorService,
    private readonly configService: ConfigService,
  ) {
    this.graphApiVersion = this.configService.get<string>('META_GRAPH_API_VERSION', 'v21.0');
  }

  async processWebhook(payload: any): Promise<void> {
    const entries = payload?.entry;
    if (!entries || !Array.isArray(entries)) return;

    for (const entry of entries) {
      const changes = entry.changes;
      if (!changes) continue;

      for (const change of changes) {
        const field = change.field;
        const value = change.value;

        // Handle non-message webhook events
        if (field === 'phone_number_quality_update') {
          await this.handleQualityUpdate(value);
          continue;
        }
        if (field === 'message_template_status_update') {
          await this.handleTemplateStatusUpdate(value);
          continue;
        }
        if (field === 'account_update') {
          await this.handleAccountUpdate(value);
          continue;
        }
        if (field === 'phone_number_name_update') {
          this.logger.log(`Phone name update: ${JSON.stringify(value)}`);
          continue;
        }
        if (field !== 'messages') continue;

        const phoneNumberId = value?.metadata?.phone_number_id;

        if (!phoneNumberId) continue;

        // Resolve tenant
        const tenant = await this.tenantService.findByPhoneNumberId(phoneNumberId);
        if (!tenant) {
          this.logger.warn(`No tenant found for phone_number_id: ${phoneNumberId}`);
          continue;
        }

        // Look up phone record for status check and token resolution
        if (this.phoneNumberService) {
          try {
            const phoneRecord = await this.phoneNumberService.findByPhoneNumberId(phoneNumberId);
            if (phoneRecord) {
              // Check if phone number is inactive
              if (phoneRecord.status === 'inactive') {
                this.logger.warn(`Phone ${phoneNumberId} is inactive — skipping message processing`);
                if (value.messages?.length) {
                  const customerPhone = value.messages[0].from;
                  await this.sendInactiveAutoReply(tenant, phoneNumberId, customerPhone);
                }
                continue;
              }

              // Resolve access token from encrypted meta_tokens if tenant doesn't have one
              if (!tenant.accessToken && this.metaTokenService && phoneRecord.wabaAccountId) {
                const token = await this.metaTokenService.getActiveToken(phoneRecord.wabaAccountId);
                if (token) {
                  tenant.accessToken = token;
                }
              }
            }
          } catch (err: any) {
            this.logger.error(`Phone lookup/token resolution failed (non-blocking): ${err.message}`);
          }
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

    // ─── METERING: Track conversation session + enforce quotas ────────
    if (this.meteringService && tenant.id) {
      try {
        const meteringResult = await this.meteringService.meterConversation({
          tenantId: tenant.id,
          phoneNumberId: tenant.phoneNumberId,
          customerPhone: from,
          category: 'service', // Inbound messages default to service category
          origin: 'user_initiated',
        });

        if (meteringResult.isNew && meteringResult.softLimitReached) {
          this.logger.warn(`Tenant ${schema} approaching conversation limit`);
        }

        if (meteringResult.quotaExceeded) {
          this.logger.warn(`Tenant ${schema} exceeded conversation quota — message still processed but flagged`);
        }
      } catch (err: any) {
        this.logger.error(`Metering error (non-blocking): ${err.message}`);
        // Metering failures should not block message processing
      }
    }

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

  private async sendInactiveAutoReply(tenant: any, phoneNumberId: string, customerPhone: string): Promise<void> {
    try {
      const accessToken = tenant.accessToken;
      if (!accessToken) return;

      await fetch(`https://graph.facebook.com/${this.graphApiVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: customerPhone,
          type: 'text',
          text: { body: 'This business is temporarily unavailable. Please try again later.' },
        }),
      });
    } catch (err: any) {
      this.logger.error(`Failed to send inactive auto-reply: ${err.message}`);
    }
  }

  private async processStatusUpdate(schema: string, status: any): Promise<void> {
    const { id: waMessageId, status: messageStatus, recipient_id } = status;

    await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      await qr.query(
        `UPDATE messages SET status = $1 WHERE wa_message_id = $2`,
        [messageStatus, waMessageId],
      );
    });

    // Feed delivery metrics to health monitor
    this.eventBus.emit({
      type: 'message.status_update',
      schema,
      messageStatus,
      waMessageId,
      recipientId: recipient_id,
    } as any);
  }

  // ─── Non-message webhook event handlers ──────────────────────────────────

  /**
   * phone_number_quality_update: Meta sends quality rating changes (GREEN/YELLOW/RED).
   * Payload: { display_phone_number, event, current_limit, ... }
   */
  private async handleQualityUpdate(value: any): Promise<void> {
    try {
      const phoneNumber = value?.display_phone_number;
      const rating = value?.current_limit; // e.g. GREEN, YELLOW, RED
      this.logger.log(`Quality update for ${phoneNumber}: ${rating}`);

      if (this.phoneNumberService && phoneNumber) {
        const match = await this.phoneNumberService.findByDisplayNumber(phoneNumber);
        if (match) {
          await this.phoneNumberService.updateQualityRating(match.phoneNumberId, rating || value?.event || 'UNKNOWN');
          this.logger.log(`Updated quality rating for ${phoneNumber} to ${rating}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Quality update handler error: ${err.message}`);
    }
  }

  /**
   * message_template_status_update: Template approved/rejected/paused.
   * Payload: { event, message_template_id, message_template_name, message_template_language, reason, ... }
   */
  private async handleTemplateStatusUpdate(value: any): Promise<void> {
    try {
      const templateName = value?.message_template_name;
      const templateId = value?.message_template_id;
      const event = value?.event; // APPROVED, REJECTED, PENDING_DELETION, DISABLED, etc.
      const reason = value?.reason;

      this.logger.log(`Template status update: ${templateName} (${templateId}) → ${event}${reason ? ` reason: ${reason}` : ''}`);

      // Route to compliance monitor for tracking/alerting
      if (this.complianceMonitor && (event === 'REJECTED' || event === 'DISABLED' || event === 'PENDING_DELETION')) {
        await this.complianceMonitor.handleTemplateRestriction(templateId, templateName, event, reason);
      }
    } catch (err: any) {
      this.logger.error(`Template status update handler error: ${err.message}`);
    }
  }

  /**
   * account_update: WABA account status changes (banned, restricted, etc.).
   * Payload: { event, ... }
   */
  private async handleAccountUpdate(value: any): Promise<void> {
    try {
      const event = value?.event;
      const banInfo = value?.ban_info;
      const wabaId = value?.waba_id;
      this.logger.warn(`WABA account update: event=${event}${banInfo ? `, ban_info=${JSON.stringify(banInfo)}` : ''}`);

      // Route to compliance monitor for automated response
      if (this.complianceMonitor && wabaId) {
        await this.complianceMonitor.handleAccountRestriction(wabaId, event, banInfo);
      }
    } catch (err: any) {
      this.logger.error(`Account update handler error: ${err.message}`);
    }
  }
}
