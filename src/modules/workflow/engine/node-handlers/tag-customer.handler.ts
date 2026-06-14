import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';

@Injectable()
export class TagCustomerNodeHandler implements NodeHandler {
  readonly nodeType = 'tag_customer';

  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const action = node.config.action || 'add';
    // tag may be a string or (mis-typed) array; normalize to a trimmed string.
    const rawTag = node.config.tag;
    const tag = (Array.isArray(rawTag) ? rawTag[0] : rawTag) ? String(Array.isArray(rawTag) ? rawTag[0] : rawTag).trim() : '';
    if (!tag) return { action: 'error', message: 'tag_customer: no tag configured' };

    await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      if (action === 'add') {
        await qr.query(
          `UPDATE customers SET tags = array_append(COALESCE(tags, '{}'), $1) WHERE id = $2 AND NOT ($1 = ANY(COALESCE(tags, '{}')))`,
          [tag, ctx.customerId],
        );
      } else {
        await qr.query(
          `UPDATE customers SET tags = array_remove(COALESCE(tags, '{}'), $1) WHERE id = $2`,
          [tag, ctx.customerId],
        );
      }
    });

    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }
}
