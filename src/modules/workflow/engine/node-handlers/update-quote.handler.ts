import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';

@Injectable()
export class UpdateQuoteNodeHandler implements NodeHandler {
  readonly nodeType = 'update_quote';

  constructor(
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const newStatus = node.config.status;
    if (!newStatus) return { action: 'error', message: 'update_quote: no status configured' };

    const quoteId = node.config.quoteId || ctx.variables.quote_id;
    if (!quoteId) return { action: 'error', message: 'update_quote: no quote_id in context' };

    await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      const extra: string[] = [];
      if (newStatus === 'sent') extra.push(`sent_at = NOW()`);
      if (newStatus === 'accepted') extra.push(`accepted_at = NOW()`);
      if (newStatus === 'converted') extra.push(`converted_at = NOW()`);

      const setClauses = [`status = $1`, `updated_at = NOW()`, ...extra];
      await qr.query(
        `UPDATE quotes SET ${setClauses.join(', ')} WHERE id = $2`,
        [newStatus, quoteId],
      );
    });

    ctx.variables.quote_status = newStatus;
    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }
}
