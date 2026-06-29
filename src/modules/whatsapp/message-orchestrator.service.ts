import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppApiService } from './whatsapp-api.service';
import { ConversationMeteringService, ConversationCategory } from '../waba/metering/conversation-metering.service';
import { QuotaEnforcementService } from '../waba/metering/quota-enforcement.service';
import { RateLimitService } from '../waba/metering/rate-limit.service';
import { renderTemplateAsText } from './template-catalog';

export interface OrchestatedSendResult {
  success: boolean;
  messageId?: string;
  blocked?: boolean;
  reason?: string;
}

/**
 * Wraps WhatsAppApiService with metering, quota enforcement, and rate limiting.
 * All outbound messages should go through this service instead of directly
 * calling WhatsAppApiService.
 */
@Injectable()
export class MessageOrchestratorService {
  private readonly logger = new Logger(MessageOrchestratorService.name);

  constructor(
    private readonly whatsappApi: WhatsAppApiService,
    private readonly metering: ConversationMeteringService,
    private readonly quota: QuotaEnforcementService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /**
   * Send a text message with full metering pipeline.
   */
  async sendText(
    tenantId: string,
    phoneNumberId: string,
    accessToken: string,
    to: string,
    text: string,
    category: ConversationCategory = 'service',
  ): Promise<OrchestatedSendResult> {
    const preCheck = await this.preSendChecks(tenantId, phoneNumberId, to, category);
    if (!preCheck.allowed) return { success: false, blocked: true, reason: preCheck.reason };

    const result = await this.whatsappApi.sendTextMessage(phoneNumberId, accessToken, to, text);
    return { success: true, messageId: result?.messages?.[0]?.id };
  }

  /**
   * Send a template message with full metering pipeline.
   */
  async sendTemplate(
    tenantId: string,
    phoneNumberId: string,
    accessToken: string,
    to: string,
    templateName: string,
    language: string,
    components?: any[],
    category: ConversationCategory = 'utility',
    forceTemplate = false,
  ): Promise<OrchestatedSendResult> {
    // If the recipient's service window is open, never send a (paid, restricted)
    // template — send the SAME content as a free-form session message. Auth/OTP
    // templates can opt out via forceTemplate.
    if (!forceTemplate) {
      const windowOpen = await this.hasActiveServiceWindow(tenantId, to);
      if (windowOpen) {
        const text = renderTemplateAsText(templateName, [], components);
        if (text) {
          this.logger.debug(`[Template→FreeForm] ${templateName} to ${to} (window open)`);
          return this.sendText(tenantId, phoneNumberId, accessToken, to, text, 'service');
        }
      }
    }

    const preCheck = await this.preSendChecks(tenantId, phoneNumberId, to, category, 'business_initiated');
    if (!preCheck.allowed) return { success: false, blocked: true, reason: preCheck.reason };

    const result = await this.whatsappApi.sendTemplate(phoneNumberId, accessToken, to, templateName, language, components);
    return { success: true, messageId: result?.messages?.[0]?.id };
  }

  /**
   * Send interactive buttons with full metering pipeline.
   */
  async sendButtons(
    tenantId: string,
    phoneNumberId: string,
    accessToken: string,
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    header?: string,
    footer?: string,
    category: ConversationCategory = 'service',
  ): Promise<OrchestatedSendResult> {
    const preCheck = await this.preSendChecks(tenantId, phoneNumberId, to, category);
    if (!preCheck.allowed) return { success: false, blocked: true, reason: preCheck.reason };

    const result = await this.whatsappApi.sendInteractiveButtons(phoneNumberId, accessToken, to, body, buttons, header, footer);
    return { success: true, messageId: result?.messages?.[0]?.id };
  }

  /**
   * Send an interactive CTA-URL button (opens a link, e.g. the storefront cart).
   */
  async sendCtaUrl(
    tenantId: string,
    phoneNumberId: string,
    accessToken: string,
    to: string,
    body: string,
    buttonText: string,
    url: string,
    header?: string,
    footer?: string,
    category: ConversationCategory = 'service',
  ): Promise<OrchestatedSendResult> {
    const preCheck = await this.preSendChecks(tenantId, phoneNumberId, to, category);
    if (!preCheck.allowed) return { success: false, blocked: true, reason: preCheck.reason };

    const result = await this.whatsappApi.sendCtaUrl(phoneNumberId, accessToken, to, body, buttonText, url, header, footer);
    return { success: true, messageId: result?.messages?.[0]?.id };
  }

  /**
   * Send interactive list with full metering pipeline.
   */
  async sendList(
    tenantId: string,
    phoneNumberId: string,
    accessToken: string,
    to: string,
    body: string,
    buttonText: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
    header?: string,
    footer?: string,
    category: ConversationCategory = 'service',
  ): Promise<OrchestatedSendResult> {
    const preCheck = await this.preSendChecks(tenantId, phoneNumberId, to, category);
    if (!preCheck.allowed) return { success: false, blocked: true, reason: preCheck.reason };

    const result = await this.whatsappApi.sendInteractiveList(phoneNumberId, accessToken, to, body, buttonText, sections, header, footer);
    return { success: true, messageId: result?.messages?.[0]?.id };
  }

  /**
   * Send an image with full metering pipeline.
   */
  async sendImage(
    tenantId: string,
    phoneNumberId: string,
    accessToken: string,
    to: string,
    imageUrl: string,
    caption?: string,
    category: ConversationCategory = 'service',
  ): Promise<OrchestatedSendResult> {
    const preCheck = await this.preSendChecks(tenantId, phoneNumberId, to, category);
    if (!preCheck.allowed) return { success: false, blocked: true, reason: preCheck.reason };

    const result = await this.whatsappApi.sendImage(phoneNumberId, accessToken, to, imageUrl, caption);
    return { success: true, messageId: result?.messages?.[0]?.id };
  }

  /**
   * Smart send: sends free-form text if within customer's 24h service window (FREE),
   * otherwise falls back to a template message (PAID utility conversation).
   *
   * This saves cost by avoiding template charges when the customer recently messaged.
   */
  async sendSmartMessage(
    tenantId: string,
    phoneNumberId: string,
    accessToken: string,
    to: string,
    freeFormText: string,
    templateFallback: {
      name: string;
      language: string;
      components?: any[];
    },
  ): Promise<OrchestatedSendResult & { usedTemplate: boolean }> {
    // Check if there's an active service window (customer messaged within 24h)
    const hasServiceWindow = await this.hasActiveServiceWindow(tenantId, to);

    if (hasServiceWindow) {
      // Send free-form text → FREE (within service window)
      this.logger.debug(`[SmartSend] Using free-form text for ${to} (within 24h service window)`);
      const result = await this.sendText(tenantId, phoneNumberId, accessToken, to, freeFormText, 'service');
      return { ...result, usedTemplate: false };
    } else {
      // Send template → PAID (no service window, template required)
      this.logger.debug(`[SmartSend] Using template "${templateFallback.name}" for ${to} (outside 24h window)`);
      const result = await this.sendTemplate(
        tenantId, phoneNumberId, accessToken, to,
        templateFallback.name, templateFallback.language, templateFallback.components, 'utility',
      );
      return { ...result, usedTemplate: true };
    }
  }

  /**
   * Check if a customer has an active service window (messaged within last 24h).
   * If yes, free-form messages can be sent for FREE.
   */
  async hasActiveServiceWindow(tenantId: string, customerPhone: string): Promise<boolean> {
    const session = await this.metering.findActiveServiceSession(tenantId, customerPhone);
    return !!session;
  }

  /**
   * Pre-send checks: quota enforcement, rate limiting, and conversation metering.
   */
  private async preSendChecks(
    tenantId: string,
    phoneNumberId: string,
    to: string,
    category: ConversationCategory,
    origin: 'business_initiated' | 'user_initiated' = 'business_initiated',
  ): Promise<{ allowed: boolean; reason?: string }> {
    // 1. Quota check
    const quotaStatus = await this.quota.canSendMessage(tenantId);
    if (!quotaStatus.allowed) {
      this.logger.warn(`Quota blocked for tenant ${tenantId}: ${quotaStatus.reason}`);
      return { allowed: false, reason: quotaStatus.reason };
    }

    // 2. Rate limit check
    const rateLimitResult = await this.rateLimit.checkRateLimit(tenantId);
    if (!rateLimitResult.allowed) {
      this.logger.warn(`Rate limited for tenant ${tenantId}: window=${rateLimitResult.window}, retry after ${rateLimitResult.retryAfterMs}ms`);
      return { allowed: false, reason: `Rate limited. Retry after ${Math.ceil((rateLimitResult.retryAfterMs || 1000) / 1000)}s` };
    }

    // 3. Meter the conversation (find or create 24h session)
    await this.metering.meterConversation({
      tenantId,
      phoneNumberId,
      customerPhone: to,
      category,
      origin,
    });

    return { allowed: true };
  }
}
