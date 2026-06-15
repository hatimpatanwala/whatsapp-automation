import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

/**
 * Lists the current customer's recent orders with their status. No input needed
 * — it uses the conversation's customer. Continues to the next node.
 */
@Injectable()
export class MyOrdersNodeHandler implements NodeHandler {
  readonly nodeType = 'my_orders';

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const limit = Number(node.config.maxOrders) || 5;
    const orders = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      let customerId = ctx.customerId;
      if (!customerId) {
        const c = (await qr.query(
          `SELECT id FROM customers WHERE phone = $1 OR phone = $2 LIMIT 1`,
          [ctx.customerPhone, `+${ctx.customerPhone}`],
        ))[0];
        customerId = c?.id;
      }
      if (!customerId) return [];
      return qr.query(
        `SELECT order_number, status, total, currency FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [customerId, limit],
      );
    });

    let body: string;
    if (!orders.length) {
      body = resolveTemplate(node.config.emptyMessage || 'You have no orders yet. 🛍️ Send *menu* to browse products!', ctx);
    } else {
      const lines = orders
        .map((o: any) => `• *#${o.order_number}* — ${this.titleCase(o.status)} · ${o.currency || '₹'}${o.total}`)
        .join('\n');
      const header = resolveTemplate(node.config.header || '📦 *Your Orders*', ctx);
      body = `${header}\n\n${lines}`;
    }

    await this.messageService.logAndSendText(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId, body,
    );

    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }

  private titleCase(s: string): string {
    return (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
