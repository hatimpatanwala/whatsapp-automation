import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findEdgeByLabel } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

@Injectable()
export class SearchProductsNodeHandler implements NodeHandler {
  readonly nodeType = 'search_products';

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const query = ctx.lastReply?.text || ctx.variables.search_query || '';
    const maxResults = node.config.maxResults || 5;

    if (!query) {
      await this.messageService.logAndSendText(
        ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
        ctx.customerPhone, ctx.conversationId,
        'What are you looking for? Type a product name to search.',
      );
      return { action: 'wait', waitType: 'reply', waitConfig: { nodeId: node.id } };
    }

    const products = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      return qr.query(
        `SELECT id, name, price FROM products
         WHERE is_active = true AND (name ILIKE $1 OR description ILIKE $1)
         LIMIT $2`,
        [`%${query}%`, maxResults],
      );
    });

    if (products.length === 0) {
      const msg = resolveTemplate(
        node.config.noResultsMessage || 'No products found. Try different keywords.', ctx,
      );
      await this.messageService.logAndSendText(
        ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
        ctx.customerPhone, ctx.conversationId, msg,
      );
      const noResultEdge = findEdgeByLabel(edges, node.id, 'No Results');
      const defaultEdge = edges.find((e) => e.from === node.id);
      const next = noResultEdge || defaultEdge;
      return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
    }

    const sections = [{
      title: 'Search Results',
      rows: products.map((p: any) => ({
        id: `wf_prod_${p.id}`,
        title: p.name.substring(0, 24),
        description: `₹${p.price}`,
      })),
    }];

    await this.messageService.logAndSendInteractiveList(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId,
      `Found ${products.length} product(s) for "${query}":`,
      'View Results',
      sections,
    );

    return { action: 'wait', waitType: 'reply', waitConfig: { nodeId: node.id } };
  }
}
