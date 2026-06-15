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
      // Resolve the customer id from the phone if it wasn't carried into the
      // context — an empty string would crash the uuid comparison below.
      let customerId = ctx.customerId;
      if (!customerId) {
        const c = (await qr.query(`SELECT id FROM customers WHERE phone = $1 OR phone = $2 LIMIT 1`, [ctx.customerPhone, `+${ctx.customerPhone}`]))[0];
        customerId = c?.id;
      }
      if (!customerId) return [];
      ctx.customerId = customerId;
      return qr.query(
        `SELECT p.name AS product_name, ci.unit_price AS price, ci.quantity
         FROM cart_items ci
         JOIN carts c ON ci.cart_id = c.id
         JOIN products p ON p.id = ci.product_id
         WHERE c.customer_id = $1 AND c.status = 'active'`,
        [customerId],
      );
    });

    const cfg = node.config || {};
    const cur = cfg.currencySymbol || '₹';
    if (cartItems.length === 0) {
      await this.messageService.logAndSendText(
        ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
        ctx.customerPhone, ctx.conversationId,
        cfg.emptyMessage || 'Your cart is empty. Browse our catalog to add items!',
      );
      const emptyEdge = edges.find((e) => e.from === node.id && e.label?.toLowerCase() === 'empty');
      const defaultEdge = edges.find((e) => e.from === node.id);
      const next = emptyEdge || defaultEdge;
      return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
    }

    let total = 0;
    const lineFmt = cfg.lineFormat || '• {name} × {qty} — {currency}{subtotal}';
    const lines = cartItems.map((item: any) => {
      const subtotal = item.price * item.quantity;
      total += subtotal;
      return lineFmt
        .replace('{name}', item.product_name)
        .replace('{qty}', String(item.quantity))
        .replace('{currency}', cur)
        .replace('{subtotal}', String(subtotal))
        .replace('{price}', String(item.price));
    });

    const header = cfg.header || '🛒 Your Cart:';
    const totalLabel = cfg.totalLabel || 'Total';
    const body = `${header}\n${lines.join('\n')}\n\n*${totalLabel}: ${cur}${total}*`;
    ctx.variables.cart_total = total;

    const buttons: Array<{ id: string; title: string }> = [];
    if (cfg.showCheckout !== false) {
      buttons.push({ id: 'wf_checkout', title: cfg.checkoutLabel || 'Checkout' });
    }
    if (cfg.showClear !== false) {
      buttons.push({ id: 'wf_clear_cart', title: cfg.clearLabel || 'Clear Cart' });
    }
    buttons.push({ id: 'wf_continue_shop', title: cfg.continueLabel || 'Continue Shopping' });

    await this.messageService.logAndSendInteractiveButtons(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId, body, buttons.slice(0, 3).map((b) => ({ ...b, title: b.title.slice(0, 20) })),
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
