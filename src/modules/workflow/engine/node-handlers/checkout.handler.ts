import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { EventBusService } from '../../../events/event-bus.service';
import { OrderCreatedEvent } from '../../../events/domain-events';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';

@Injectable()
export class CheckoutNodeHandler implements NodeHandler {
  readonly nodeType = 'checkout';

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    try {
      const result = await this.connectionManager.executeInTransaction(ctx.schema, async (qr) => {
        // Get active cart with items
        const cart = await qr.query(
          `SELECT c.id FROM carts c WHERE c.customer_id = $1 AND c.status = 'active'`,
          [ctx.customerId],
        );
        if (cart.length === 0) throw new Error('No active cart');

        const cartItems = await qr.query(
          `SELECT product_id, product_name, price, quantity FROM cart_items WHERE cart_id = $1`,
          [cart[0].id],
        );
        if (cartItems.length === 0) throw new Error('Cart is empty');

        // Calculate total
        const subtotal = cartItems.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);

        // Generate order number
        const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

        // Create order
        const order = await qr.query(
          `INSERT INTO orders (customer_id, order_number, status, subtotal, total, address_id)
           VALUES ($1, $2, 'pending', $3, $3, $4) RETURNING *`,
          [ctx.customerId, orderNumber, subtotal, ctx.variables.selected_address_id || null],
        );

        // Create order items
        for (const item of cartItems) {
          await qr.query(
            `INSERT INTO order_items (order_id, product_id, product_name, price, quantity, subtotal)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [order[0].id, item.product_id, item.product_name, item.price, item.quantity, item.price * item.quantity],
          );
        }

        // Mark cart as checked out
        await qr.query(`UPDATE carts SET status = 'checked_out' WHERE id = $1`, [cart[0].id]);

        return { orderId: order[0].id, orderNumber, total: subtotal };
      });

      // Store in context
      ctx.variables.order_id = result.orderId;
      ctx.variables.order_number = result.orderNumber;
      ctx.variables.order_total = result.total;

      // Emit event
      this.eventBus.emit(new OrderCreatedEvent(
        ctx.schema, result.orderId, ctx.customerId, result.orderNumber, result.total,
      ));

      await this.messageService.logAndSendText(
        ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
        ctx.customerPhone, ctx.conversationId,
        `✅ Order ${result.orderNumber} created!\nTotal: ₹${result.total}`,
      );

      // Follow success edge
      const successEdge = edges.find((e) => e.from === node.id && e.label?.toLowerCase() !== 'failure');
      return successEdge ? { action: 'continue', nextNodeId: successEdge.to } : { action: 'end' };
    } catch {
      await this.messageService.logAndSendText(
        ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
        ctx.customerPhone, ctx.conversationId,
        'Sorry, we couldn\'t process your order. Please try again.',
      );
      const failEdge = edges.find((e) => e.from === node.id && e.label?.toLowerCase() === 'failure');
      if (failEdge) return { action: 'continue', nextNodeId: failEdge.to };
      return { action: 'end' };
    }
  }
}
