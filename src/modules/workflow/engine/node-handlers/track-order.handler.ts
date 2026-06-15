import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';

/**
 * Looks up an order by its number and shows a status progress bar. Reads the
 * order number the customer just typed (place a "Wait for Reply" node before
 * this one). Continues to the next node.
 */
@Injectable()
export class TrackOrderNodeHandler implements NodeHandler {
  readonly nodeType = 'track_order';
  private readonly STEPS = ['placed', 'confirmed', 'processing', 'ready_for_delivery', 'delivered'];

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const cfg = node.config || {};
    // Allow stores to override the tracked stages (comma-separated) and labels.
    const steps = typeof cfg.steps === 'string' && cfg.steps.trim()
      ? cfg.steps.split(',').map((s: string) => s.trim()).filter(Boolean)
      : this.STEPS;
    const cur = cfg.currencySymbol || '';
    const orderNumber = String(
      ctx.lastReply?.text || ctx.variables.last_input || ctx.variables.order_number || '',
    ).trim();

    let body: string;
    if (!orderNumber) {
      body = cfg.askMessage || 'Please send your *order number* (e.g. ORD-ABC123), then try again.';
    } else {
      const o = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) =>
        (await qr.query(
          `SELECT order_number, status, total, currency FROM orders WHERE UPPER(order_number) = UPPER($1) LIMIT 1`,
          [orderNumber],
        ))[0]);

      if (!o) {
        body = (cfg.notFoundMessage || '❓ No order found for *{order}*. Please double-check the number.').replace('{order}', orderNumber);
      } else if (o.status === 'cancelled') {
        body = (cfg.cancelledMessage || '❌ Order *{order}* was cancelled.').replace('{order}', o.order_number);
      } else {
        const idx = steps.indexOf(o.status);
        const progress = steps
          .map((s: string, i: number) => `${idx >= 0 && i <= idx ? '✅' : '⬜'} ${this.titleCase(s)}`)
          .join('\n');
        body = (cfg.statusTemplate
          || '🚚 *Order {order}*\nStatus: *{status}*\nTotal: {currency}{total}\n\n{progress}')
          .replace('{order}', o.order_number)
          .replace('{status}', this.titleCase(o.status))
          .replace('{currency}', cur || o.currency || '₹')
          .replace('{total}', String(o.total))
          .replace('{progress}', progress);
      }
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
