import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { WhatsAppApiService } from '../../../whatsapp/whatsapp-api.service';
import { BuilderService } from '../../../builder/builder.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

/**
 * Shows a payment receipt / details for the customer's payment. Reads from
 * ctx.variables.payment_id (set by payment events) or falls back to the latest
 * payment for ctx.variables.order_id. Used as the response to a "View Receipt"
 * button on payment notifications: sends the receipt summary AND a CTA URL that
 * opens the related order webview. Continues to the next node (or ends).
 */
@Injectable()
export class PaymentReceiptNodeHandler implements NodeHandler {
  readonly nodeType = 'payment_receipt';
  private readonly logger = new Logger(PaymentReceiptNodeHandler.name);

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
    private readonly whatsappApi: WhatsAppApiService,
    private readonly builder: BuilderService,
  ) {}

  /** Mint a read-only order webview link for the paid order + send it as a CTA URL. */
  private async sendOrderLink(ctx: ExecutionContext, orderId: string, orderNumber: string): Promise<void> {
    try {
      if (!orderId || !orderNumber) return;
      let tenantId = ctx.tenant?.id;
      if (!tenantId) {
        const t = await this.connectionManager.executeGlobal(async (qr) =>
          (await qr.query(`SELECT id FROM tenants WHERE schema_name = $1`, [ctx.schema]))[0]);
        tenantId = t?.id;
      }
      if (!tenantId) return;
      const { url } = await this.builder.createViewSession({
        tenantId, schemaName: ctx.schema, type: 'order',
        resultId: orderId, resultNumber: orderNumber,
        customerId: ctx.customerId, customerPhone: ctx.customerPhone,
      });
      await this.whatsappApi.sendCtaUrl(
        ctx.tenant.phoneNumberId, ctx.tenant.accessToken, ctx.customerPhone,
        `🧾 Tap below to view order *#${orderNumber}*.`, '📄 View Order', url,
      );
    } catch (err: any) {
      this.logger.warn(`payment order link failed: ${err.message}`);
    }
  }

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const cfg = node.config || {};
    const paymentId = ctx.variables.payment_id || '';
    const orderId = ctx.variables.order_id || '';

    const data = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      let payment: any;
      if (paymentId) {
        payment = (await qr.query(`SELECT * FROM payments WHERE id = $1`, [paymentId]))[0];
      } else if (orderId) {
        payment = (await qr.query(`SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [orderId]))[0];
      }
      if (!payment) return null;
      const order = payment.order_id
        ? (await qr.query(`SELECT order_number, total, currency FROM orders WHERE id = $1`, [payment.order_id]))[0]
        : null;
      return { payment, order };
    });

    if (!data) {
      await this.text(ctx, cfg.notFoundMessage || 'No payment found yet. We’ll send your receipt once payment is recorded.');
      const next = findNextEdge(edges, node.id);
      return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
    }

    const { payment, order } = data;
    const cur = cfg.currencySymbol || payment.currency || order?.currency || '₹';
    const paid = (payment.status || '').toLowerCase() === 'verified' || (payment.status || '').toLowerCase() === 'paid';
    const head = paid ? '🧾 *Payment Receipt*' : '💳 *Payment Details*';
    const statusLine = paid ? '✅ Paid' : `⏳ ${this.titleCase(payment.status || 'pending')}`;

    let body = `${head}\n──────────────\n`;
    if (order?.order_number) body += `Order: *#${order.order_number}*\n`;
    body += `Amount: *${cur}${this.num(payment.amount)}*\n`;
    if (payment.method) body += `Method: ${this.titleCase(payment.method)}\n`;
    if (payment.transaction_ref) body += `Reference: ${payment.transaction_ref}\n`;
    body += `Status: ${statusLine}`;
    if (!paid) body += `\n\nReply here to complete your payment.`;
    else body += `\n\nThank you, {{customer_name}}! 🙏`;
    const footer = cfg.footer !== undefined ? cfg.footer : '\n\nReply *menu* anytime. 🛍️';
    body = resolveTemplate(body + footer, ctx);

    await this.text(ctx, body);
    if (cfg.webview !== false && payment.order_id && order?.order_number) {
      await this.sendOrderLink(ctx, payment.order_id, order.order_number);
    }

    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }

  private num(v: any): string {
    const n = Number(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  private titleCase(s: string): string {
    return (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private async text(ctx: ExecutionContext, body: string): Promise<void> {
    await this.messageService.logAndSendText(ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken, ctx.customerPhone, ctx.conversationId, body);
  }
}
