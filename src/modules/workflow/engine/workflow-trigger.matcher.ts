import { Injectable, Logger, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../config/redis.module';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';
import { WorkflowNode } from './workflow-engine.types';

interface TriggerMatch {
  workflowId: string;
  triggerNodeId: string;
}

interface CachedWorkflow {
  id: string;
  nodes: WorkflowNode[];
}

const CACHE_TTL = 60; // seconds

@Injectable()
export class WorkflowTriggerMatcher {
  private readonly logger = new Logger(WorkflowTriggerMatcher.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async findMatchingWorkflow(
    schema: string,
    messageText: string,
    messageType: string,
  ): Promise<TriggerMatch | null> {
    // Only match trigger_message for now (text + interactive)
    if (messageType !== 'text' && messageType !== 'interactive') return null;

    const workflows = await this.getActiveWorkflows(schema);
    this.logger.log(`[TRIGGER] ${workflows.length} active workflows in ${schema}, checking "${messageText}"`);

    for (const wf of workflows) {
      const triggerNode = (wf.nodes || []).find(
        (n: WorkflowNode) => n.type === 'trigger_message',
      );
      if (!triggerNode) {
        this.logger.log(`[TRIGGER] Workflow ${wf.id}: no trigger_message node`);
        continue;
      }

      const keywords = (triggerNode.config?.keywords || '')
        .split(',')
        .map((k: string) => k.trim().toLowerCase())
        .filter(Boolean);

      if (keywords.length === 0) {
        this.logger.log(`[TRIGGER] Workflow ${wf.id}: no keywords configured`);
        continue;
      }

      const matchType = triggerNode.config?.matchType || 'contains';
      const text = messageText.toLowerCase().trim();

      this.logger.log(`[TRIGGER] Workflow ${wf.id}: "${text}" vs [${keywords.join(', ')}] (${matchType})`);

      const matched = keywords.some((keyword: string) => {
        switch (matchType) {
          case 'exact': return text === keyword;
          case 'starts_with': return text.startsWith(keyword);
          case 'contains':
          default: return text.includes(keyword);
        }
      });

      if (matched) {
        this.logger.log(`[TRIGGER] MATCHED workflow ${wf.id} for "${text}"`);
        return { workflowId: wf.id, triggerNodeId: triggerNode.id };
      }
    }

    this.logger.log(`[TRIGGER] No match for "${messageText}" across ${workflows.length} workflows`);
    return null;
  }

  async findMatchingEventWorkflow(
    schema: string,
    triggerType: string,
    eventValue: string,
  ): Promise<TriggerMatch | null> {
    const workflows = await this.getActiveWorkflows(schema);

    for (const wf of workflows) {
      const triggerNode = (wf.nodes || []).find(
        (n: WorkflowNode) => n.type === triggerType,
      );
      if (!triggerNode) continue;

      const configEvent = triggerNode.config?.event;
      if (configEvent === eventValue) {
        return { workflowId: wf.id, triggerNodeId: triggerNode.id };
      }
    }

    return null;
  }

  /** Invalidate cached workflows when a workflow is activated/paused/updated */
  async invalidateCache(schema: string): Promise<void> {
    await this.redis.del(`wf:triggers:${schema}`);
  }

  private async getActiveWorkflows(schema: string): Promise<CachedWorkflow[]> {
    const cacheKey = `wf:triggers:${schema}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fallthrough */ }
    }

    // Load from DB
    const workflows = await this.connectionManager.executeInTenantContext(schema, async (qr) => {
      return qr.query(
        `SELECT id, nodes FROM workflows WHERE status = 'active'`,
      );
    });

    const result: CachedWorkflow[] = workflows.map((w: any) => ({
      id: w.id,
      nodes: w.nodes || [],
    }));

    // Cache for 60s
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }
}
