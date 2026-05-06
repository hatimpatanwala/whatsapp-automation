import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from './api.service';
import { Customer, CustomerStatus, Segment, SegmentRule, SegmentConditionLogic, PaginatedResponse } from '../models';

export interface CustomerListParams extends QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: CustomerStatus;
  segmentId?: string;
  tag?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface UpdateCustomerPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  status?: CustomerStatus;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  tags?: string[];
  notes?: string;
}

export interface CreateSegmentPayload {
  name: string;
  description?: string;
  conditionLogic?: SegmentConditionLogic;
  rules?: SegmentRule[];
  isDynamic?: boolean;
}

export interface CustomerStats {
  total: number;
  active: number;
  blocked: number;
  newThisMonth: number;
  repeatCustomers: number;
  averageOrderValue: number;
  topSpenders: Pick<Customer, 'id' | 'whatsappPhone' | 'whatsappName' | 'totalSpent'>[];
}

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly api = inject(ApiService);

  // ─── Customers ─────────────────────────────────────────────────────────────

  getAll(params?: CustomerListParams): Observable<PaginatedResponse<Customer>> {
    return this.api.get<PaginatedResponse<Customer>>('/customers', params);
  }

  getById(id: string): Observable<Customer> {
    return this.api.get<Customer>(`/customers/${id}`);
  }

  getByPhone(phone: string): Observable<Customer> {
    return this.api.get<Customer>(`/customers/phone/${encodeURIComponent(phone)}`);
  }

  update(id: string, payload: UpdateCustomerPayload): Observable<Customer> {
    return this.api.patch<Customer>(`/customers/${id}`, payload);
  }

  block(id: string, reason?: string): Observable<Customer> {
    return this.api.post<Customer>(`/customers/${id}/block`, { reason });
  }

  unblock(id: string): Observable<Customer> {
    return this.api.post<Customer>(`/customers/${id}/unblock`, {});
  }

  addTags(id: string, tags: string[]): Observable<Customer> {
    return this.api.post<Customer>(`/customers/${id}/tags`, { tags });
  }

  removeTags(id: string, tags: string[]): Observable<Customer> {
    return this.api.delete<Customer>(`/customers/${id}/tags`);
  }

  getStats(): Observable<CustomerStats> {
    return this.api.get<CustomerStats>('/customers/stats');
  }

  /**
   * Export customer list as CSV.
   */
  exportCsv(params?: CustomerListParams): Observable<Blob> {
    const httpParams = this.api.buildParams(params);
    return this.api.http.get(this.api.url('/customers/export'), {
      params: httpParams,
      responseType: 'blob',
    });
  }

  // ─── Segments ──────────────────────────────────────────────────────────────

  getSegments(params?: QueryParams): Observable<Segment[]> {
    return this.api.get<Segment[]>('/customers/segments', params);
  }

  getSegmentById(id: string): Observable<Segment> {
    return this.api.get<Segment>(`/customers/segments/${id}`);
  }

  createSegment(payload: CreateSegmentPayload): Observable<Segment> {
    return this.api.post<Segment>('/customers/segments', payload);
  }

  updateSegment(id: string, payload: Partial<CreateSegmentPayload>): Observable<Segment> {
    return this.api.patch<Segment>(`/customers/segments/${id}`, payload);
  }

  deleteSegment(id: string): Observable<void> {
    return this.api.delete<void>(`/customers/segments/${id}`);
  }

  /**
   * Recalculate which customers belong to a dynamic segment.
   */
  recalculateSegment(id: string): Observable<Segment> {
    return this.api.post<Segment>(`/customers/segments/${id}/recalculate`, {});
  }

  /**
   * Preview how many customers match a set of rules before saving.
   */
  previewSegment(rules: SegmentRule[], conditionLogic: SegmentConditionLogic): Observable<{ count: number }> {
    return this.api.post<{ count: number }>('/customers/segments/preview', {
      rules,
      conditionLogic,
    });
  }

  /**
   * Get the customers belonging to a segment.
   */
  getSegmentCustomers(segmentId: string, params?: CustomerListParams): Observable<PaginatedResponse<Customer>> {
    return this.api.get<PaginatedResponse<Customer>>(
      `/customers/segments/${segmentId}/customers`,
      params,
    );
  }
}
