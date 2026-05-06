import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findEdgeByLabel } from '../workflow-engine.types';

@Injectable()
export class ConditionNodeHandler implements NodeHandler {
  readonly nodeType = 'condition';

  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const { variable, operator, value } = node.config;
    const actual = await this.resolveVariable(variable, ctx);
    const matches = this.evaluate(actual, operator, value);

    const edge = findEdgeByLabel(edges, node.id, matches ? 'Yes' : 'No');
    if (!edge) return { action: 'end' };
    return { action: 'continue', nextNodeId: edge.to };
  }

  private async resolveVariable(variable: string, ctx: ExecutionContext): Promise<any> {
    // Check execution variables first
    if (ctx.variables[variable] !== undefined) return ctx.variables[variable];

    switch (variable) {
      case 'cart_items':
        return this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
          const res = await qr.query(
            `SELECT COUNT(*) as cnt FROM cart_items ci
             JOIN carts c ON ci.cart_id = c.id
             WHERE c.customer_id = $1 AND c.status = 'active'`,
            [ctx.customerId],
          );
          return parseInt(res[0]?.cnt || '0', 10);
        });

      case 'order_status':
        return this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
          const res = await qr.query(
            `SELECT status FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [ctx.customerId],
          );
          return res[0]?.status || '';
        });

      case 'payment_status':
        return this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
          const res = await qr.query(
            `SELECT p.status FROM payments p
             JOIN orders o ON p.order_id = o.id
             WHERE o.customer_id = $1 ORDER BY p.created_at DESC LIMIT 1`,
            [ctx.customerId],
          );
          return res[0]?.status || '';
        });

      case 'message_contains':
        return ctx.lastReply?.text || '';

      case 'time_of_day': {
        const hour = new Date().getHours();
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        return 'evening';
      }

      case 'customer_tag':
        return this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
          const res = await qr.query(
            `SELECT tags FROM customers WHERE id = $1`,
            [ctx.customerId],
          );
          return (res[0]?.tags || []).join(',');
        });

      default:
        return ctx.variables[variable] ?? '';
    }
  }

  private evaluate(actual: any, operator: string, expected: string): boolean {
    const actualStr = String(actual).toLowerCase();
    const expectedStr = String(expected).toLowerCase();
    const actualNum = parseFloat(actualStr);
    const expectedNum = parseFloat(expectedStr);

    switch (operator) {
      case 'eq': return actualStr === expectedStr;
      case 'neq': return actualStr !== expectedStr;
      case 'gt': return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum > expectedNum;
      case 'lt': return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum < expectedNum;
      case 'contains': return actualStr.includes(expectedStr);
      default: return false;
    }
  }
}
