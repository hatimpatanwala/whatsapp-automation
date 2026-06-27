import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { WhatsAppApiService } from '../../../whatsapp/whatsapp-api.service';
import { BuilderService } from '../../../builder/builder.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

/**
 * Shows the full details of a single order (items + totals + status). Reads the
 * order from ctx.variables.order_id (set by order events) or order_number, or a
 * number the customer just typed. Used as the response to an "Order Details"
 * button on order notifications: sends a short summary AND a CTA URL button that
 * opens the full order webview. Continues to the next node (or ends).
 */
@Injectable()
export class OrderDetailsNodeHandler implements NodeHandler {
  readonly nodeType = 'order_details';
  private readonly logger = new Logger(OrderDetailsNodeHandler.name);

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
    private readonly whatsappApi: WhatsAppApiService,
    private readonly builder: BuilderService,
  ) {}

  /** Mint a read-only order webview link + send it as a CTA URL button. */
  private async sendWebviewLink(ctx: ExecutionContext, order: any): Promise<void> {
    try {
      let tenantId = ctx.tenant?.id;
      if (!tenantId) {
        const t = await this.connectionManager.executeGlobal(async (qr) =>
          (await qr.query(`SELECT id FROM tenants WHERE schema_name = $1`, [ctx.schema]))[0]);
        tenantId = t?.id;
      }
      if (!tenantId) return;
      const { url } = await this.builder.createViewSession({
        tenantId, schemaName: ctx.schema, type: 'order',
        resultId: order.id, resultNumber: order.order_number,
        customerId: ctx.customerId, customerPhone: ctx.customerPhone,
      });
      await this.whatsappApi.sendCtaUrl(
        ctx.tenant.phoneNumberId, ctx.tenant.accessToken, ctx.customerPhone,
        `📦 Order *#${order.order_number}* — tap below to view full details.`,
        '📄 View Order', url,
      );
    } catch (err: any) {
      this.logger.warn(`order webview link failed: ${err.message}`);
    }
  }

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const cfg = node.config || {};
    const orderId = ctx.variables.order_id || '';
    const orderNumber = String(ctx.variables.order_number || ctx.lastReply?.text || ctx.variables.last_input || '').trim();

    const data = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      let order: any;
      if (orderId) {
        order = (await qr.query(`SELECT * FROM orders WHERE id = $1`, [orderId]))[0];
      } else if (orderNumber) {
        order = (await qr.query(`SELECT * FROM orders WHERE UPPER(order_number) = UPPER($1) LIMIT 1`, [orderNumber]))[0];
      }
      if (!order) return null;
      const items = await qr.query(
        `SELECT product_name, quantity, unit_price, total_price FROM order_items WHERE order_id = $1`,
        [order.id],
      );
      return { order, items };
    });

    if (!data) {
      await this.text(ctx, cfg.notFoundMessage || 'Sorry, we couldn’t find that order. Send *menu* for options.');
      const next = findNextEdge(edges, node.id);
      return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
    }

    const { order, items } = data;
    const cur = cfg.currencySymbol || order.currency || '₹';
    const lines = items
      .map((it: any) => `• ${it.product_name} × ${it.quantity} — ${cur}${this.num(it.total_price)}`)
      .join('\n');

    let body = `📦 *Order #${order.order_number}*\nStatus: *${this.titleCase(order.status)}*\n`;
    body += `──────────────\n${lines || '(no items)'}\n──────────────\n`;
    body += `Subtotal: ${cur}${this.num(order.subtotal)}\n`;
    if (Number(order.delivery_fee) > 0) body += `Delivery: ${cur}${this.num(order.delivery_fee)}\n`;
    if (Number(order.discount) > 0) body += `Discount: -${cur}${this.num(order.discount)}\n`;
    body += `*Total: ${cur}${this.num(order.total)}*`;
    if (order.notes) body += `\n\n_${order.notes}_`;
    const footer = cfg.footer !== undefined ? cfg.footer : '\n\nReply *menu* anytime. 🛍️';
    body += resolveTemplate(footer, ctx);

    await this.text(ctx, body);
    if (cfg.webview !== false) await this.sendWebviewLink(ctx, order);

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
