import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';

@Injectable()
export class FilterProductsNodeHandler implements NodeHandler {
  readonly nodeType = 'filter_products';

  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const filterBy = node.config.filterBy || 'in_stock';
    const value = node.config.value || '';

    const products = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      switch (filterBy) {
        case 'category':
          return qr.query(
            `SELECT p.id, p.name, p.price FROM products p
             JOIN categories c ON p.category_id = c.id
             WHERE p.is_active = true AND c.name ILIKE $1`,
            [`%${value}%`],
          );
        case 'price': {
          const [min, max] = value.split('-').map(Number);
          return qr.query(
            `SELECT id, name, price FROM products WHERE is_active = true AND price BETWEEN $1 AND $2`,
            [min || 0, max || 999999],
          );
        }
        case 'in_stock':
          return qr.query(
            `SELECT p.id, p.name, p.price FROM products p
             JOIN inventory i ON p.id = i.product_id
             WHERE p.is_active = true AND i.quantity > 0`,
          );
        case 'on_sale':
          return qr.query(
            `SELECT id, name, price FROM products WHERE is_active = true AND compare_at_price IS NOT NULL AND compare_at_price > price`,
          );
        default:
          return qr.query(`SELECT id, name, price FROM products WHERE is_active = true LIMIT 10`);
      }
    });

    // Store filtered product IDs for downstream nodes
    ctx.variables.filtered_products = products.map((p: any) => p.id);
    ctx.variables.filtered_product_count = products.length;

    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }
}
