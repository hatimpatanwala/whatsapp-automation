import { Injectable, Logger } from '@nestjs/common';
import { NodeHandler, WorkflowNode, WorkflowEdge, ExecutionContext, NodeExecutionResult, findEdgeByLabel } from '../workflow-engine.types';
import { resolveTemplate } from '../template-resolver';

@Injectable()
export class HttpRequestNodeHandler implements NodeHandler {
  readonly nodeType = 'http_request';
  private readonly logger = new Logger(HttpRequestNodeHandler.name);

  async execute(node: WorkflowNode, ctx: ExecutionContext, edges: WorkflowEdge[]): Promise<NodeExecutionResult> {
    const method = node.config.method || 'GET';
    const url = resolveTemplate(node.config.url || '', ctx);

    if (!url) return { action: 'error', message: 'http_request: no URL configured' };

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
      });

      const body = await response.text();
      let parsed: any;
      try { parsed = JSON.parse(body); } catch { parsed = body; }

      ctx.variables.http_status = response.status;
      ctx.variables.http_response = parsed;

      const success = response.ok;
      const edge = findEdgeByLabel(edges, node.id, success ? 'Success' : 'Failure');
      return edge ? { action: 'continue', nextNodeId: edge.to } : { action: 'end' };
    } catch (err: any) {
      this.logger.error(`HTTP request failed: ${err.message}`);
      ctx.variables.http_error = err.message;
      const failEdge = findEdgeByLabel(edges, node.id, 'Failure');
      if (failEdge) return { action: 'continue', nextNodeId: failEdge.to };
      return { action: 'error', message: `http_request failed: ${err.message}` };
    }
  }
}
