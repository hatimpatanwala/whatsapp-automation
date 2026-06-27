import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../config/redis.module';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { QUEUE_WORKFLOW_RESUME } from '../../../queue/queue.module';
import {
  ExecutionContext,
  WorkflowNode,
  WorkflowEdge,
  NodeHandler,
  NodeExecutionResult,
  ReplyData,
} from './workflow-engine.types';

// Import all node handlers
import {
  SendTextNodeHandler,
  SendButtonsNodeHandler,
  SendListNodeHandler,
  SendImageNodeHandler,
  SendTemplateNodeHandler,
  ConditionNodeHandler,
  SwitchNodeHandler,
  WaitForReplyNodeHandler,
  DelayNodeHandler,
  EndNodeHandler,
  ShowCatalogNodeHandler,
  AddToCartNodeHandler,
  ViewCartNodeHandler,
  CheckoutNodeHandler,
  InventoryCheckNodeHandler,
  SearchProductsNodeHandler,
  FilterProductsNodeHandler,
  PaymentQrNodeHandler,
  TagCustomerNodeHandler,
  UpdateOrderNodeHandler,
  AssignAgentNodeHandler,
  HttpRequestNodeHandler,
  SetLanguageNodeHandler,
  FallbackNodeHandler,
  StartWorkflowNodeHandler,
  SendQuoteNodeHandler,
  UpdateQuoteNodeHandler,
  MyOrdersNodeHandler,
  TrackOrderNodeHandler,
  ProductCardNodeHandler,
  OrderDetailsNodeHandler,
  PaymentReceiptNodeHandler,
  ShowOffersNodeHandler,
} from './node-handlers';

const MAX_STEPS = 50;
const LOCK_TTL = 30; // seconds

