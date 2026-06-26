import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BuilderSubmittedEvent } from '../events/domain-events';
import { SmartNotificationService } from './smart-notification.service';
import { MessageOrchestratorService } from './message-orchestrator.service';
import { WhatsAppApiService } from './whatsapp-api.service';
import { BuilderService } from '../builder/builder.service';

/**
 * When an admin submits a new order/quote from the Builder, notify the customer:
 *  - INSIDE the 24h service window → a CTA URL button ("Check the order/quote")
 *    that opens the read-only webview directly.
 *  - OUTSIDE the window → a UTILITY door-opener template ("…is being created")
 *    whose "Check the order" quick-reply opens the window; tapping it then
 *    delivers the webview link (handled in the text handler).
 */
@Injectable()
export class BuilderNotificationListener {
  private readonly logger = new Logger(BuilderNotificationListener.name);

  constructor(
    private readonly smart: SmartNotificationService,
    private readonly orchestrator: MessageOrchestratorService,
    private readonly whatsappApi: WhatsAppApiService,
    private readonly builder: BuilderService,
  ) {}

  @OnEvent('builder.submitted')
  async onBuilderSubmitted(e: BuilderSubmittedEvent): Promise<void> {
    if (!e.customerPhone) return;
    const isQuote = e.type === 'quote';
    const word = isQuote ? 'quote' : 'order';
    const btn = isQuote ? 'Check the quote' : 'Check the order';

    try {
      const windowOpen = await this.orchestrator.hasActiveServiceWindow(e.tenantId, e.customerPhone);

      if (windowOpen) {
        const creds = await this.smart.getCreds(e.tenantId);
        const view = await this.builder.createViewSession({
          tenantId: e.tenantId,
          schemaName: e.tenantSchema,
          type: e.type,
          resultId: e.resultId,
          resultNumber: e.resultNumber,
          customerId: e.customerId,
          customerPhone: e.customerPhone,
        });
        if (creds) {
          await this.whatsappApi.sendCtaUrl(
            creds.phoneNumberId,
            creds.accessToken,
            e.customerPhone,
            `Hi${e.customerName ? ' ' + e.customerName : ''}, your ${word} *${e.resultNumber}* is ready. Tap below to review it.`,
            btn,
            view.url,
          );
          return;
        }
      }

      // Window closed (or no creds) → door-opener template via smart notify.
      await this.smart.notify({
        tenantId: e.tenantId,
        schema: e.tenantSchema,
        recipientPhone: e.customerPhone,
        audience: 'customer',
        channel: 'utility',
        urgent: true,
        summary: `Your ${word} ${e.resultNumber} is ready`,
        detail:
          `Hi${e.customerName ? ' ' + e.customerName : ''}, your ${word} *${e.resultNumber}* ` +
          `has been created. Reply "${btn}" to review it.`,
        template: {
          name: isQuote ? 'quote_ready_notify' : 'order_created_notify',
          params: [e.customerName || 'there', e.resultNumber],
          language: 'en',
        },
      });
    } catch (err: any) {
      this.logger.warn(`builder.submitted notify failed for ${e.customerPhone}: ${err.message}`);
    }
  }
}
