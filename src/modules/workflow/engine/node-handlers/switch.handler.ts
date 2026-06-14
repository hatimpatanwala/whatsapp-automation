import { Injectable } from '@nestjs/common';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult } from '../workflow-engine.types';

@Injectable()
export class SwitchNodeHandler implements NodeHandler {
  readonly nodeType = 'switch';

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const variable = node.config.variable || 'button_reply';
    const outEdges = edges.filter((e) => e.from === node.id);

    let matchedEdge: WorkflowEdge | undefined;

    if (variable === 'button_reply' || variable === 'list_reply') {
      // Match the tapped button/list item against each edge's `condition` (the
      // button id, e.g. "browse") OR `label` (e.g. "Browse"), using both the
      // reply id and the reply title.
      const replyId = String(ctx.lastReply?.actionId ?? '').toLowerCase();
      const replyTitle = String(ctx.lastReply?.actionTitle ?? ctx.lastReply?.text ?? '').toLowerCase();
      const candidates = [replyId, replyTitle].filter(Boolean);
      matchedEdge = outEdges.find((e) => {
        const cond = String((e as any).condition ?? '').toLowerCase();
        const label = String(e.label ?? '').toLowerCase();
        return (cond && candidates.includes(cond)) || (label && candidates.includes(label));
      });
    } else {
      let matchValue: any = '';
      switch (variable) {
        case 'message_text':
          matchValue = ctx.lastReply?.text || '';
          break;
        case 'language':
          matchValue = ctx.variables.language || 'en';
          break;
        default:
          matchValue = ctx.variables[variable] || '';
      }
      const matchStr = String(matchValue ?? '').toLowerCase();
      matchedEdge = outEdges.find(
        (e) => (e.label && e.label.toLowerCase() === matchStr) || (String((e as any).condition ?? '').toLowerCase() === matchStr),
      );
    }

    // Fallback to a default edge with no label/condition
    const defaultEdge = outEdges.find((e) => !e.label && !(e as any).condition);
    const nextEdge = matchedEdge || defaultEdge;

    if (!nextEdge) return { action: 'end' };
    return { action: 'continue', nextNodeId: nextEdge.to };
  }
}
