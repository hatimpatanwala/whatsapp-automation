import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from './api.service';
import {
  Campaign,
  CampaignStats,
  CampaignStatus,
  CampaignType,
  CampaignMessage,
  Segment,
  PaginatedResponse,
} from '../models';

export interface CampaignListParams extends QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: CampaignStatus;
  type?: CampaignType;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateCampaignPayload {
  name: string;
  description?: string;
  type: CampaignType;
  targetSegmentIds: string[];
  messages: CampaignMessage[];
  scheduledAt?: string;      // ISO date — when to send the campaign
}

export interface UpdateCampaignPayload extends Partial<CreateCampaignPayload> {}

export interface CampaignOverview {
  totalCampaigns: number;
  activeCampaigns: number;
  scheduledCampaigns: number;
  totalMessagesSent: number;
  averageReadRate: number;
  averageReplyRate: number;
}

@Injectable({ providedIn: 'root' })
export class CampaignService {
  private readonly api = inject(ApiService);

  // ─── Campaigns ─────────────────────────────────────────────────────────────

  getAll(params?: CampaignListParams): Observable<PaginatedResponse<Campaign>> {
    return this.api.get<PaginatedResponse<Campaign>>('/campaigns', params);
  }

  getById(id: string): Observable<Campaign> {
    return this.api.get<Campaign>(`/campaigns/${id}`);
  }

  create(payload: CreateCampaignPayload): Observable<Campaign> {
    return this.api.post<Campaign>('/campaigns', payload);
  }

  update(id: string, payload: UpdateCampaignPayload): Observable<Campaign> {
    return this.api.patch<Campaign>(`/campaigns/${id}`, payload);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/campaigns/${id}`);
  }

  /**
   * Send a campaign immediately (bypasses any scheduledAt value).
   */
  send(id: string): Observable<Campaign> {
    return this.api.post<Campaign>(`/campaigns/${id}/send`, {});
  }

  /**
   * Pause a currently running campaign.
   */
  pause(id: string): Observable<Campaign> {
    return this.api.post<Campaign>(`/campaigns/${id}/pause`, {});
  }

  /**
   * Resume a paused campaign.
   */
  resume(id: string): Observable<Campaign> {
    return this.api.post<Campaign>(`/campaigns/${id}/resume`, {});
  }

  /**
   * Cancel a scheduled or paused campaign.
   */
  cancel(id: string): Observable<Campaign> {
    return this.api.post<Campaign>(`/campaigns/${id}/cancel`, {});
  }

  /**
   * Retrieve delivery/engagement statistics for a campaign.
   */
  getStats(id: string): Observable<CampaignStats> {
    return this.api.get<CampaignStats>(`/campaigns/${id}/stats`);
  }

  /**
   * Retrieve overview metrics across all campaigns.
   */
  getOverview(params?: { dateFrom?: string; dateTo?: string }): Observable<CampaignOverview> {
    return this.api.get<CampaignOverview>('/campaigns/overview', params);
  }

  /**
   * Duplicate an existing campaign as a new draft.
   */
  duplicate(id: string): Observable<Campaign> {
    return this.api.post<Campaign>(`/campaigns/${id}/duplicate`, {});
  }

  /**
   * Preview estimated recipient count before launching.
   */
  previewRecipients(segmentIds: string[]): Observable<{ count: number }> {
    return this.api.post<{ count: number }>('/campaigns/preview-recipients', { segmentIds });
  }

  // ─── Segments (convenience re-export via campaigns context) ───────────────

  /**
   * List all available segments for targeting.
   * Delegates to /customers/segments — kept here for component convenience.
   */
  getSegments(): Observable<Segment[]> {
    return this.api.get<Segment[]>('/customers/segments');
  }
}
