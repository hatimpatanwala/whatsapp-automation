import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

@Injectable()
export class SendQuoteNodeHandler implements NodeHandler {
  readonly nodeType = 'send_quote';

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly messageService: WhatsAppMessageService,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const quoteId = node.config.quoteId || ctx.variables.quote_id;
    if (!quoteId) {
      return { action: 'error', message: 'send_quote: no quote_id in config or context' };
    }

    const quote = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      const q = await qr.query(`SELECT * FROM quotes WHERE id = $1`, [quoteId]);
      if (!q[0]) return null;
      const items = await qr.query(
        `SELECT qi.*, p.name as product_name FROM quote_items qi LEFT JOIN products p ON p.id = qi.product_id WHERE qi.quote_id = $1 ORDER BY qi.sort_order`,
        [quoteId],
      );
      return { ...q[0], items };
    });

    if (!quote) {
      return { action: 'error', message: `send_quote: quote ${quoteId} not found` };
    }

    // Build formatted quote message
    let text = `📋 *Quote: ${quote.quote_number}*\n`;
    if (quote.title) text += `${quote.title}\n`;
    text += `\n`;

    for (const item of quote.items) {
      const name = item.product_name || item.description;
      text += `• ${name} × ${item.quantity} — ₹${parseFloat(item.line_total).toFixed(2)}\n`;
    }

    text += `\n──────────────\n`;
    text += `Subtotal: ₹${parseFloat(quote.subtotal).toFixed(2)}\n`;
    if (parseFloat(quote.tax_amount) > 0) {
      text += `Tax: ₹${parseFloat(quote.tax_amount).toFixed(2)}\n`;
    }
    text += `*Total: ₹${parseFloat(quote.total_amount).toFixed(2)}*\n`;

    if (quote.valid_until) {
      const validDate = new Date(quote.valid_until).toLocaleDateString();
      text += `\nValid until: ${validDate}`;
    }

    if (quote.notes) {
      text += `\n\n_${quote.notes}_`;
    }

    const headerMsg = node.config.headerMessage
      ? resolveTemplate(node.config.headerMessage, ctx)
      : '';
    const footerMsg = node.config.footerMessage
      ? resolveTemplate(node.config.footerMessage, ctx)
      : '';

    const fullMessage = [headerMsg, text, footerMsg].filter(Boolean).join('\n\n');

    await this.messageService.logAndSendText(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId, fullMessage,
    );

    // Mark quote as sent
    await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      await qr.query(
        `UPDATE quotes SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'draft'`,
        [quoteId],
      );
    });

    ctx.variables.quote_id = quoteId;
    ctx.variables.quote_number = quote.quote_number;
    ctx.variables.quote_total = quote.total_amount;

    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }
}
