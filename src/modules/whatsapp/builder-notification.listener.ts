import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BuilderSubmittedEvent } from '../events/domain-events';
import { SmartNotificationService } from './smart-notification.service';

/**
 * When an admin submits a new order/quote from the Builder, notify the customer.
 * Window-aware via SmartNotificationService: free-form text inside the 24h
 * service window, a UTILITY template ("…is being created", with a tap-to-open
 * button) when the window is closed.
 */
@Injectable()
export class BuilderNotificationListener {
  private readonly logger = new Logger(BuilderNotificationListener.name);

  constructor(private readonly smart: SmartNotificationService) {}

  @OnEvent('builder.submitted')
  async onBuilderSubmitted(e: BuilderSubmittedEvent): Promise<void> {
    if (!e.customerPhone) return;
    const isQuote = e.type === 'quote';
    const word = isQuote ? 'quote' : 'order';
    try {
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
          `has been created. Reply here if you have any questions or to confirm.`,
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
