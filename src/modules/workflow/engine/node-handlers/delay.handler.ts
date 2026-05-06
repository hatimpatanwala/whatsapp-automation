import { Injectable } from '@nestjs/common';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult } from '../workflow-engine.types';

@Injectable()
export class DelayNodeHandler implements NodeHandler {
  readonly nodeType = 'delay';

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const duration = node.config.duration || 5;
    const unit = node.config.unit || 'minutes';
    const delayMs = this.toMs(duration, unit);

    return {
      action: 'wait',
      waitType: 'delay',
      waitConfig: { nodeId: node.id, delayMs },
    };
  }

  private toMs(duration: number, unit: string): number {
    switch (unit) {
      case 'seconds': return duration * 1000;
      case 'minutes': return duration * 60 * 1000;
      case 'hours': return duration * 60 * 60 * 1000;
      default: return duration * 60 * 1000;
    }
  }
}
