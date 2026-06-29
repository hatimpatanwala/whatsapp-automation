import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { SmartNotificationService } from '../../whatsapp/smart-notification.service';
import {
  OrderCreatedEvent,
  OrderStatusChangedEvent,
  PaymentVerifiedEvent,
  PaymentExpiredEvent,
  QuoteCreatedEvent,
  QuoteStatusChangedEvent,
  InvoiceCreatedEvent,
} from '../../events/domain-events';
import { WorkflowTriggerMatcher } from './workflow-trigger.matcher';
import { WorkflowExecutionEngine } from './workflow-execution.engine';
import { ConversationHelper } from '../../whatsapp/helpers/conversation.helper';
import { MetaTokenService } from '../../waba/meta-token.service';

@Injectable()
export class WorkflowEventListener {
  private readonly logger = new Logger(WorkflowEventListener.name);

  constructor(
    private readonly triggerMatcher: WorkflowTriggerMatcher,
    private readonly engine: WorkflowExecutionEngine,
    private readonly connectionManager: TenantConnectionManager,
    private readonly conversationHelper: ConversationHelper,
    @Optional() private readonly smartNotification: SmartNotificationService,
    @Optional() private readonly metaTokenService?: MetaTokenService,
  ) {}

  /**
   * Build a customer-facing message for an order/payment event, with interactive
   * buttons (trigger workflows on tap) and the out-of-window UTILITY template to
   * use (a relevant order/payment status update — not a marketing teaser).
   */
  private buildCustomerEventMessage(
    triggerType: string,
    eventValue: string,
    v: Record<string, any>,
  ): { summary: string; detail: string; buttons: { id: string; title: string }[]; templateName?: string; statusText?: string } | null {
    const cur = v.currency || '₹';
    const on = v.order_number ? ` #${v.order_number}` : '';
    const orderBtns = [{ id: 'track', title: '🚚 Track Order' }, { id: 'menu', title: '🛍️ Menu' }];
    const payBtns = [{ id: 'orders', title: '📦 My Orders' }, { id: 'menu', title: '🛍️ Menu' }];

    if (triggerType === 'trigger_order') {
      const map: Record<string, { detail: string; status: string }> = {
        created: { detail: `🧾 Order${on} received${v.order_total ? ` — total ${cur}${v.order_total}` : ''}. We'll keep you posted!`, status: 'Received' },
        confirmed: { detail: `✅ Order${on} is confirmed and being prepared.`, status: 'Confirmed' },
        processing: { detail: `👨‍🍳 Order${on} is being prepared.`, status: 'Being prepared' },
        ready_for_delivery: { detail: `📦 Order${on} is ready and will be on its way soon.`, status: 'Ready for delivery' },
        out_for_delivery: { detail: `🚚 Order${on} is out for delivery — arriving soon!`, status: 'Out for delivery' },
        delivered: { detail: `🎉 Order${on} has been delivered. We hope you love it!`, status: 'Delivered' },
        cancelled: { detail: `❌ Order${on} has been cancelled. Reply here if you need help.`, status: 'Cancelled' },
      };
      const m = map[eventValue];
      return m ? { summary: `Order${on}: ${m.status}`, detail: m.detail, buttons: orderBtns, templateName: 'order_status_update', statusText: m.status } : null;
    }
    if (triggerType === 'trigger_payment') {
      if (eventValue === 'verified') {
        return { summary: `Payment received${on}`, detail: `✅ Payment${v.payment_amount ? ` of ${cur}${v.payment_amount}` : ''} received${on ? ` for order${on}` : ''}. Thank you!`, buttons: payBtns, templateName: 'payment_update', statusText: 'Payment received' };
      }
      if (eventValue === 'expired') {
        return { summary: `Payment pending${on}`, detail: `⏰ Your payment${on ? ` for order${on}` : ''} is still pending. Reply here to complete it.`, buttons: payBtns, templateName: 'payment_update', statusText: 'Payment pending' };
      }
    }
    return null;
  }

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

