import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { map, of } from 'rxjs';
import {
  WorkflowDefinition,
  WorkflowNodeData,
  WorkflowEdgeData,
  NODE_TYPE_DEFINITIONS,
  NodeTypeDefinition,
  EntityType,
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

  saveDefinition(id: string, data: { nodes: any[]; edges: any[]; trigger?: any; status?: string }): Observable<any> {
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

  // === Entity dropdown options ===

  getEntityOptions(entityType: EntityType): Observable<{ label: string; value: string }[]> {
    switch (entityType) {
      case 'workflows':
        return this.api.get('/workflows', { limit: 100 }).pipe(
          map((res: any) => {
            const items = res?.data?.data || res?.data || [];
            return items.map((w: any) => ({ label: w.name, value: w.id }));
          }),
        );
      case 'templates':
        return this.api.get('/campaigns/templates').pipe(
          map((res: any) => {
            const items = res?.data || [];
            return items.map((t: any) => ({
              label: t.templateName || t.name,
              value: t.templateName || t.name,
            }));
          }),
        );
      case 'categories':
        return this.api.get('/categories').pipe(
          map((res: any) => {
            const items = res?.data || [];
            return items.map((c: any) => ({ label: c.name, value: c.id }));
          }),
        );
      default:
        return of([]);
    }
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

  /**
   * Create a fallback node pre-configured with a message and optional buttons.
   * Positions it below-right of the canvas.
   */
  createFallbackNode(x = 600, y = 500): WorkflowNodeData {
    const def = this.getNodeTypeDef('fallback')!;
    const node = this.createNode(def, x, y);
    node.label = 'Fallback Handler';
    node.config = {
      message: "Sorry, I didn't understand that. Please choose a valid option:",
      mode: 'buttons',
      buttons: 'Main Menu\nTalk to Support',
    };
    return node;
  }

  /**
   * Auto-adds a fallback node to a workflow if it doesn't have one.
   * Returns the updated nodes/edges arrays.
   */
  ensureFallback(nodes: WorkflowNodeData[], edges: WorkflowEdgeData[]): { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] } {
    if (nodes.find(n => n.type === 'fallback')) return { nodes, edges };
    // Find rightmost + bottommost node for positioning
    const maxX = Math.max(100, ...nodes.map(n => n.x));
    const maxY = Math.max(100, ...nodes.map(n => n.y));
    const fb = this.createFallbackNode(maxX + 200, maxY - 100);
    return { nodes: [...nodes, fb], edges };
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

  /** Build template nodes for "Welcome Flow" — greet new customers with main menu */
  buildWelcomeFlowTemplate(): { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] } {
    const trigger = this.createNode(this.getNodeTypeDef('trigger_message')!, 300, 40);
    trigger.config['keywords'] = 'hi, hello, hey, start, menu';
    trigger.config['matchType'] = 'contains';

    const greet = this.createNode(this.getNodeTypeDef('send_text')!, 300, 240);
    greet.label = 'Welcome Message';
    greet.config['message'] = 'Hello {{customer_name}}! Welcome to our store. How can we help you today?';

    const menu = this.createNode(this.getNodeTypeDef('send_buttons')!, 300, 440);
    menu.label = 'Main Menu';
    menu.config['body'] = 'Choose an option below:';
    menu.config['buttons'] = 'Browse Products\nTrack Order\nTalk to Support';

    const catalog = this.createNode(this.getNodeTypeDef('show_catalog')!, 40, 680);
    catalog.label = 'Browse Products';

    const trackOrder = this.createNode(this.getNodeTypeDef('send_text')!, 300, 680);
    trackOrder.label = 'Track Order';
    trackOrder.config['message'] = 'Please share your order number and we\'ll look it up for you.';

    const agent = this.createNode(this.getNodeTypeDef('assign_agent')!, 560, 680);
    agent.label = 'Connect Support';
    agent.config['message'] = 'Connecting you with our support team. Please wait...';

    const fallback = this.createNode(this.getNodeTypeDef('fallback')!, 560, 440);
    fallback.label = 'Invalid Input';
    fallback.config['message'] = "I didn't catch that. Please choose one of the options below:";
    fallback.config['mode'] = 'buttons';
    fallback.config['buttons'] = 'Main Menu\nTalk to Support';

    const end = this.createNode(this.getNodeTypeDef('end')!, 300, 900);

    const nodes = [trigger, greet, menu, catalog, trackOrder, agent, fallback, end];
    const edges = [
      this.createEdge(trigger.id, greet.id),
      this.createEdge(greet.id, menu.id),
      this.createEdge(menu.id, catalog.id, 'Browse Products'),
      this.createEdge(menu.id, trackOrder.id, 'Track Order'),
      this.createEdge(menu.id, agent.id, 'Talk to Support'),
      this.createEdge(catalog.id, end.id),
      this.createEdge(trackOrder.id, end.id),
      this.createEdge(agent.id, end.id),
      this.createEdge(fallback.id, menu.id, 'Main Menu'),
      this.createEdge(fallback.id, agent.id, 'Talk to Support'),
    ];
    return { nodes, edges };
  }

  /** Build template nodes for "Appointment Booking Flow" */
  buildAppointmentFlowTemplate(): { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] } {
    const trigger = this.createNode(this.getNodeTypeDef('trigger_message')!, 300, 40);
    trigger.config['keywords'] = 'book, appointment, schedule, visit';
    trigger.config['matchType'] = 'contains';

    const greet = this.createNode(this.getNodeTypeDef('send_text')!, 300, 240);
    greet.label = 'Booking Intro';
    greet.config['message'] = 'Let\'s schedule your appointment! I\'ll need a few details from you.';

    const askService = this.createNode(this.getNodeTypeDef('send_buttons')!, 300, 440);
    askService.label = 'Select Service';
    askService.config['body'] = 'Which service would you like to book?';
    askService.config['buttons'] = 'Consultation\nFollow-up\nGeneral Visit';

    const askDate = this.createNode(this.getNodeTypeDef('send_text')!, 300, 640);
    askDate.label = 'Ask Date';
    askDate.config['message'] = 'Great! Please tell us your preferred date and time (e.g., "Monday 3 PM").';

    const waitDate = this.createNode(this.getNodeTypeDef('wait_for_reply')!, 300, 840);
    waitDate.config['timeoutMinutes'] = 30;
    waitDate.config['timeoutMessage'] = 'Your booking session has expired. Type "book" to start again.';

    const confirm = this.createNode(this.getNodeTypeDef('send_buttons')!, 300, 1040);
    confirm.label = 'Confirm Booking';
    confirm.config['body'] = 'You\'ve requested a {{last_input}} appointment. Shall I confirm?';
    confirm.config['buttons'] = 'Confirm\nChange Date\nCancel';

    const confirmed = this.createNode(this.getNodeTypeDef('send_text')!, 40, 1260);
    confirmed.label = 'Booking Confirmed';
    confirmed.config['message'] = 'Your appointment is confirmed! We\'ll send you a reminder before your visit. Thank you!';

    const tagVip = this.createNode(this.getNodeTypeDef('tag_customer')!, 40, 1460);
    tagVip.label = 'Tag as Booked';
    tagVip.config['action'] = 'add';
    tagVip.config['tag'] = 'appointment_booked';

    const cancelled = this.createNode(this.getNodeTypeDef('send_text')!, 560, 1260);
    cancelled.label = 'Booking Cancelled';
    cancelled.config['message'] = 'No problem! Your booking has been cancelled. You can book again anytime by typing "book".';

    const end = this.createNode(this.getNodeTypeDef('end')!, 300, 1660);

    const nodes = [trigger, greet, askService, askDate, waitDate, confirm, confirmed, tagVip, cancelled, end];
    const edges = [
      this.createEdge(trigger.id, greet.id),
      this.createEdge(greet.id, askService.id),
      this.createEdge(askService.id, askDate.id),
      this.createEdge(askDate.id, waitDate.id),
      this.createEdge(waitDate.id, confirm.id),
      this.createEdge(confirm.id, confirmed.id, 'Confirm'),
      this.createEdge(confirm.id, askDate.id, 'Change Date'),
      this.createEdge(confirm.id, cancelled.id, 'Cancel'),
      this.createEdge(confirmed.id, tagVip.id),
      this.createEdge(tagVip.id, end.id),
      this.createEdge(cancelled.id, end.id),
    ];
    return { nodes, edges };
  }

  /** Build template nodes for "Feedback Collection Flow" */
  buildFeedbackFlowTemplate(): { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] } {
    const trigger = this.createNode(this.getNodeTypeDef('trigger_order')!, 300, 40);
    trigger.config['event'] = 'delivered';

    const delay = this.createNode(this.getNodeTypeDef('delay')!, 300, 240);
    delay.label = 'Wait 1 Hour';
    delay.config['duration'] = 1;
    delay.config['unit'] = 'hours';

    const askRating = this.createNode(this.getNodeTypeDef('send_buttons')!, 300, 440);
    askRating.label = 'Ask Rating';
    askRating.config['body'] = 'Hi {{customer_name}}! Your order has been delivered. How was your experience?';
    askRating.config['buttons'] = 'Excellent\nGood\nPoor';

    const thankYou = this.createNode(this.getNodeTypeDef('send_text')!, 40, 680);
    thankYou.label = 'Thank You';
    thankYou.config['message'] = 'Thank you for the wonderful feedback! We appreciate your business.';

    const tagHappy = this.createNode(this.getNodeTypeDef('tag_customer')!, 40, 880);
    tagHappy.label = 'Tag Happy Customer';
    tagHappy.config['action'] = 'add';
    tagHappy.config['tag'] = 'satisfied';

    const askIssue = this.createNode(this.getNodeTypeDef('send_text')!, 560, 680);
    askIssue.label = 'Ask Issue Details';
    askIssue.config['message'] = 'We\'re sorry to hear that. Could you tell us what went wrong? Our team will look into it.';

    const waitIssue = this.createNode(this.getNodeTypeDef('wait_for_reply')!, 560, 880);
    waitIssue.config['timeoutMinutes'] = 120;

    const assignAgent = this.createNode(this.getNodeTypeDef('assign_agent')!, 560, 1080);
    assignAgent.label = 'Escalate to Support';
    assignAgent.config['message'] = 'Your feedback has been noted. A support agent will follow up shortly.';

    const end = this.createNode(this.getNodeTypeDef('end')!, 300, 1280);

    const nodes = [trigger, delay, askRating, thankYou, tagHappy, askIssue, waitIssue, assignAgent, end];
    const edges = [
      this.createEdge(trigger.id, delay.id),
      this.createEdge(delay.id, askRating.id),
      this.createEdge(askRating.id, thankYou.id, 'Excellent'),
      this.createEdge(askRating.id, thankYou.id, 'Good'),
      this.createEdge(askRating.id, askIssue.id, 'Poor'),
      this.createEdge(thankYou.id, tagHappy.id),
      this.createEdge(tagHappy.id, end.id),
      this.createEdge(askIssue.id, waitIssue.id),
      this.createEdge(waitIssue.id, assignAgent.id),
      this.createEdge(assignAgent.id, end.id),
    ];
    return { nodes, edges };
  }

  /** Build template nodes for "Abandoned Cart Recovery Flow" */
  buildAbandonedCartFlowTemplate(): { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] } {
    const trigger = this.createNode(this.getNodeTypeDef('trigger_schedule')!, 300, 40);
    trigger.config['schedule'] = 'daily';
    trigger.config['time'] = '10:00';

    const reminder = this.createNode(this.getNodeTypeDef('send_text')!, 300, 240);
    reminder.label = 'Cart Reminder';
    reminder.config['message'] = 'Hi {{customer_name}}! You have items in your cart. Would you like to complete your purchase?';

    const buttons = this.createNode(this.getNodeTypeDef('send_buttons')!, 300, 440);
    buttons.label = 'Recovery Options';
    buttons.config['body'] = 'Your cart is waiting for you!';
    buttons.config['buttons'] = 'View Cart\nClear Cart\nNot Now';

    const viewCart = this.createNode(this.getNodeTypeDef('view_cart')!, 40, 680);
    viewCart.label = 'Show Cart';

    const checkout = this.createNode(this.getNodeTypeDef('checkout')!, 40, 900);
    checkout.config['requireAddress'] = true;
    checkout.config['paymentMethod'] = 'choice';

    const dismiss = this.createNode(this.getNodeTypeDef('send_text')!, 560, 680);
    dismiss.label = 'Dismiss';
    dismiss.config['message'] = 'No worries! Your cart will be saved for later. Just type "cart" anytime to view it.';

    const end = this.createNode(this.getNodeTypeDef('end')!, 300, 1100);

    const nodes = [trigger, reminder, buttons, viewCart, checkout, dismiss, end];
    const edges = [
      this.createEdge(trigger.id, reminder.id),
      this.createEdge(reminder.id, buttons.id),
      this.createEdge(buttons.id, viewCart.id, 'View Cart'),
      this.createEdge(buttons.id, dismiss.id, 'Clear Cart'),
      this.createEdge(buttons.id, dismiss.id, 'Not Now'),
      this.createEdge(viewCart.id, checkout.id),
      this.createEdge(checkout.id, end.id),
      this.createEdge(dismiss.id, end.id),
    ];
    return { nodes, edges };
  }

  /** Build template nodes for "Order Tracking Flow" */
  buildOrderTrackingFlowTemplate(): { nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] } {
    const trigger = this.createNode(this.getNodeTypeDef('trigger_message')!, 300, 40);
    trigger.config['keywords'] = 'track, status, order, where';
    trigger.config['matchType'] = 'contains';

    const askOrder = this.createNode(this.getNodeTypeDef('send_text')!, 300, 240);
    askOrder.label = 'Ask Order Number';
    askOrder.config['message'] = 'Please share your order number so I can look it up for you.';

    const waitOrder = this.createNode(this.getNodeTypeDef('wait_for_reply')!, 300, 440);
    waitOrder.config['timeoutMinutes'] = 15;
    waitOrder.config['timeoutMessage'] = 'Session timed out. Type "track" to try again.';

    const condition = this.createNode(this.getNodeTypeDef('condition')!, 300, 640);
    condition.label = 'Order Found?';
    condition.config['variable'] = 'order_status';
    condition.config['operator'] = 'neq';
    condition.config['value'] = '';

    const statusMsg = this.createNode(this.getNodeTypeDef('send_text')!, 40, 880);
    statusMsg.label = 'Show Status';
    statusMsg.config['message'] = 'Your order status: {{order_status}}. Expected delivery: {{delivery_date}}.';

    const followUp = this.createNode(this.getNodeTypeDef('send_buttons')!, 40, 1080);
    followUp.label = 'More Help?';
    followUp.config['body'] = 'Anything else you need?';
    followUp.config['buttons'] = 'Track Another\nTalk to Agent\nDone';

    const notFound = this.createNode(this.getNodeTypeDef('send_text')!, 560, 880);
    notFound.label = 'Not Found';
    notFound.config['message'] = 'Sorry, we couldn\'t find that order. Please check the order number and try again.';

    const end = this.createNode(this.getNodeTypeDef('end')!, 300, 1300);

    const nodes = [trigger, askOrder, waitOrder, condition, statusMsg, followUp, notFound, end];
    const edges = [
      this.createEdge(trigger.id, askOrder.id),
      this.createEdge(askOrder.id, waitOrder.id),
      this.createEdge(waitOrder.id, condition.id),
      this.createEdge(condition.id, statusMsg.id, 'Yes'),
      this.createEdge(condition.id, notFound.id, 'No'),
      this.createEdge(statusMsg.id, followUp.id),
      this.createEdge(followUp.id, askOrder.id, 'Track Another'),
      this.createEdge(followUp.id, end.id, 'Done'),
      this.createEdge(notFound.id, askOrder.id),
    ];
    return { nodes, edges };
  }
}
