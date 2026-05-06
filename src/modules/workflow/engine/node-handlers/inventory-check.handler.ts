import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findEdgeByLabel } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

@Injectable()
export class InventoryCheckNodeHandler implements NodeHandler {
  readonly nodeType = 'inventory_check';

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const productId = ctx.variables.selected_product_id;
    if (!productId) {
      return { action: 'error', message: 'inventory_check: no selected_product_id in context' };
    }

    const stock = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      const res = await qr.query(
        `SELECT quantity FROM inventory WHERE product_id = $1`,
        [productId],
      );
      return res[0]?.quantity ?? 0;
    });

    const inStock = stock > 0;
    ctx.variables.stock_quantity = stock;

    if (!inStock) {
      const msg = resolveTemplate(
        node.config.outOfStockMessage || 'Sorry, this item is currently out of stock.', ctx,
      );
      await this.messageService.logAndSendText(
        ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
        ctx.customerPhone, ctx.conversationId, msg,
      );
    }

    // Follow In Stock / Out of Stock edge
    const label = inStock ? 'In Stock' : 'Out of Stock';
    const edge = findEdgeByLabel(edges, node.id, label);
    // Also try Yes/No as a fallback convention
    const fallbackEdge = findEdgeByLabel(edges, node.id, inStock ? 'Yes' : 'No');
    const nextEdge = edge || fallbackEdge;

    return nextEdge ? { action: 'continue', nextNodeId: nextEdge.to } : { action: 'end' };
  }
}
