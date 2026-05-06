import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from './api.service';
import { Tenant, TenantSettings, PaginatedResponse } from '../models';

export interface CreateTenantPayload {
  name: string;
  slug: string;
  domain?: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  planId?: string;
}

export interface UpdateTenantPayload {
  name?: string;
  domain?: string;
  logoUrl?: string;
  whatsappPhoneNumber?: string;
  whatsappBusinessAccountId?: string;
  whatsappAccessToken?: string;
  settings?: Partial<TenantSettings>;
}

export interface TenantListParams extends QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

/**
 * Super-admin service for managing tenants.
 * All endpoints are under /admin/tenants and require the super_admin role.
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly api = inject(ApiService);

  getAll(params?: TenantListParams): Observable<PaginatedResponse<Tenant>> {
    return this.api.get<PaginatedResponse<Tenant>>('/admin/tenants', params);
  }

  getById(id: string): Observable<Tenant> {
    return this.api.get<Tenant>(`/admin/tenants/${id}`);
  }

  create(payload: CreateTenantPayload): Observable<Tenant> {
    return this.api.post<Tenant>('/admin/tenants', payload);
  }

  update(id: string, payload: UpdateTenantPayload): Observable<Tenant> {
    return this.api.patch<Tenant>(`/admin/tenants/${id}`, payload);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/admin/tenants/${id}`);
  }

  suspend(id: string, reason?: string): Observable<Tenant> {
    return this.api.post<Tenant>(`/admin/tenants/${id}/suspend`, { reason });
  }

  activate(id: string): Observable<Tenant> {
    return this.api.post<Tenant>(`/admin/tenants/${id}/activate`, {});
  }

  /**
   * Change or assign a subscription plan for a tenant.
   */
  assignPlan(tenantId: string, planId: string, billingCycle: 'monthly' | 'yearly'): Observable<Tenant> {
    return this.api.post<Tenant>(`/admin/tenants/${tenantId}/plan`, {
      planId,
      billingCycle,
    });
  }

  /**
   * Fetch usage statistics for a tenant's current billing period.
   */
  getUsage(tenantId: string): Observable<{
    conversationsUsed: number;
    messagesUsed: number;
    conversationLimit: number | null;
    messageLimit: number | null;
    overageAmount: number;
  }> {
    return this.api.get(`/admin/tenants/${tenantId}/usage`);
  }
}
