import { Injectable } from '@nestjs/common';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findNextEdge } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

@Injectable()
export class SendTextNodeHandler implements NodeHandler {
  readonly nodeType = 'send_text';

  constructor(private readonly messageService: WhatsAppMessageService) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const text = resolveTemplate(node.config.message || '', ctx);
    if (!text) return { action: 'error', message: 'send_text: no message configured' };

    await this.messageService.logAndSendText(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId, text,
    );

    const next = findNextEdge(edges, node.id);
    return next ? { action: 'continue', nextNodeId: next.to } : { action: 'end' };
  }
}
