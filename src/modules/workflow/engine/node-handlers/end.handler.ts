import { Injectable } from '@nestjs/common';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult } from '../workflow-engine.types';

@Injectable()
export class EndNodeHandler implements NodeHandler {
  readonly nodeType = 'end';

  async execute(): Promise<NodeExecutionResult> {
    return { action: 'end' };
  }
}
