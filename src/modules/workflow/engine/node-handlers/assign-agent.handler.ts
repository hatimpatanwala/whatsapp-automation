import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../../../../database/tenant-connection.manager';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

@Injectable()
export class AssignAgentNodeHandler implements NodeHandler {
  readonly nodeType = 'assign_agent';

  constructor(
    private readonly messageService: WhatsAppMessageService,
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const handoffMessage = resolveTemplate(
      node.config.message || 'Connecting you with our team...', ctx,
    );

    // Mark conversation as needing human agent
    await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      await qr.query(
        `UPDATE conversations SET context = jsonb_set(COALESCE(context, '{}'), '{assigned_to_agent}', 'true') WHERE id = $1`,
        [ctx.conversationId],
      );
    });

    await this.messageService.logAndSendText(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId, handoffMessage,
    );

    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }
}
