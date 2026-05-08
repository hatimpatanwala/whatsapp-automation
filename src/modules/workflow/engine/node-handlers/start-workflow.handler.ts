import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult } from '../workflow-engine.types';

@Injectable()
export class StartWorkflowNodeHandler implements NodeHandler {
  readonly nodeType = 'start_workflow';

  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const workflowIdentifier = node.config.workflowId || node.config.workflowName || '';
    const passVariables = node.config.passVariables !== false;

    if (!workflowIdentifier) {
      return { action: 'error', message: 'start_workflow: no target workflow configured' };
    }

    // Resolve workflow — try by ID first, then by name
    const workflow = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      // Try UUID match first
      const byId = await qr.query(
        `SELECT id FROM workflows WHERE id = $1 AND status = 'active'`,
        [workflowIdentifier],
      );
      if (byId[0]) return byId[0];

      // Fall back to name match
      const byName = await qr.query(
        `SELECT id FROM workflows WHERE LOWER(name) = LOWER($1) AND status = 'active' LIMIT 1`,
        [workflowIdentifier],
      );
      return byName[0] || null;
    });

    if (!workflow) {
      return { action: 'error', message: `start_workflow: target workflow "${workflowIdentifier}" not found or not active` };
    }

    return {
      action: 'start_workflow',
      targetWorkflowId: workflow.id,
      passVariables,
    };
  }
}
