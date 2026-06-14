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
    const filterCategory = node.config.filterCategory || '';

    const products = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      switch (filterBy) {
        case 'category':
          if (filterCategory) {
            return qr.query(
              `SELECT p.id, p.name, COALESCE(p.sale_price, p.base_price) AS price FROM products p
               WHERE p.is_active = true AND p.category_id = $1`,
              [filterCategory],
            );
          }
          return qr.query(
            `SELECT p.id, p.name, COALESCE(p.sale_price, p.base_price) AS price FROM products p
             JOIN categories c ON p.category_id = c.id
             WHERE p.is_active = true AND c.name ILIKE $1`,
            [`%${value}%`],
          );
        case 'price': {
          // value may be "100-500" (string) or [100, 500] (array).
          let min: number, max: number;
          if (Array.isArray(value)) {
            [min, max] = [Number(value[0]), Number(value[1])];
          } else {
            [min, max] = String(value).split('-').map(Number);
          }
          return qr.query(
            `SELECT id, name, COALESCE(sale_price, base_price) AS price FROM products
             WHERE is_active = true AND COALESCE(sale_price, base_price) BETWEEN $1 AND $2`,
            [min || 0, max || 999999],
          );
        }
        case 'in_stock':
          return qr.query(
            `SELECT p.id, p.name, COALESCE(p.sale_price, p.base_price) AS price FROM products p
             JOIN inventory i ON p.id = i.product_id
             WHERE p.is_active = true AND i.quantity > 0`,
          );
        case 'on_sale':
          return qr.query(
            `SELECT id, name, COALESCE(sale_price, base_price) AS price FROM products WHERE is_active = true AND sale_price IS NOT NULL AND sale_price < base_price`,
          );
        default:
          return qr.query(`SELECT id, name, COALESCE(sale_price, base_price) AS price FROM products WHERE is_active = true LIMIT 10`);
      }
    });

    // Store filtered product IDs for downstream nodes
    ctx.variables.filtered_products = products.map((p: any) => p.id);
    ctx.variables.filtered_product_count = products.length;

    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }
}
