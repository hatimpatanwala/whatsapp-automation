import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

@Injectable()
export class AddToCartNodeHandler implements NodeHandler {
  readonly nodeType = 'add_to_cart';

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const productId = ctx.variables.selected_product_id;
    if (!productId) {
      return { action: 'error', message: 'add_to_cart: no selected_product_id in context' };
    }

    const confirmMessage = resolveTemplate(
      node.config.confirmMessage || 'Added to cart!', ctx,
    );

    try {
      await this.connectionManager.executeInTransaction(ctx.schema, async (qr) => {
        // Get or create active cart
        let cart = await qr.query(
          `SELECT id FROM carts WHERE customer_id = $1 AND status = 'active'`,
          [ctx.customerId],
        );
        if (cart.length === 0) {
          cart = await qr.query(
            `INSERT INTO carts (customer_id, status) VALUES ($1, 'active') RETURNING id`,
            [ctx.customerId],
          );
        }
        const cartId = cart[0].id;

        // Get product details
        const product = await qr.query(
          `SELECT id, name, price FROM products WHERE id = $1 AND is_active = true`,
          [productId],
        );
        if (product.length === 0) throw new Error('Product not found');

        // Check if already in cart
        const existing = await qr.query(
          `SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2`,
          [cartId, productId],
        );

        if (existing.length > 0) {
          await qr.query(
            `UPDATE cart_items SET quantity = quantity + 1 WHERE id = $1`,
            [existing[0].id],
          );
        } else {
          await qr.query(
            `INSERT INTO cart_items (cart_id, product_id, product_name, price, quantity) VALUES ($1, $2, $3, $4, 1)`,
            [cartId, productId, product[0].name, product[0].price],
          );
        }

        ctx.variables.cart_product_name = product[0].name;
        ctx.variables.cart_product_price = product[0].price;
      });

      await this.messageService.logAndSendText(
        ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
        ctx.customerPhone, ctx.conversationId, confirmMessage,
      );

      // Follow success edge
      const successEdge = edges.find((e) => e.from === node.id && e.label?.toLowerCase() !== 'failure');
      return successEdge ? { action: 'continue', nextNodeId: successEdge.to } : { action: 'end' };
    } catch {
      const failEdge = edges.find((e) => e.from === node.id && e.label?.toLowerCase() === 'failure');
      if (failEdge) return { action: 'continue', nextNodeId: failEdge.to };
      return { action: 'error', message: 'add_to_cart: failed to add product' };
    }
  }
}
