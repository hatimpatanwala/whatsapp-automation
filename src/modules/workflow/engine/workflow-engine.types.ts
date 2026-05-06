/**
 * Core types for the Workflow Execution Engine.
 */

export interface ExecutionContext {
  executionId: string;
  workflowId: string;
  schema: string;
  tenant: {
    phoneNumberId: string;
    accessToken: string;
    schemaName: string;
    [key: string]: any;
  };
  conversationId: string;
  customerPhone: string;
  customerId: string;
  customerName?: string;
  variables: Record<string, any>;
  triggerData?: any;
  lastReply?: ReplyData;
}

export interface ReplyData {
  type: 'text' | 'button_reply' | 'list_reply' | 'media';
  text?: string;
  actionId?: string;
  actionTitle?: string;
  raw?: any;
}

export interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  description?: string;
  x: number;
  y: number;
  config: Record<string, any>;
  outputs?: string[];
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

export type NodeExecutionResult =
  | { action: 'continue'; nextNodeId: string }
  | { action: 'wait'; waitType: 'reply' | 'delay' | 'timeout'; waitConfig?: Record<string, any> }
  | { action: 'end' }
  | { action: 'error'; message: string };

export interface NodeHandler {
  readonly nodeType: string;
  execute(
    node: WorkflowNode,
    ctx: ExecutionContext,
    edges: WorkflowEdge[],
  ): Promise<NodeExecutionResult>;
}

/** Find the single outgoing edge (for nodes with one output). */
export function findNextEdge(edges: WorkflowEdge[], nodeId: string): WorkflowEdge | undefined {
  return edges.find((e) => e.from === nodeId);
}

/** Find an outgoing edge by label match. */
export function findEdgeByLabel(
  edges: WorkflowEdge[],
  nodeId: string,
  label: string,
): WorkflowEdge | undefined {
  const outEdges = edges.filter((e) => e.from === nodeId);
  return (
    outEdges.find((e) => e.label?.toLowerCase() === label.toLowerCase()) ||
    outEdges.find((e) => !e.label) // fallback: unlabeled default edge
  );
}
