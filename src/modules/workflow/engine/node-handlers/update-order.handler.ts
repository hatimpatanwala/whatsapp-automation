import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { EventBusService } from '../../../events/event-bus.service';
import { OrderStatusChangedEvent } from '../../../events/domain-events';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';

@Injectable()
export class UpdateOrderNodeHandler implements NodeHandler {
  readonly nodeType = 'update_order';

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const newStatus = node.config.status;
    if (!newStatus) return { action: 'error', message: 'update_order: no status configured' };

    const orderId = ctx.variables.order_id;
    if (!orderId) return { action: 'error', message: 'update_order: no order_id in context' };

    const oldStatus = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      const order = await qr.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      if (order.length === 0) return null;

      const prev = order[0].status;
      const updates: string[] = [`status = '${newStatus}'`];
      if (newStatus === 'confirmed') updates.push(`confirmed_at = NOW()`);
      if (newStatus === 'delivered') updates.push(`delivered_at = NOW()`);

      await qr.query(`UPDATE orders SET ${updates.join(', ')} WHERE id = $1`, [orderId]);
      return prev;
    });

    if (oldStatus) {
      this.eventBus.emit(new OrderStatusChangedEvent(
        ctx.schema, orderId, ctx.customerId, oldStatus, newStatus,
      ));
    }

    ctx.variables.order_status = newStatus;
    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }
}