  @OnEvent('invoice.created')
  async onInvoiceCreated(event: InvoiceCreatedEvent): Promise<void> {
    await this.handleEventTrigger(event.tenantSchema, 'trigger_invoice', 'created', event.customerId, {
      invoice_id: event.invoiceId,
      invoice_number: event.invoiceNumber,
      invoice_total: event.total,
      doc_type: event.docType,
      order_id: event.orderId,
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

      // Get customer details
      const customer = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
        const rows = await qr.query(`SELECT * FROM customers WHERE id = $1`, [customerId]);
        return rows[0];
      });
      if (!customer) return;

      // No tenant-built workflow for this event → deliver a smart, window-aware,
      // batched notification to the customer (free-form if their window is open,
      // otherwise batched into a teaser template).
      if (!match) {
        if (this.smartNotification) {
          const t = await this.connectionManager.executeGlobal(async (qr) =>
            (await qr.query(`SELECT id FROM tenants WHERE schema_name = $1`, [schema]))[0]);
          const enriched = await this.enrichEventVariables(schema, triggerType, variables);
          const msg = this.buildCustomerEventMessage(triggerType, eventValue, enriched);
          if (t?.id && msg) {
            const template = msg.templateName
              ? { name: msg.templateName, params: [customer.name || 'there', String(enriched.order_number || ''), msg.statusText || ''] }
              : undefined;
            await this.smartNotification.notify({
              tenantId: t.id, schema, recipientPhone: customer.phone,
              audience: 'customer', channel: 'utility', recipientName: customer.name,
              summary: msg.summary, detail: msg.detail, buttons: msg.buttons, template,
            }).catch(() => undefined);
          }
        }
        return;
      }

      // Enrich variables with full order/payment/quote details so message
      // templates can render {{order_number}}, {{order_total}}, {{currency}},
      // {{order_status}} etc. — status-change events only carry the id by default.
      variables = await this.enrichEventVariables(schema, triggerType, variables);

      // Get/create conversation
      const conversation = await this.conversationHelper.getOrCreateConversation(schema, customerId, customer.phone);

      // Get tenant details
      const tenant = await this.connectionManager.executeGlobal(async (qr) => {
        const rows = await qr.query(`SELECT * FROM tenants WHERE schema_name = $1`, [schema]);
        return rows[0];
      });
      if (!tenant) return;

      // Embedded-signup tenants keep their token in meta_tokens, not on the
      // tenants row. The inbound webhook path resolves it the same way — without
      // this, every order/payment/quote notification fails with 190 reauth_required.
      // meta_tokens is keyed by the internal waba_accounts UUID, so resolve that
      // from the tenant's Meta waba_id first.
      let accessToken = tenant.access_token;
      if (!accessToken && this.metaTokenService && tenant.waba_id) {
        try {
          const wabaUuid = await this.connectionManager.executeGlobal(async (qr) => {
            const r = await qr.query(`SELECT id FROM waba_accounts WHERE waba_id = $1 LIMIT 1`, [tenant.waba_id]);
            return r[0]?.id || null;
          });
          if (wabaUuid) {
            accessToken = await this.metaTokenService.getActiveToken(wabaUuid);
          }
        } catch (err: any) {
          this.logger.warn(`Token resolution failed for ${schema}: ${err.message}`);
        }
      }

      await this.engine.startExecution({
        schema,
        tenant: {
          ...tenant,
          phoneNumberId: tenant.phone_number_id,
          accessToken,
          schemaName: schema,
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

  /**
   * Look up the underlying order / payment / quote so workflow messages can use
   * rich placeholders ({{order_number}}, {{order_total}}, {{currency}},
   * {{order_status}}, {{payment_amount}}, {{quote_number}}, …). Best-effort —
   * never throws; returns the original variables if the lookup fails.
   */
  private async enrichEventVariables(
    schema: string,
    triggerType: string,
    variables: Record<string, any>,
  ): Promise<Record<string, any>> {
    try {
      return await this.connectionManager.executeInTenantContext(schema, async (qr) => {
        const out = { ...variables };

        if (triggerType === 'trigger_order' && out.order_id) {
          const o = (await qr.query(
            `SELECT order_number, status, total, currency FROM orders WHERE id = $1`,
            [out.order_id],
          ))[0];
          if (o) {
            out.order_number = o.order_number ?? out.order_number;
            out.order_total = out.order_total ?? o.total;
            out.order_status = out.order_status ?? o.status;
            out.currency = o.currency || '₹';
          }
        } else if (triggerType === 'trigger_payment' && (out.payment_id || out.order_id)) {
          if (out.order_id) {
            const o = (await qr.query(
              `SELECT order_number, total, currency FROM orders WHERE id = $1`,
              [out.order_id],
            ))[0];
            if (o) {
              out.order_number = o.order_number ?? out.order_number;
              out.order_total = out.order_total ?? o.total;
              out.currency = o.currency || '₹';
            }
          }
          if (out.payment_id) {
            const p = (await qr.query(
              `SELECT amount, transaction_ref, method, currency FROM payments WHERE id = $1`,
              [out.payment_id],
            ))[0];
            if (p) {
              out.payment_amount = out.payment_amount ?? p.amount;
              out.transaction_id = p.transaction_ref || '';
              out.transaction_ref = p.transaction_ref || '';
              out.payment_method = p.method || '';
              out.currency = out.currency || p.currency || '₹';
            }
          }
        } else if (triggerType === 'trigger_quote' && out.quote_id) {
          const q = (await qr.query(
            `SELECT quote_number, status, total_amount, currency FROM quotes WHERE id = $1`,
            [out.quote_id],
          ))[0];
          if (q) {
            out.quote_number = q.quote_number ?? out.quote_number;
            out.quote_total = out.quote_total ?? q.total_amount;
            out.quote_status = out.quote_status ?? q.status;
            out.currency = q.currency || '₹';
          }
        } else if (triggerType === 'trigger_invoice' && out.invoice_id) {
          const inv = (await qr.query(
            `SELECT invoice_number, doc_type, total, currency, order_id FROM invoices WHERE id = $1`,
            [out.invoice_id],
          ))[0];
          if (inv) {
            out.invoice_number = inv.invoice_number ?? out.invoice_number;
            out.invoice_total = out.invoice_total ?? inv.total;
            out.doc_type = inv.doc_type ?? out.doc_type;
            out.order_id = inv.order_id ?? out.order_id;
            out.currency = inv.currency || '₹';
          }
        }
        return out;
      });
    } catch (err: any) {
      this.logger.warn(`enrichEventVariables failed: ${err.message}`);
      return variables;
    }
  }
}
