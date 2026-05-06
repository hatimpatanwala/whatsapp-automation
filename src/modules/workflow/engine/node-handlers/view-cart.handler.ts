import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult } from '../workflow-engine.types';

@Injectable()
export class ViewCartNodeHandler implements NodeHandler {
  readonly nodeType = 'view_cart';

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const cartItems = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      return qr.query(
        `SELECT ci.product_name, ci.price, ci.quantity
         FROM cart_items ci
         JOIN carts c ON ci.cart_id = c.id
         WHERE c.customer_id = $1 AND c.status = 'active'`,
        [ctx.customerId],
      );
    });

    if (cartItems.length === 0) {
      await this.messageService.logAndSendText(
        ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
        ctx.customerPhone, ctx.conversationId,
        'Your cart is empty. Browse our catalog to add items!',
      );
      const emptyEdge = edges.find((e) => e.from === node.id && e.label?.toLowerCase() === 'empty');
      const defaultEdge = edges.find((e) => e.from === node.id);
      const next = emptyEdge || defaultEdge;
      return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
    }

    let total = 0;
    const lines = cartItems.map((item: any) => {
      const subtotal = item.price * item.quantity;
      total += subtotal;
      return `• ${item.product_name} × ${item.quantity} — ₹${subtotal}`;
    });

    const body = `🛒 Your Cart:\n${lines.join('\n')}\n\n*Total: ₹${total}*`;
    ctx.variables.cart_total = total;

    const buttons: Array<{ id: string; title: string }> = [];
    if (node.config.showCheckout !== false) {
      buttons.push({ id: 'wf_checkout', title: 'Checkout' });
    }
    if (node.config.showClear !== false) {
      buttons.push({ id: 'wf_clear_cart', title: 'Clear Cart' });
    }
    buttons.push({ id: 'wf_continue_shop', title: 'Continue Shopping' });

    await this.messageService.logAndSendInteractiveButtons(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId, body, buttons.slice(0, 3),
    );

    // Store button mapping for resume
    const outEdges = edges.filter((e) => e.from === node.id);
    ctx.variables._buttonMap = {};
    buttons.forEach((btn) => {
      const matchEdge = outEdges.find((e) => e.label?.toLowerCase() === btn.title.toLowerCase());
      if (matchEdge) ctx.variables._buttonMap[btn.id] = matchEdge.to;
    });

    return { action: 'wait', waitType: 'reply', waitConfig: { nodeId: node.id } };
  }
}
