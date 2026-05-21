import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import {
  OrderCreatedEvent,
  OrderStatusChangedEvent,
  PaymentVerifiedEvent,
  PaymentExpiredEvent,
  QuoteCreatedEvent,
  QuoteStatusChangedEvent,
} from '../../events/domain-events';
import { WorkflowTriggerMatcher } from './workflow-trigger.matcher';
import { WorkflowExecutionEngine } from './workflow-execution.engine';
import { ConversationHelper } from '../../whatsapp/helpers/conversation.helper';

@Injectable()
export class WorkflowEventListener {
  private readonly logger = new Logger(WorkflowEventListener.name);

  constructor(
    private readonly triggerMatcher: WorkflowTriggerMatcher,
    private readonly engine: WorkflowExecutionEngine,
    private readonly connectionManager: TenantConnectionManager,
    private readonly conversationHelper: ConversationHelper,
  ) {}

  @OnEvent('order.created')
  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    await this.handleEventTrigger(event.tenantSchema, 'trigger_order', 'created', event.customerId, {
      order_id: event.orderId,
      order_number: event.orderNumber,
      order_total: event.total,
    });
  }

  @OnEvent('order.status_changed')
  async onOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    await this.handleEventTrigger(event.tenantSchema, 'trigger_order', event.newStatus, event.customerId, {
      order_id: event.orderId,
      order_status: event.newStatus,
    });
  }

  @OnEvent('payment.verified')
  async onPaymentVerified(event: PaymentVerifiedEvent): Promise<void> {
    await this.handleEventTrigger(event.tenantSchema, 'trigger_payment', 'verified', event.customerId, {
      payment_id: event.paymentId,
      order_id: event.orderId,
      payment_amount: event.amount,
    });
  }

  @OnEvent('payment.expired')
  async onPaymentExpired(event: PaymentExpiredEvent): Promise<void> {
    await this.handleEventTrigger(event.tenantSchema, 'trigger_payment', 'expired', event.customerId, {
      payment_id: event.paymentId,
      order_id: event.orderId,
    });
  }

  @OnEvent('quote.created')
  async onQuoteCreated(event: QuoteCreatedEvent): Promise<void> {
    await this.handleEventTrigger(event.tenantSchema, 'trigger_quote', 'created', event.customerId, {
      quote_id: event.quoteId,
      quote_number: event.quoteNumber,
      quote_total: event.totalAmount,
    });
  }

  @OnEvent('quote.status_changed')
  async onQuoteStatusChanged(event: QuoteStatusChangedEvent): Promise<void> {
    await this.handleEventTrigger(event.tenantSchema, 'trigger_quote', event.newStatus, event.customerId, {
      quote_id: event.quoteId,
      quote_status: event.newStatus,
    });
  }

  private async handleEventTrigger(
    schema: string,
    triggerType: string,
    eventValue: string,
    customerId: string,
    variables: Record<string, any>,
  ): Promise<void> {
    try {
      const match = await this.triggerMatcher.findMatchingEventWorkflow(schema, triggerType, eventValue);
      if (!match) return;

      // Get customer details
      const customer = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
        const rows = await qr.query(`SELECT * FROM customers WHERE id = $1`, [customerId]);
        return rows[0];
      });
      if (!customer) return;

      // Get/create conversation
      const conversation = await this.conversationHelper.getOrCreateConversation(schema, customerId, customer.phone);

      // Get tenant details
      const tenant = await this.connectionManager.executeInTenantContext('public', async (qr) => {
        const rows = await qr.query(`SELECT * FROM tenants WHERE schema_name = $1`, [schema]);
        return rows[0];
      });
      if (!tenant) return;

      await this.engine.startExecution({
        schema,
        tenant: {
          phoneNumberId: tenant.phone_number_id,
          accessToken: tenant.access_token,
          schemaName: schema,
          ...tenant,
        },
        workflowId: match.workflowId,
        triggerNodeId: match.triggerNodeId,
        conversationId: conversation.id,
        customerPhone: customer.phone,
        customerId: customer.id,
        customerName: customer.name,
        triggerData: { event: eventValue, ...variables },
      });

      this.logger.log(`Event trigger ${triggerType}:${eventValue} started workflow ${match.workflowId} for customer ${customerId}`);
    } catch (err: any) {
      this.logger.error(`Event trigger handler failed: ${err.message}`);
    }
  }
}
