import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

/**
 * Shows the full details of a single order (items + totals + status). Reads the
 * order from ctx.variables.order_id (set by order events) or order_number, or a
 * number the customer just typed. Used as the response to an "Order Details"
 * button on order notifications. Continues to the next node (or ends).
 */
@Injectable()
export class OrderDetailsNodeHandler implements NodeHandler {
  readonly nodeType = 'order_details';

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

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
