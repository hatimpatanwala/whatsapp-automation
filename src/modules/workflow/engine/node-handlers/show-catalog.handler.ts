import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

@Injectable()
export class ShowCatalogNodeHandler implements NodeHandler {
  readonly nodeType = 'show_catalog';

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const maxProducts = node.config.maxProducts || 10;
    const sortBy = node.config.sortBy || 'newest';

    const orderClause = sortBy === 'price_asc' ? 'p.price ASC'
      : sortBy === 'price_desc' ? 'p.price DESC'
      : 'p.created_at DESC';

    const categoryId = node.config.categoryId || '';

    const products = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      if (categoryId) {
        return qr.query(
          `SELECT p.id, p.name, p.price, c.name as category_name
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           WHERE p.is_active = true AND p.category_id = $1
           ORDER BY ${orderClause}
           LIMIT $2`,
          [categoryId, maxProducts],
        );
      }
      return qr.query(
        `SELECT p.id, p.name, p.price, c.name as category_name
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.is_active = true
         ORDER BY ${orderClause}
         LIMIT $1`,
        [maxProducts],
      );
    });

    if (products.length === 0) {
      await this.messageService.logAndSendText(
        ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
        ctx.customerPhone, ctx.conversationId,
        'Our catalog is currently empty. Please check back later!',
      );
      // Follow failure/empty edge
      const emptyEdge = edges.find((e) => e.from === node.id && e.label?.toLowerCase() === 'empty');
      const defaultEdge = edges.find((e) => e.from === node.id);
      const next = emptyEdge || defaultEdge;
      return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
    }

    // Build list sections grouped by category
    const sections = [{
      title: 'Products',
      rows: products.map((p: any) => ({
        id: `wf_prod_${p.id}`,
        title: p.name.substring(0, 24),
        description: `₹${p.price}${p.category_name ? ' • ' + p.category_name : ''}`,
      })),
    }];

    await this.messageService.logAndSendInteractiveList(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId,
      'Browse our products:',
      'View Products',
      sections,
    );

    // Pause for product selection
    return { action: 'wait', waitType: 'reply', waitConfig: { nodeId: node.id } };
  }
}
