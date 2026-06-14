import { Injectable } from '@nestjs/common';
import { WhatsAppMessageService } from '../../../whatsapp/whatsapp-message.service';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

@Injectable()
export class SendButtonsNodeHandler implements NodeHandler {
  readonly nodeType = 'send_buttons';

  constructor(private readonly messageService: WhatsAppMessageService) {}

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    // Builder/templates use `message`; some configs use `body`/`text`.
    const body = resolveTemplate(node.config.body || node.config.message || node.config.text || '', ctx);

    // `buttons` may be a newline-separated string OR an array (of strings or
    // objects like { id, title|text|label }). Normalize to { id?, title } defs,
    // preserving the config button id so downstream routing (switch on
    // `condition`) can match it.
    const rawButtons = node.config.buttons;
    let buttonDefs: { id?: string; title: string }[];
    if (Array.isArray(rawButtons)) {
      buttonDefs = rawButtons
        .map((b: any) =>
          typeof b === 'string'
            ? { title: b }
            : { id: b?.id, title: String(b?.title ?? b?.text ?? b?.label ?? b?.value ?? '') },
        )
        .filter((b) => b.title && b.title.trim());
    } else if (typeof rawButtons === 'string') {
      buttonDefs = rawButtons.split('\n').filter((l: string) => l.trim()).map((l) => ({ title: l }));
    } else {
      buttonDefs = [];
    }

    if (!body || buttonDefs.length === 0) {
      return { action: 'error', message: 'send_buttons: body or buttons not configured' };
    }

    // WhatsApp allows max 3 buttons. Keep the config id (e.g. "browse") so the
    // reply id matches; fall back to a generated id.
    const outEdges = edges.filter((e) => e.from === node.id);
    const buttons = buttonDefs.slice(0, 3).map((b, i: number) => ({
      id: b.id || `wf_btn_${node.id}_${i}`,
      title: b.title.trim().substring(0, 20),
    }));

    await this.messageService.logAndSendInteractiveButtons(
      ctx.schema, ctx.tenant.phoneNumberId, ctx.tenant.accessToken,
      ctx.customerPhone, ctx.conversationId, body, buttons,
    );

    // Map each button to its resume target. When this node fans out to multiple
    // labeled edges, route per-button by index; when it goes to a single next
    // node (e.g. a switch/router), route ALL buttons there so the next node decides.
    ctx.variables._buttonMap = buttons.reduce((map: Record<string, string>, btn: any, i: number) => {
      map[btn.id] = outEdges[i]?.to || outEdges[0]?.to || '';
      return map;
    }, {});

    return { action: 'wait', waitType: 'reply', waitConfig: { nodeId: node.id } };
  }
}
