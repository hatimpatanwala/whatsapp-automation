import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from './api.service';
import {
  Workflow,
  WorkflowStatus,
  WorkflowNode,
  WorkflowEdge,
  WorkflowTrigger,
  PaginatedResponse,
} from '../models';

export interface WorkflowListParams extends QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: WorkflowStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateWorkflowPayload {
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

export interface UpdateWorkflowPayload {
  name?: string;
  description?: string;
  trigger?: WorkflowTrigger;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

/**
 * Payload used when saving the visual workflow definition from the
 * drag-and-drop builder. Replaces the entire node/edge graph in one call.
 */
export interface SaveWorkflowDefinitionPayload {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** Optionally update metadata at the same time */
  name?: string;
  description?: string;
  trigger?: WorkflowTrigger;
}

export interface WorkflowExecutionLog {
  id: string;
  workflowId: string;
  triggeredBy: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  stepsExecuted: number;
  errorMessage?: string;
  context?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private readonly api = inject(ApiService);

  getAll(params?: WorkflowListParams): Observable<PaginatedResponse<Workflow>> {
    return this.api.get<PaginatedResponse<Workflow>>('/workflows', params);
  }

  getById(id: string): Observable<Workflow> {
    return this.api.get<Workflow>(`/workflows/${id}`);
  }

  create(payload: CreateWorkflowPayload): Observable<Workflow> {
    return this.api.post<Workflow>('/workflows', payload);
  }

  update(id: string, payload: UpdateWorkflowPayload): Observable<Workflow> {
    return this.api.patch<Workflow>(`/workflows/${id}`, payload);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/workflows/${id}`);
  }

  /**
   * Persist the full visual definition (nodes + edges) from the workflow
   * builder. Increments the version counter server-side.
   */
  saveDefinition(id: string, payload: SaveWorkflowDefinitionPayload): Observable<Workflow> {
    return this.api.put<Workflow>(`/workflows/${id}/definition`, payload);
  }

  /**
   * Load the full workflow definition (nodes, edges, trigger) for the
   * visual builder. Equivalent to getById but semantically explicit.
   */
  loadDefinition(id: string): Observable<Workflow> {
    return this.getById(id);
  }

  /**
   * Activate a draft or paused workflow so it starts processing triggers.
   */
  activate(id: string): Observable<Workflow> {
    return this.api.post<Workflow>(`/workflows/${id}/activate`, {});
  }

  /**
   * Pause an active workflow without deleting it.
   */
  pause(id: string): Observable<Workflow> {
    return this.api.post<Workflow>(`/workflows/${id}/pause`, {});
  }

  /**
   * Archive a workflow (soft delete, stops execution).
   */
  archive(id: string): Observable<Workflow> {
    return this.api.post<Workflow>(`/workflows/${id}/archive`, {});
  }

  /**
   * Manually trigger a workflow execution for testing.
   */
  testRun(id: string, testContext?: Record<string, unknown>): Observable<WorkflowExecutionLog> {
    return this.api.post<WorkflowExecutionLog>(`/workflows/${id}/test`, testContext ?? {});
  }

  /**
   * Duplicate a workflow as a new draft.
   */
  duplicate(id: string): Observable<Workflow> {
    return this.api.post<Workflow>(`/workflows/${id}/duplicate`, {});
  }

  /**
   * Get execution history for a workflow.
   */
  getExecutionLogs(id: string, params?: QueryParams): Observable<PaginatedResponse<WorkflowExecutionLog>> {
    return this.api.get<PaginatedResponse<WorkflowExecutionLog>>(
      `/workflows/${id}/executions`,
      params,
    );
  }
}
