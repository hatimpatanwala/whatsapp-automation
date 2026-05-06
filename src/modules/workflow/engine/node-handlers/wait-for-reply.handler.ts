import { Injectable } from '@nestjs/common';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult } from '../workflow-engine.types';

@Injectable()
export class WaitForReplyNodeHandler implements NodeHandler {
  readonly nodeType = 'wait_for_reply';

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const timeoutMinutes = node.config.timeoutMinutes || 60;
    const timeoutMessage = node.config.timeoutMessage || '';

    return {
      action: 'wait',
      waitType: 'reply',
      waitConfig: { nodeId: node.id, timeoutMinutes, timeoutMessage },
    };
  }
}
