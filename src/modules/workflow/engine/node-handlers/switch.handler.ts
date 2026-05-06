import { Injectable } from '@nestjs/common';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult } from '../workflow-engine.types';

@Injectable()
export class SwitchNodeHandler implements NodeHandler {
  readonly nodeType = 'switch';

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const variable = node.config.variable || 'button_reply';
    let matchValue = '';

    switch (variable) {
      case 'button_reply':
        matchValue = ctx.lastReply?.actionTitle || ctx.lastReply?.text || '';
        break;
      case 'list_reply':
        matchValue = ctx.lastReply?.actionTitle || ctx.lastReply?.text || '';
        break;
      case 'message_text':
        matchValue = ctx.lastReply?.text || '';
        break;
      case 'language':
        matchValue = ctx.variables.language || 'en';
        break;
      default:
        matchValue = ctx.variables[variable] || '';
    }

    // Find matching edge by label
    const outEdges = edges.filter((e) => e.from === node.id);
    const matchedEdge = outEdges.find(
      (e) => e.label && e.label.toLowerCase() === matchValue.toLowerCase(),
    );

    // Fallback to default edge (no label)
    const defaultEdge = outEdges.find((e) => !e.label);
    const nextEdge = matchedEdge || defaultEdge;

    if (!nextEdge) return { action: 'end' };
    return { action: 'continue', nextNodeId: nextEdge.to };
  }
}
