import { Injectable, Inject, Optional } from '@nestjs/common';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';
import { WorkflowTriggerMatcher } from './engine/workflow-trigger.matcher';

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  trigger?: Record<string, any>;
  nodes?: any[];
  edges?: any[];
}

export interface UpdateWorkflowDto {
  name?: string;
  description?: string;
  trigger?: Record<string, any>;
  nodes?: any[];
  edges?: any[];
}

export interface SaveDefinitionDto {
  nodes: any[];
  edges: any[];
  name?: string;
  description?: string;
  trigger?: Record<string, any>;
}

@Injectable()
export class WorkflowService {
  constructor(
    private readonly tenantConn: TenantConnectionManager,
    @Optional() private readonly triggerMatcher?: WorkflowTriggerMatcher,
  ) {}

  async findAll(schema: string, params?: { status?: string; search?: string; page?: number; limit?: number }) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const offset = (page - 1) * limit;

    return this.tenantConn.executeInTenantContext(schema, async (qr) => {
      let where = 'WHERE 1=1';
      const queryParams: any[] = [];
      let paramIdx = 1;

      if (params?.status) {
        where += ` AND status = $${paramIdx++}`;
        queryParams.push(params.status);
      }
      if (params?.search) {
        where += ` AND (name ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`;
        paramIdx++;
        queryParams.push(`%${params.search}%`);
      }

      const countResult = await qr.query(
        `SELECT COUNT(*) as total FROM workflows ${where}`,
        queryParams,
      );
      const total = parseInt(countResult[0].total, 10);

      const rows = await qr.query(
        `SELECT * FROM workflows ${where} ORDER BY updated_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
        [...queryParams, limit, offset],
      );

      return {
        data: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    });
  }

  async findById(schema: string, id: string) {
    return this.tenantConn.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query('SELECT * FROM workflows WHERE id = $1', [id]);
      if (!rows.length) return null;
      return rows[0];
    });
  }

  async create(schema: string, dto: CreateWorkflowDto, userId?: string) {
    return this.tenantConn.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `INSERT INTO workflows (name, description, trigger, nodes, edges, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          dto.name,
          dto.description || null,
          JSON.stringify(dto.trigger || {}),
          JSON.stringify(dto.nodes || []),
          JSON.stringify(dto.edges || []),
          userId || null,
        ],
      );
      return rows[0];
    });
  }

  async update(schema: string, id: string, dto: UpdateWorkflowDto) {
    return this.tenantConn.executeInTenantContext(schema, async (qr) => {
      const sets: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (dto.name !== undefined) { sets.push(`name = $${idx++}`); params.push(dto.name); }
      if (dto.description !== undefined) { sets.push(`description = $${idx++}`); params.push(dto.description); }
      if (dto.trigger !== undefined) { sets.push(`trigger = $${idx++}`); params.push(JSON.stringify(dto.trigger)); }
      if (dto.nodes !== undefined) { sets.push(`nodes = $${idx++}`); params.push(JSON.stringify(dto.nodes)); }
      if (dto.edges !== undefined) { sets.push(`edges = $${idx++}`); params.push(JSON.stringify(dto.edges)); }

      if (!sets.length) return this.findById(schema, id);

      sets.push(`updated_at = NOW()`);
      params.push(id);

      const rows = await qr.query(
        `UPDATE workflows SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );
      return rows[0] || null;
    });
  }

  async saveDefinition(schema: string, id: string, dto: SaveDefinitionDto) {
    const result = await this.tenantConn.executeInTenantContext(schema, async (qr) => {
      const sets = [
        'nodes = $1',
        'edges = $2',
        'version = version + 1',
        'updated_at = NOW()',
      ];
      const params: any[] = [JSON.stringify(dto.nodes), JSON.stringify(dto.edges)];
      let idx = 3;

      if (dto.name) { sets.push(`name = $${idx++}`); params.push(dto.name); }
      if (dto.description) { sets.push(`description = $${idx++}`); params.push(dto.description); }
      if (dto.trigger) { sets.push(`trigger = $${idx++}`); params.push(JSON.stringify(dto.trigger)); }

      params.push(id);
      const rows = await qr.query(
        `UPDATE workflows SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );
      return rows[0] || null;
    });
    await this.triggerMatcher?.invalidateCache(schema);
    return result;
  }

  async delete(schema: string, id: string) {
    return this.tenantConn.executeInTenantContext(schema, async (qr) => {
      await qr.query('DELETE FROM workflows WHERE id = $1', [id]);
    });
  }

  async activate(schema: string, id: string) {
    const result = await this.tenantConn.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `UPDATE workflows SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id],
      );
      return rows[0] || null;
    });
    await this.triggerMatcher?.invalidateCache(schema);
    return result;
  }

  async pause(schema: string, id: string) {
    const result = await this.tenantConn.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `UPDATE workflows SET status = 'paused', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id],
      );
      return rows[0] || null;
    });
    await this.triggerMatcher?.invalidateCache(schema);
    return result;
  }

  async archive(schema: string, id: string) {
    const result = await this.tenantConn.executeInTenantContext(schema, async (qr) => {
      const rows = await qr.query(
        `UPDATE workflows SET status = 'archived', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id],
      );
      return rows[0] || null;
    });
    await this.triggerMatcher?.invalidateCache(schema);
    return result;
  }

  async duplicate(schema: string, id: string, userId?: string) {
    return this.tenantConn.executeInTenantContext(schema, async (qr) => {
      const original = await qr.query('SELECT * FROM workflows WHERE id = $1', [id]);
      if (!original.length) return null;
      const wf = original[0];
      const rows = await qr.query(
        `INSERT INTO workflows (name, description, trigger, nodes, edges, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          wf.name + ' (copy)',
          wf.description,
          JSON.stringify(wf.trigger),
          JSON.stringify(wf.nodes),
          JSON.stringify(wf.edges),
          userId || null,
        ],
      );
      return rows[0];
    });
  }

  async testRun(schema: string, id: string, context?: Record<string, any>) {
    return this.tenantConn.executeInTenantContext(schema, async (qr) => {
      // Create execution log
      const rows = await qr.query(
        `INSERT INTO workflow_executions (workflow_id, triggered_by, status, context)
         VALUES ($1, 'manual_test', 'running', $2)
         RETURNING *`,
        [id, JSON.stringify(context || {})],
      );

      // Increment execution count on workflow
      await qr.query(
        `UPDATE workflows SET execution_count = execution_count + 1, last_executed_at = NOW() WHERE id = $1`,
        [id],
      );

      // Mark as completed (actual execution engine would process nodes here)
      const execId = rows[0].id;
      await qr.query(
        `UPDATE workflow_executions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [execId],
      );

      return { ...rows[0], status: 'completed' };
    });
  }

  async getExecutionLogs(schema: string, workflowId: string, params?: { page?: number; limit?: number }) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const offset = (page - 1) * limit;

    return this.tenantConn.executeInTenantContext(schema, async (qr) => {
      const countResult = await qr.query(
        'SELECT COUNT(*) as total FROM workflow_executions WHERE workflow_id = $1',
        [workflowId],
      );
      const total = parseInt(countResult[0].total, 10);

      const rows = await qr.query(
        'SELECT * FROM workflow_executions WHERE workflow_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3',
        [workflowId, limit, offset],
      );

      return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
    });
  }
}
