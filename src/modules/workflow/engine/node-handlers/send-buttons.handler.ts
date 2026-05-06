import { Injectable } from '@nestjs/common';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

@Injectable()
export class SendButtonsNodeHandler implements NodeHandler {
  readonly nodeType = 'send_buttons';

  constructor(private readonly messageService: WhatsAppMessageService) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const body = resolveTemplate(node.config.body || '', ctx);
    const buttonLines = (node.config.buttons || '').split('\n').filter((l: string) => l.trim());

    if (!body || buttonLines.length === 0) {
      return { action: 'error', message: 'send_buttons: body or buttons not configured' };
    }

    // WhatsApp allows max 3 buttons — use edge labels as button text
    const outEdges = edges.filter((e) => e.from === node.id);
    const buttons = buttonLines.slice(0, 3).map((text: string, i: number) => ({
      id: `wf_btn_${node.id}_${i}`,
      title: text.trim().substring(0, 20),
    }));

    await this.messageService.logAndSendInteractiveButtons(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId, body, buttons,
    );

    // Store button mapping in variables for resume routing
    ctx.variables._buttonMap = buttons.reduce((map: Record<string, string>, btn: any, i: number) => {
      map[btn.id] = outEdges[i]?.to || '';
      return map;
    }, {});

    return { action: 'wait', waitType: 'reply', waitConfig: { nodeId: node.id } };
  }
}
