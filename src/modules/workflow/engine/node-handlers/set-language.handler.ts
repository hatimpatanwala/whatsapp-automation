import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';

@Injectable()
export class SetLanguageNodeHandler implements NodeHandler {
  readonly nodeType = 'set_language';

  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const language = node.config.language || 'en';
    ctx.variables.language = language;

    // Persist language preference on the customer record
    await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      await qr.query(
        `UPDATE customers SET language = $1 WHERE id = $2`,
        [language, ctx.customerId],
      );
    });

    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }
}