@Injectable()
export class WorkflowExecutionEngine {
  private readonly logger = new Logger(WorkflowExecutionEngine.name);
  private readonly handlerMap: Map<string, NodeHandler>;

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(QUEUE_WORKFLOW_RESUME) private readonly resumeQueue: Queue,
    // Inject all node handlers
    sendText: SendTextNodeHandler,
    sendButtons: SendButtonsNodeHandler,
    sendList: SendListNodeHandler,
    sendImage: SendImageNodeHandler,
    sendTemplate: SendTemplateNodeHandler,
    condition: ConditionNodeHandler,
    switchHandler: SwitchNodeHandler,
    waitForReply: WaitForReplyNodeHandler,
    delay: DelayNodeHandler,
    end: EndNodeHandler,
    showCatalog: ShowCatalogNodeHandler,
    addToCart: AddToCartNodeHandler,
    viewCart: ViewCartNodeHandler,
    checkout: CheckoutNodeHandler,
    inventoryCheck: InventoryCheckNodeHandler,
    searchProducts: SearchProductsNodeHandler,
    filterProducts: FilterProductsNodeHandler,
    paymentQr: PaymentQrNodeHandler,
    tagCustomer: TagCustomerNodeHandler,
    updateOrder: UpdateOrderNodeHandler,
    assignAgent: AssignAgentNodeHandler,
    httpRequest: HttpRequestNodeHandler,
    setLanguage: SetLanguageNodeHandler,
    fallback: FallbackNodeHandler,
    startWorkflow: StartWorkflowNodeHandler,
    sendQuote: SendQuoteNodeHandler,
    updateQuote: UpdateQuoteNodeHandler,
    myOrders: MyOrdersNodeHandler,
    trackOrder: TrackOrderNodeHandler,
    productCard: ProductCardNodeHandler,
    orderDetails: OrderDetailsNodeHandler,
    paymentReceipt: PaymentReceiptNodeHandler,
    showOffers: ShowOffersNodeHandler,
  ) {
    const handlers: NodeHandler[] = [
      sendText, sendButtons, sendList, sendImage, sendTemplate,
      condition, switchHandler, waitForReply, delay, end,
      showCatalog, addToCart, viewCart, checkout, inventoryCheck,
      searchProducts, filterProducts, paymentQr,
      tagCustomer, updateOrder, assignAgent, httpRequest, setLanguage,
      fallback, startWorkflow, sendQuote, updateQuote, myOrders, trackOrder, productCard,
      orderDetails, paymentReceipt, showOffers,
    ];
    this.handlerMap = new Map(handlers.map((h) => [h.nodeType, h]));
  }

  // ─── Find active execution (waiting or running) for a customer ───────────
  // Only returns executions with activity within the last 1 hour.
  // Stale executions are automatically timed out inline — no cron needed.
  async findActiveExecution(schema: string, customerPhone: string): Promise<any | null> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `SELECT * FROM workflow_executions
         WHERE customer_phone = $1 AND status IN ('waiting', 'running')
         ORDER BY started_at DESC LIMIT 1`,
        [customerPhone],
      );
      const execution = rows[0] || null;
      if (!execution) return null;

      const lastActivity = new Date(execution.last_activity_at || execution.started_at);
      const elapsed = Date.now() - lastActivity.getTime();
      const ONE_HOUR = 60 * 60 * 1000;
      const TWO_MINUTES = 2 * 60 * 1000;

      // 1-hour inactivity timeout for any execution
      if (elapsed > ONE_HOUR) {
        await qr.query(
          `UPDATE workflow_executions
           SET status = 'timed_out', error_message = 'Session expired (1 hour inactivity)', completed_at = NOW()
           WHERE id = $1`,
          [execution.id],
        );
        this.logger.log(`Expired stale execution ${execution.id} for ${customerPhone} (inactive ${Math.round(elapsed / 60000)}min)`);
        return null;
      }

      // 'running' executions normally complete in seconds. If still 'running' after 2 min, it crashed.
      if (execution.status === 'running' && elapsed > TWO_MINUTES) {
        await qr.query(
          `UPDATE workflow_executions
           SET status = 'failed', error_message = 'Execution stuck in running state', completed_at = NOW()
           WHERE id = $1`,
          [execution.id],
        );
        this.logger.warn(`Cleaned up stuck running execution ${execution.id} for ${customerPhone} (${Math.round(elapsed / 1000)}s old)`);
        return null;
      }

      return execution;
    });
  }

  /**
   * Find a recently completed/timed-out execution for this customer (within last 24 hours).
   * Used to restart a workflow when customer sends a message after their session expired.
   */
  async findRecentExpiredExecution(schema: string, customerPhone: string): Promise<any | null> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `SELECT we.workflow_id, we.completed_at, w.status as workflow_status
         FROM workflow_executions we
         JOIN workflows w ON w.id = we.workflow_id
         WHERE we.customer_phone = $1
           AND we.status IN ('completed', 'timed_out')
           AND we.completed_at > NOW() - INTERVAL '24 hours'
           AND w.status = 'active'
         ORDER BY we.completed_at DESC LIMIT 1`,
        [customerPhone],
      );
      return rows[0] || null;
    });
  }

  /**
   * Find the trigger node of a workflow (to restart it from the beginning).
   */
  async findWorkflowTriggerNode(schema: string, workflowId: string): Promise<{ triggerNodeId: string } | null> {
    return this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(`SELECT nodes FROM workflows WHERE id = $1`, [workflowId]);
      if (!rows[0]) return null;
      const nodes: WorkflowNode[] = rows[0].nodes || [];
      const trigger = nodes.find((n) => n.type.startsWith('trigger_'));
      return trigger ? { triggerNodeId: trigger.id } : null;
    });
  }

  // ─── Start a new workflow execution ──────────────────────────────────────
  async startExecution(params: {
    schema: string;
    tenant: any;
    workflowId: string;
    triggerNodeId: string;
    conversationId: string;
    customerPhone: string;
    customerId: string;
    customerName?: string;
    triggerData?: any;
  }): Promise<string> {
    const { schema, tenant, workflowId, triggerNodeId, conversationId, customerPhone, customerId, customerName, triggerData } = params;

    // Load workflow definition
    const workflow = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(`SELECT * FROM workflows WHERE id = $1`, [workflowId]);
      return rows[0];
    });

    if (!workflow) {
      this.logger.error(`Workflow ${workflowId} not found`);
      return '';
    }

    const nodes: WorkflowNode[] = workflow.nodes || [];
    const allEdges: WorkflowEdge[] = workflow.edges || [];

    // Find the first node after the trigger
    const triggerEdge = allEdges.find((e) => e.from === triggerNodeId);
    if (!triggerEdge) {
      this.logger.error(`No edge leaving trigger node ${triggerNodeId}`);
      return '';
    }

    // Create execution record
    const executionId = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `INSERT INTO workflow_executions
         (workflow_id, triggered_by, status, current_node_id, conversation_id, customer_phone, variables, context)
         VALUES ($1, $2, 'running', $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          workflowId, customerPhone, triggerEdge.to, conversationId, customerPhone,
          JSON.stringify({ ...(triggerData || {}), customer_id: customerId || '', customer_name: customerName || '', customer_phone: customerPhone }),
          JSON.stringify({ triggerData }),
        ],
      );
      // Increment workflow execution count
      await qr.query(
        `UPDATE workflows SET execution_count = execution_count + 1, last_executed_at = NOW() WHERE id = $1`,
        [workflowId],
      );
      return rows[0].id;
    });

    // Build execution context
    const ctx: ExecutionContext = {
      executionId,
      workflowId,
      schema,
      tenant,
      conversationId,
      customerPhone,
      customerId,
      customerName,
      variables: { ...(triggerData || {}), customer_id: customerId || '', customer_name: customerName || '', customer_phone: customerPhone },
      triggerData,
    };

    // Run the execution loop
    await this.runLoop(ctx, nodes, allEdges, triggerEdge.to);

    return executionId;
  }

  // ─── Resume a paused execution ───────────────────────────────────────────
  async resumeExecution(params: {
    schema: string;
    executionId: string;
    reply?: ReplyData;
    resumeSource: 'message' | 'delay' | 'timeout';
    tenant?: any;
  }): Promise<void> {
    const { schema, executionId, reply, resumeSource } = params;

    // Acquire Redis lock to prevent concurrent resumes
    const lockKey = `wf:exec:lock:${schema}:${executionId}`;
    const acquired = await this.redis.set(lockKey, '1', 'EX', LOCK_TTL, 'NX');
    if (!acquired) {
      this.logger.warn(`Execution ${executionId} is already being resumed`);
      return;
    }

    try {
      // Load execution
      const execution = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
        const rows = await qr.query(
          `SELECT we.*, w.nodes, w.edges FROM workflow_executions we
           JOIN workflows w ON we.workflow_id = w.id
           WHERE we.id = $1`,
          [executionId],
        );
        return rows[0];
      });

      if (!execution || execution.status !== 'waiting') {
        this.logger.debug(`Execution ${executionId} is not in waiting state, skipping resume`);
        return;
      }

      // Cancel pending timeout/delay job if resuming from a message
      if (resumeSource === 'message' && execution.resume_job_id) {
        try {
          const job = await this.resumeQueue.getJob(execution.resume_job_id);
          if (job) await job.remove();
        } catch {
          // Job may already be processed — that's fine
        }
      }

      const nodes: WorkflowNode[] = execution.nodes || [];
      const allEdges: WorkflowEdge[] = execution.edges || [];
      const currentNodeId = execution.current_node_id;
      const variables = execution.variables || {};
      const waitConfig = execution.wait_config || {};

      // Resolve tenant if not passed (for queue-based resumes)
      let tenant = params.tenant;
      if (!tenant) {
        tenant = await this.connectionManager.executeGlobal(async (qr) => {
          const rows = await qr.query(
            `SELECT * FROM tenants WHERE schema_name = $1`,
            [schema],
          );
          return rows[0];
        });
      }

      // Recover the customer id if it wasn't persisted (older in-flight
      // executions, or flows started before we stored it). Cart / order nodes
      // need a real UUID — an empty string crashes their queries.
      let resolvedCustomerId = variables.customer_id || '';
      if (!resolvedCustomerId && execution.customer_phone) {
        const phone = execution.customer_phone;
        const cust = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
          const rows = await qr.query(
            `SELECT id FROM customers WHERE phone = $1 OR phone = $2 LIMIT 1`,
            [phone, phone.startsWith('+') ? phone.slice(1) : `+${phone}`],
          );
          return rows[0];
        });
        if (cust?.id) {
          resolvedCustomerId = cust.id;
          variables.customer_id = cust.id;
        }
      }

      // Build execution context
      const ctx: ExecutionContext = {
        executionId,
        workflowId: execution.workflow_id,
        schema,
        tenant: {
          phoneNumberId: tenant?.phone_number_id || tenant?.phoneNumberId,
          accessToken: tenant?.access_token || tenant?.accessToken,
          schemaName: schema,
          ...tenant,
        },
        conversationId: execution.conversation_id,
        customerPhone: execution.customer_phone,
        customerId: resolvedCustomerId,
        customerName: variables.customer_name,
        variables,
        lastReply: reply,
      };

      // Determine next node based on resume source
      let nextNodeId: string | null = null;

      if (resumeSource === 'delay') {
        // Delay completed — follow the single outgoing edge
        const edge = allEdges.find((e) => e.from === currentNodeId);
        nextNodeId = edge?.to || null;
      } else if (resumeSource === 'timeout') {
        // Timeout — follow timeout edge or send timeout message and end
        const timeoutEdge = allEdges.find(
          (e) => e.from === currentNodeId && e.label?.toLowerCase() === 'timeout',
        );
        if (timeoutEdge) {
          nextNodeId = timeoutEdge.to;
        } else {
          // No timeout edge — send timeout message if configured and end
          if (waitConfig.timeoutMessage && tenant) {
            const { WhatsAppMessageService } = await import('../../whatsapp/whatsapp-message.service');
            // We can't easily DI here, so just end — the timeout message will be handled by caller
          }
          await this.completeExecution(ctx, 0, 'timeout');
          return;
        }
      } else {
        // Message resume — route based on reply
        nextNodeId = this.resolveReplyRoute(currentNodeId, nodes, allEdges, ctx);
      }

      if (!nextNodeId) {
        await this.completeExecution(ctx, execution.steps_executed || 0);
        return;
      }

      // Mark as running again
      await this.connectionManager.executeInTenantContext(schema, async (qr) => {
        await qr.query(
          `UPDATE workflow_executions SET status = 'running', wait_type = NULL, wait_config = '{}', resume_job_id = NULL WHERE id = $1`,
          [executionId],
        );
      });

      // Continue the loop
      await this.runLoop(ctx, nodes, allEdges, nextNodeId);
    } finally {
      await this.redis.del(lockKey);
    }
  }

  // ─── The synchronous execution loop ──────────────────────────────────────
  private async runLoop(
    ctx: ExecutionContext,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    startNodeId: string,
  ): Promise<void> {
    let currentNodeId: string | null = startNodeId;
    let stepsExecuted = 0;

    while (currentNodeId && stepsExecuted < MAX_STEPS) {
      const node = nodes.find((n) => n.id === currentNodeId);
      if (!node) {
        await this.failExecution(ctx, `Node not found: ${currentNodeId}`);
        return;
      }

      const handler = this.handlerMap.get(node.type);
      if (!handler) {
        // Skip unknown node types (e.g., trigger nodes that enter the loop)
        if (node.type.startsWith('trigger_')) {
          const edge = edges.find((e) => e.from === currentNodeId);
          currentNodeId = edge?.to || null;
          continue;
        }
        await this.failExecution(ctx, `No handler for node type: ${node.type}`);
        return;
      }

      // Update position in DB
      await this.updateExecutionPosition(ctx, currentNodeId!, stepsExecuted);

      // Get outgoing edges for this node
      const outEdges = edges.filter((e) => e.from === currentNodeId);

      // Execute the node
      let result: NodeExecutionResult;
      try {
        result = await handler.execute(node, ctx, outEdges);
      } catch (err: any) {
        this.logger.error(`Node ${node.type}(${node.id}) execution failed: ${err.message}`);
        await this.failExecution(ctx, `Node ${node.type} failed: ${err.message}`);
        return;
      }
      stepsExecuted++;

      switch (result.action) {
        case 'continue':
          currentNodeId = result.nextNodeId;
          break;

        case 'wait':
          await this.pauseExecution(ctx, currentNodeId!, result.waitType, result.waitConfig || {});
          return;

        case 'end':
          await this.completeExecution(ctx, stepsExecuted);
          return;

        case 'start_workflow':
          // Complete current execution, then chain into the target workflow
          await this.completeExecution(ctx, stepsExecuted, 'chained');
          await this.chainWorkflow(ctx, result.targetWorkflowId, result.passVariables);
          return;

        case 'error':
          await this.failExecution(ctx, result.message);
          return;
      }
    }

    if (stepsExecuted >= MAX_STEPS) {
      await this.failExecution(ctx, 'Max steps exceeded (possible infinite loop)');
    } else {
      // Ran out of nodes — natural end
      await this.completeExecution(ctx, stepsExecuted);
    }
  }

  // ─── Route a reply to the correct next node ─────────────────────────────
  private resolveReplyRoute(
    currentNodeId: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    ctx: ExecutionContext,
  ): string | null {
    const outEdges = edges.filter((e) => e.from === currentNodeId);

    // If there's a stored _buttonMap from send_buttons/view_cart, use it
    if (ctx.variables._buttonMap && ctx.lastReply?.actionId) {
      const targetNodeId = ctx.variables._buttonMap[ctx.lastReply.actionId];
      if (targetNodeId) {
        delete ctx.variables._buttonMap; // Clean up
        return targetNodeId;
      }
    }

    // Try to match reply against edge labels
    const replyText = ctx.lastReply?.actionTitle || ctx.lastReply?.text || '';
    if (replyText) {
      const matchedEdge = outEdges.find(
        (e) => e.label && e.label.toLowerCase() === replyText.toLowerCase(),
      );
      if (matchedEdge) return matchedEdge.to;
    }

    // Extract product/category ID from list reply. A product/category pick is a
    // VALID, handled selection — follow the node's normal next edge (e.g. into a
    // product card) instead of dropping into the fallback / dead-ending.
    if (ctx.lastReply?.actionId) {
      const actionId = ctx.lastReply.actionId;
      if (actionId.startsWith('wf_prod_')) {
        ctx.variables.selected_product_id = actionId.replace('wf_prod_', '');
        if (outEdges[0]) return outEdges[0].to;
      } else if (actionId.startsWith('wf_cat_')) {
        ctx.variables.selected_category_id = actionId.replace('wf_cat_', '');
        if (outEdges[0]) return outEdges[0].to;
      } else if (actionId.startsWith('wf_brand_')) {
        ctx.variables.selected_brand_id = actionId.replace('wf_brand_', '');
        if (outEdges[0]) return outEdges[0].to;
      } else if (actionId.startsWith('wf_menu_')) {
        // Dynamic Welcome menu pick → the chosen sub-workflow id. The next node
        // (start_workflow with useReply) opens it.
        ctx.variables.selected_workflow_id = actionId.replace('wf_menu_', '');
        if (outEdges[0]) return outEdges[0].to;
      }
    }

    // Store last reply text as a variable
    if (ctx.lastReply?.text) {
      ctx.variables.last_input = ctx.lastReply.text;
    }

    // Check if there's a fallback node connected to this node (edge labeled "fallback")
    const fallbackEdge = outEdges.find(
      (e) => e.label && e.label.toLowerCase() === 'fallback',
    );
    if (fallbackEdge) {
      return fallbackEdge.to;
    }

    // Look for a global fallback node in the workflow
    const fallbackNode = nodes.find((n) => n.type === 'fallback');
    if (fallbackNode && outEdges.length > 0) {
      // Store the current node so fallback can route back
      ctx.variables._fallbackReturnNode = currentNodeId;
      return fallbackNode.id;
    }

    // Default: follow first outgoing edge
    return outEdges[0]?.to || null;
  }

  // ─── DB helpers ──────────────────────────────────────────────────────────

  private async updateExecutionPosition(ctx: ExecutionContext, nodeId: string, steps: number): Promise<void> {
    await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      await qr.query(
        `UPDATE workflow_executions SET current_node_id = $1, steps_executed = $2, variables = $3 WHERE id = $4`,
        [nodeId, steps, JSON.stringify(ctx.variables), ctx.executionId],
      );
    });
  }

  private async pauseExecution(
    ctx: ExecutionContext,
    nodeId: string,
    waitType: string,
    waitConfig: Record<string, any>,
  ): Promise<void> {
    let resumeJobId: string | null = null;

    // Schedule delay resume job
    if (waitType === 'delay' && waitConfig.delayMs) {
      const job = await this.resumeQueue.add(
        'workflow-delay-resume',
        { schema: ctx.schema, executionId: ctx.executionId },
        { delay: waitConfig.delayMs },
      );
      resumeJobId = job.id ?? null;
    }

    // Schedule timeout job for reply waits
    if (waitType === 'reply' && waitConfig.timeoutMinutes) {
      const job = await this.resumeQueue.add(
        'workflow-timeout',
        { schema: ctx.schema, executionId: ctx.executionId, timeoutMessage: waitConfig.timeoutMessage },
        { delay: waitConfig.timeoutMinutes * 60 * 1000 },
      );
      resumeJobId = job.id ?? null;
    }

    await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      await qr.query(
        `UPDATE workflow_executions
         SET status = 'waiting', current_node_id = $1, wait_type = $2,
             wait_config = $3, resume_job_id = $4, variables = $5
         WHERE id = $6`,
        [nodeId, waitType, JSON.stringify(waitConfig), resumeJobId, JSON.stringify(ctx.variables), ctx.executionId],
      );
    });
  }

  private async completeExecution(ctx: ExecutionContext, stepsExecuted: number, reason?: string): Promise<void> {
    await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      await qr.query(
        `UPDATE workflow_executions
         SET status = 'completed', completed_at = NOW(), steps_executed = $1,
             variables = $2, context = jsonb_set(COALESCE(context, '{}'), '{completion_reason}', $3)
         WHERE id = $4`,
        [stepsExecuted, JSON.stringify(ctx.variables), JSON.stringify(reason || 'normal'), ctx.executionId],
      );
    });
    this.logger.log(`Workflow execution ${ctx.executionId} completed (${stepsExecuted} steps)`);
  }

  /**
   * Chain into another workflow — completes current execution then starts the target workflow.
   * Optionally passes variables from the current execution context.
   */
  private async chainWorkflow(ctx: ExecutionContext, targetWorkflowId: string, passVariables: boolean): Promise<void> {
    // Load target workflow to find its trigger node
    const targetWorkflow = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      const rows = await qr.query(`SELECT * FROM workflows WHERE id = $1`, [targetWorkflowId]);
      return rows[0];
    });

    if (!targetWorkflow) {
      this.logger.error(`Chain target workflow ${targetWorkflowId} not found`);
      return;
    }

    const nodes: WorkflowNode[] = targetWorkflow.nodes || [];
    const edges: WorkflowEdge[] = targetWorkflow.edges || [];

    // Find the trigger node (first node with type starting with 'trigger_')
    const triggerNode = nodes.find((n) => n.type.startsWith('trigger_'));
    if (!triggerNode) {
      this.logger.error(`Chain target workflow ${targetWorkflowId} has no trigger node`);
      return;
    }

    // Find the first edge leaving the trigger
    const triggerEdge = edges.find((e) => e.from === triggerNode.id);
    if (!triggerEdge) {
      this.logger.error(`Chain target workflow ${targetWorkflowId}: no edge leaving trigger`);
      return;
    }

    // Create new execution for the chained workflow
    const carriedVariables = passVariables ? { ...ctx.variables } : {};
    // Clean up internal variables
    delete carriedVariables._buttonMap;
    delete carriedVariables._fallbackReturnNode;

    const executionId = await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      const rows = await qr.query(
        `INSERT INTO workflow_executions
         (workflow_id, triggered_by, status, current_node_id, conversation_id, customer_phone, variables, context)
         VALUES ($1, $2, 'running', $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          targetWorkflowId, ctx.customerPhone, triggerEdge.to, ctx.conversationId, ctx.customerPhone,
          JSON.stringify(carriedVariables),
          JSON.stringify({ chainedFrom: ctx.workflowId, chainedExecutionId: ctx.executionId }),
        ],
      );
      await qr.query(
        `UPDATE workflows SET execution_count = execution_count + 1, last_executed_at = NOW() WHERE id = $1`,
        [targetWorkflowId],
      );
      return rows[0].id;
    });

    this.logger.log(`Chained workflow ${ctx.workflowId} → ${targetWorkflowId} (execution ${executionId})`);

    // Build new context and run
    const chainedCtx: ExecutionContext = {
      executionId,
      workflowId: targetWorkflowId,
      schema: ctx.schema,
      tenant: ctx.tenant,
      conversationId: ctx.conversationId,
      customerPhone: ctx.customerPhone,
      customerId: ctx.customerId,
      customerName: ctx.customerName,
      variables: carriedVariables,
      triggerData: { chainedFrom: ctx.workflowId },
    };

    await this.runLoop(chainedCtx, nodes, edges, triggerEdge.to);
  }

  private async failExecution(ctx: ExecutionContext, errorMessage: string): Promise<void> {
    await this.connectionManager.executeInTenantContext(ctx.schema, async (qr) => {
      await qr.query(
        `UPDATE workflow_executions SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
        [errorMessage, ctx.executionId],
      );
    });
    this.logger.error(`Workflow execution ${ctx.executionId} failed: ${errorMessage}`);
  }

  /**
   * Cleanup stale executions as a safety net.
   * Primary expiry happens inline in findActiveExecution() when a customer messages.
   * This cron catches orphaned executions where the customer never messages again.
   *
   * Scalability:
   * - Single query to find schemas with the table (no per-tenant existence check)
   * - Parallel batch processing (10 concurrent) instead of sequential
   * - 1000 tenants ≈ 2-5 seconds instead of 30+ seconds
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async cleanupStaleExecutions(): Promise<void> {
    try {
      const ds = this.connectionManager.getDataSource();

      // Single query: find only schemas that have workflow_executions table
      const schemas: { table_schema: string }[] = await ds.query(`
        SELECT table_schema
        FROM information_schema.tables
        WHERE table_name = 'workflow_executions'
          AND table_schema IN (SELECT schema_name FROM public.tenants WHERE schema_name IS NOT NULL)
      `);

      if (!schemas.length) return;

      let timedOut = 0;
      const CONCURRENCY = 10;

      // Process schemas in parallel batches
      for (let i = 0; i < schemas.length; i += CONCURRENCY) {
        const batch = schemas.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(({ table_schema: schema }) =>
            ds.query(`
              UPDATE "${schema}".workflow_executions
              SET status = 'timed_out', error_message = 'Session expired (1 hour inactivity)', completed_at = NOW()
              WHERE status IN ('running', 'waiting')
                AND started_at < NOW() - INTERVAL '1 hour'
              RETURNING id
            `),
          ),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') timedOut += r.value?.length || 0;
        }
      }

      if (timedOut > 0) {
        this.logger.warn(`Timed out ${timedOut} stale workflow executions across ${schemas.length} schemas`);
      }
    } catch (err: any) {
      this.logger.error(`Stale execution cleanup failed: ${err.message}`);
    }
  }
}
