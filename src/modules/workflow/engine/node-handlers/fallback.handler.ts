import { Injectable } from '@nestjs/common';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

@Injectable()
export class FallbackNodeHandler implements NodeHandler {
  readonly nodeType = 'fallback';

  constructor(private readonly messageService: WhatsAppMessageService) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const outEdges = edges.filter((e) => e.from === node.id);
    const message = resolveTemplate(
      node.config.message || "Sorry, I didn't understand that. What would you like to do?",
      ctx,
    );

    const mode = node.config.mode || 'buttons'; // 'buttons' | 'text' | 'restart'

    if (mode === 'restart') {
      // End current execution — webhook processor will allow a new trigger match
      if (message) {
        await this.messageService.logAndSendText(
          ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
          ctx.customerPhone, ctx.conversationId, message,
        );
      }
      return { action: 'end' };
    }

    if (mode === 'text') {
      // Send message and follow the single outgoing edge
      await this.messageService.logAndSendText(
        ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
        ctx.customerPhone, ctx.conversationId, message,
      );
      const nextEdge = outEdges[0];
      if (nextEdge) {
        return { action: 'continue', nextNodeId: nextEdge.to };
      }
      return { action: 'end' };
    }

    // Default: buttons mode — show configurable fallback options.
    // `buttons` may be a string OR an array (of strings / { title|text|label }).
    const rawButtons = node.config.buttons;
    let buttonLabels: string[];
    if (Array.isArray(rawButtons)) {
      buttonLabels = rawButtons
        .map((b: any) => (typeof b === 'string' ? b : (b?.title ?? b?.text ?? b?.label ?? b?.value ?? '')))
        .filter((l: string) => l && l.trim());
    } else {
      buttonLabels = (rawButtons || 'Main Menu\nRepeat\nContinue')
        .split('\n')
        .filter((l: string) => l.trim());
    }
    buttonLabels = buttonLabels.slice(0, 3);

    const buttons = buttonLabels.map((text: string, i: number) => ({
      id: `wf_fb_${node.id}_${i}`,
      title: text.trim().substring(0, 20),
    }));

    await this.messageService.logAndSendInteractiveButtons(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId, message, buttons,
    );

    // Store button mapping for resume routing
    ctx.variables._buttonMap = buttons.reduce((map: Record<string, string>, btn: any, i: number) => {
      map[btn.id] = outEdges[i]?.to || '';
      return map;
    }, {});

    return { action: 'wait', waitType: 'reply', waitConfig: { nodeId: node.id } };
  }
}
