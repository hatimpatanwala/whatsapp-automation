import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { EventBusService } from '../../../events/event-bus.service';
import { OrderCreatedEvent } from '../../../events/domain-events';
import { PromotionsEngine } from '../../../promotions/promotions-engine.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';

@Injectable()
export class CheckoutNodeHandler implements NodeHandler {
  readonly nodeType = 'checkout';

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
    private readonly eventBus: EventBusService,
    private readonly promotions: PromotionsEngine,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    try {
      const result = await this.connectionManager.executeInTransaction(ctx.schema, async (qr) => {
        // Resolve customer id from phone if it wasn't carried into the context.
        if (!ctx.customerId) {
          const c = (await qr.query(`SELECT id FROM customers WHERE phone = $1 OR phone = $2 LIMIT 1`, [ctx.customerPhone, `+${ctx.customerPhone}`]))[0];
          if (c?.id) ctx.customerId = c.id;
        }
        // Get active cart with items
        const cart = await qr.query(
          `SELECT c.id FROM carts c WHERE c.customer_id = $1 AND c.status = 'active'`,
          [ctx.customerId],
        );
        if (cart.length === 0) throw new Error('No active cart');

        const cartItems = await qr.query(
          `SELECT ci.product_id, p.name AS product_name, ci.unit_price AS price, ci.quantity
           FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = $1`,
          [cart[0].id],
        );
        if (cartItems.length === 0) throw new Error('Cart is empty');

        // Calculate subtotal, then auto-apply active offer schemes.
        const subtotal = cartItems.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);
        const offers = await this.promotions
          .evaluateCart(
            ctx.schema,
            cartItems.map((i: any) => ({ productId: i.product_id, quantity: Number(i.quantity), unitPrice: Number(i.price) })),
            ctx.customerId,
          )
          .catch(() => null);
        const discount = offers ? Math.min(Number(offers.discountTotal) || 0, subtotal) : 0;
        const freeItems = offers?.freeItems || [];
        const total = Math.max(0, subtotal - discount);

        // Generate order number
        const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}`;

        // Create order (persisting the offer discount)
        const order = await qr.query(
          `INSERT INTO orders (customer_id, order_number, status, subtotal, discount, total, address_id)
           VALUES ($1, $2, 'pending', $3, $4, $5, $6) RETURNING *`,
          [ctx.customerId, orderNumber, subtotal, discount, total, ctx.variables.selected_address_id || null],
        );

        // Create order items
        for (const item of cartItems) {
          await qr.query(
            `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [order[0].id, item.product_id, item.product_name, item.quantity, item.price, item.price * item.quantity],
          );
        }
        // Add any free items granted by offers at ₹0 (tagged FREE in the name).
        for (const f of freeItems) {
          await qr.query(
            `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
             VALUES ($1, $2, $3, $4, 0, 0)`,
            [order[0].id, f.productId, `🎁 FREE: ${f.name}`, f.quantity],
          );
        }

        // Mark cart as checked out
        await qr.query(`UPDATE carts SET status = 'checked_out' WHERE id = $1`, [cart[0].id]);

        return { orderId: order[0].id, orderNumber, total, subtotal, discount, freeItems };
      });

      // Store in context
      ctx.variables.order_id = result.orderId;
      ctx.variables.order_number = result.orderNumber;
      ctx.variables.order_total = result.total;
      ctx.variables.order_subtotal = result.subtotal;
      ctx.variables.order_discount = result.discount;

      // Emit event
      this.eventBus.emit(new OrderCreatedEvent(
        ctx.schema, result.orderId, ctx.customerId, result.orderNumber, result.total,
      ));

      let confirm = `✅ Order ${result.orderNumber} created!`;
      if (result.freeItems.length) {
        confirm += '\n' + result.freeItems.map((f: any) => `🎁 FREE: ${f.name} × ${f.quantity}`).join('\n');
      }
      if (result.discount > 0) {
        confirm += `\nSubtotal: ₹${result.subtotal}\n💸 Offer discount: -₹${result.discount}`;
      }
      confirm += `\n*Total: ₹${result.total}*`;
      await this.messageService.logAndSendText(
        ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
        ctx.customerPhone, ctx.conversationId,
        confirm,
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
