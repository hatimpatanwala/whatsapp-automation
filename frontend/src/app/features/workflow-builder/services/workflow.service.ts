import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import {
  WorkflowDefinition,
  WorkflowNodeData,
  WorkflowEdgeData,
  NODE_TYPE_DEFINITIONS,
  NodeTypeDefinition,
} from '../models/workflow.models';

@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private readonly api = inject(ApiService);
  private idCounter = 0;

  // === API Methods ===

  getAll(params?: { page?: number; limit?: number; status?: string; search?: string }): Observable<any> {
    return this.api.get('/workflows', params as any);
  }

  getById(id: string): Observable<any> {
    return this.api.get(`/workflows/${id}`);
  }

  create(data: { name: string; description?: string; trigger?: string }): Observable<any> {
    return this.api.post('/workflows', data);
  }

  update(id: string, data: { name?: string; description?: string }): Observable<any> {
    return this.api.patch(`/workflows/${id}`, data);
  }

  saveDefinition(id: string, data: { nodes: any[]; edges: any[]; trigger?: any }): Observable<any> {
    return this.api.put(`/workflows/${id}/definition`, data);
  }

  deleteWorkflow(id: string): Observable<any> {
    return this.api.delete(`/workflows/${id}`);
  }

  activate(id: string): Observable<any> {
    return this.api.post(`/workflows/${id}/activate`, {});
  }

  pause(id: string): Observable<any> {
    return this.api.post(`/workflows/${id}/pause`, {});
  }

  duplicate(id: string): Observable<any> {
    return this.api.post(`/workflows/${id}/duplicate`, {});
  }

  getExecutions(id: string, params?: { page?: number; limit?: number }): Observable<any> {
    return this.api.get(`/workflows/${id}/executions`, params as any);
  }

  // === Template / Local Methods ===

  /** Generate a unique node ID */
  generateNodeId(): string {
    return 'node_' + Date.now() + '_' + ++this.idCounter;
  }

  /** Generate a unique edge ID */
  generateEdgeId(): string {
    return 'edge_' + Date.now() + '_' + ++this.idCounter;
  }

  /** Get node type definition by type string */
  getNodeTypeDef(type: string): NodeTypeDefinition | undefined {
    return NODE_TYPE_DEFINITIONS.find(d => d.type === type);
  }

  /** Create a new node from a type definition at given position */
  createNode(typeDef: NodeTypeDefinition, x: number, y: number): WorkflowNodeData {
    const config: Record<string, any> = {};
    typeDef.configFields.forEach(f => {
      if (f.defaultValue !== undefined) config[f.key] = f.defaultValue;
    });
    return {
      id: this.generateNodeId(),
      type: typeDef.type,
      label: typeDef.label,
      description: typeDef.description,
      x,
      y,
      config,
      outputs: [],
    };
  }

  /** Create an edge between two nodes */
  createEdge(fromId: string, toId: string, label?: string): WorkflowEdgeData {
    return {
      id: this.generateEdgeId(),
      from: fromId,
      to: toId,
      label,
    };
  }

  /** Build template nodes for "Order Flow" */
  buildOrderFlowTemplate(): { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] } {
    const trigger = this.createNode(this.getNodeTypeDef('trigger_order')!, 300, 40);
    trigger.config['event'] = 'created';
    const sendConfirm = this.createNode(this.getNodeTypeDef('send_text')!, 300, 240);
    sendConfirm.label = 'Send Confirmation';
    sendConfirm.config['message'] = 'Thank you for your order, {{customer_name}}! Your order #{{order_number}} has been received.';
    const paymentQr = this.createNode(this.getNodeTypeDef('payment_qr')!, 300, 440);
    const waitReply = this.createNode(this.getNodeTypeDef('wait_for_reply')!, 300, 640);
    waitReply.config['timeoutMinutes'] = 30;
    const condition = this.createNode(this.getNodeTypeDef('condition')!, 300, 840);
    condition.label = 'Payment Received?';
    condition.config['variable'] = 'payment_status';
    condition.config['operator'] = 'eq';
    condition.config['value'] = 'verified';
    const confirmed = this.createNode(this.getNodeTypeDef('send_text')!, 560, 1050);
    confirmed.label = 'Order Confirmed';
    confirmed.config['message'] = 'Payment received! Your order is confirmed and being prepared.';
    const reminder = this.createNode(this.getNodeTypeDef('send_text')!, 40, 1050);
    reminder.label = 'Payment Reminder';
    reminder.config['message'] = 'Your payment is still pending. Please complete it to confirm your order.';
    const end = this.createNode(this.getNodeTypeDef('end')!, 300, 1260);

    const nodes = [trigger, sendConfirm, paymentQr, waitReply, condition, reminder, confirmed, end];
    const edges = [
      this.createEdge(trigger.id, sendConfirm.id),
      this.createEdge(sendConfirm.id, paymentQr.id),
      this.createEdge(paymentQr.id, waitReply.id),
      this.createEdge(waitReply.id, condition.id),
      this.createEdge(condition.id, reminder.id, 'No'),
      this.createEdge(condition.id, confirmed.id, 'Yes'),
      this.createEdge(reminder.id, end.id),
      this.createEdge(confirmed.id, end.id),
    ];
    return { nodes, edges };
  }

  /** Build template nodes for "Support Flow" */
  buildSupportFlowTemplate(): { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] } {
    const trigger = this.createNode(this.getNodeTypeDef('trigger_message')!, 300, 40);
    trigger.config['keywords'] = 'help, support, issue, problem';
    trigger.config['matchType'] = 'contains';
    const greet = this.createNode(this.getNodeTypeDef('send_buttons')!, 300, 240);
    greet.label = 'Support Menu';
    greet.config['body'] = 'How can we help you today?';
    greet.config['buttons'] = 'Order Issue\nProduct Question\nOther';
    const router = this.createNode(this.getNodeTypeDef('switch')!, 300, 440);
    router.config['variable'] = 'button_reply';
    const orderHelp = this.createNode(this.getNodeTypeDef('send_text')!, 40, 660);
    orderHelp.label = 'Order Help';
    orderHelp.config['message'] = 'Please share your order number and we\'ll look into it right away.';
    const productHelp = this.createNode(this.getNodeTypeDef('show_catalog')!, 300, 660);
    productHelp.label = 'Browse Products';
    const agent = this.createNode(this.getNodeTypeDef('assign_agent')!, 560, 660);
    agent.label = 'Connect to Agent';

    const nodes = [trigger, greet, router, orderHelp, productHelp, agent];
    const edges = [
      this.createEdge(trigger.id, greet.id),
      this.createEdge(greet.id, router.id),
      this.createEdge(router.id, orderHelp.id, 'Order Issue'),
      this.createEdge(router.id, productHelp.id, 'Product Question'),
      this.createEdge(router.id, agent.id, 'Other'),
    ];
    return { nodes, edges };
  }

  /** Build template nodes for "Sales Flow" */
  buildSalesFlowTemplate(): { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] } {
    const trigger = this.createNode(this.getNodeTypeDef('trigger_message')!, 300, 40);
    trigger.config['keywords'] = 'buy, shop, catalog, browse';
    trigger.config['matchType'] = 'contains';
    const greet = this.createNode(this.getNodeTypeDef('send_text')!, 300, 240);
    greet.label = 'Welcome';
    greet.config['message'] = 'Welcome to our store! Let me show you our latest products.';
    const catalog = this.createNode(this.getNodeTypeDef('show_catalog')!, 300, 440);
    const search = this.createNode(this.getNodeTypeDef('search_products')!, 300, 640);
    const addCart = this.createNode(this.getNodeTypeDef('add_to_cart')!, 300, 840);
    const checkout = this.createNode(this.getNodeTypeDef('checkout')!, 300, 1040);
    checkout.config['requireAddress'] = true;
    checkout.config['paymentMethod'] = 'choice';
    const end = this.createNode(this.getNodeTypeDef('end')!, 300, 1240);

    const nodes = [trigger, greet, catalog, search, addCart, checkout, end];
    const edges = [
      this.createEdge(trigger.id, greet.id),
      this.createEdge(greet.id, catalog.id),
      this.createEdge(catalog.id, search.id),
      this.createEdge(search.id, addCart.id),
      this.createEdge(addCart.id, checkout.id),
      this.createEdge(checkout.id, end.id),
    ];
    return { nodes, edges };
  }
}
