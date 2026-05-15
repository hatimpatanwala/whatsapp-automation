import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from './api.service';
import {
  SubscriptionPlan,
  SubscriptionPlanLimits,
  SubscriptionPlanFeatures,
  Subscription,
  SubscriptionStatus,
  BillingCycle,
  PlanTier,
  PaginatedResponse,
} from '../models';

// ─── Plan management (super admin) ────────────────────────────────────────────

export interface CreatePlanPayload {
  name: string;
  tier: PlanTier;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  pricePerConversation: number;
  limits?: SubscriptionPlanLimits;
  features?: SubscriptionPlanFeatures;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdatePlanPayload extends Partial<CreatePlanPayload> {}

// ─── Subscription management ──────────────────────────────────────────────────

export interface SubscriptionListParams extends QueryParams {
  page?: number;
  limit?: number;
  status?: SubscriptionStatus;
  planId?: string;
  tenantId?: string;
}

export interface ChangeSubscriptionPayload {
  planId: string;
  billingCycle: BillingCycle;
  /** If true, the change takes effect at the end of the current period */
  deferToEndOfPeriod?: boolean;
}

export interface SubscriptionUsage {
  conversationsUsed: number;
  conversationLimit: number | null;
  messagesUsed: number;
  messageLimit: number | null;
  conversationUsagePercent: number | null;
  overageConversations: number;
  overageAmount: number;        // in USD cents
  periodStart: string;
  periodEnd: string;
}

export interface BillingInvoice {
  id: string;
  subscriptionId: string;
  tenantId: string;
  amount: number;             // in USD cents
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  periodStart: string;
  periodEnd: string;
  dueDate?: string;
  paidAt?: string;
  invoiceUrl?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    totalAmount: number;
  }>;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly api = inject(ApiService);

  // ─── Plan CRUD (super admin) ──────────────────────────────────────────────

  getPlans(params?: QueryParams): Observable<SubscriptionPlan[]> {
    return this.api.get<SubscriptionPlan[]>('/admin/plans', params);
  }

  getPlanById(id: string): Observable<SubscriptionPlan> {
    return this.api.get<SubscriptionPlan>(`/admin/plans/${id}`);
  }

  createPlan(payload: CreatePlanPayload): Observable<SubscriptionPlan> {
    return this.api.post<SubscriptionPlan>('/admin/plans', payload);
  }

  updatePlan(id: string, payload: UpdatePlanPayload): Observable<SubscriptionPlan> {
    return this.api.patch<SubscriptionPlan>(`/admin/plans/${id}`, payload);
  }

  deletePlan(id: string): Observable<void> {
    return this.api.delete<void>(`/admin/plans/${id}`);
  }

  /**
   * Toggle a plan's visibility (active / inactive).
   */
  togglePlanActive(id: string, isActive: boolean): Observable<SubscriptionPlan> {
    return this.api.patch<SubscriptionPlan>(`/admin/plans/${id}`, { isActive });
  }

  // ─── Public plan listing (for upgrade/pricing pages) ─────────────────────

  getPublicPlans(): Observable<SubscriptionPlan[]> {
    return this.api.get<SubscriptionPlan[]>('/plans');
  }

  // ─── Subscription management ─────────────────────────────────────────────

  /**
   * List all subscriptions (super admin view).
   */
  getAllSubscriptions(params?: SubscriptionListParams): Observable<PaginatedResponse<Subscription>> {
    return this.api.get<PaginatedResponse<Subscription>>('/admin/subscriptions', params);
  }

  /**
   * Get the current tenant's own subscription.
   */
  getMySubscription(): Observable<Subscription> {
    return this.api.get<Subscription>('/billing/subscription');
  }

  /**
   * Get usage data for the current tenant's active billing period.
   */
  getMyUsage(): Observable<SubscriptionUsage> {
    return this.api.get<SubscriptionUsage>('/billing/usage');
  }

  /**
   * Upgrade, downgrade or change billing cycle for the current tenant.
   */
  changeSubscription(payload: ChangeSubscriptionPayload): Observable<Subscription> {
    return this.api.post<Subscription>('/billing/subscription/change', payload);
  }

  /**
   * Cancel the current tenant's subscription.
   */
  cancelSubscription(atPeriodEnd = true): Observable<Subscription> {
    return this.api.post<Subscription>('/billing/subscription/cancel', { atPeriodEnd });
  }

  /**
   * Resume a canceled subscription before the period ends.
   */
  resumeSubscription(): Observable<Subscription> {
    return this.api.post<Subscription>('/billing/subscription/resume', {});
  }

  /**
   * List billing invoices for the current tenant.
   */
  getInvoices(params?: QueryParams): Observable<PaginatedResponse<BillingInvoice>> {
    return this.api.get<PaginatedResponse<BillingInvoice>>('/billing/invoices', params);
  }

  /**
   * Get a single invoice by ID.
   */
  getInvoice(id: string): Observable<BillingInvoice> {
    return this.api.get<BillingInvoice>(`/billing/invoices/${id}`);
  }

  // ─── Super admin: per-tenant subscription management ─────────────────────

  getTenantSubscription(tenantId: string): Observable<Subscription> {
    return this.api.get<Subscription>(`/admin/tenants/${tenantId}/subscription`);
  }

  setTenantSubscription(
    tenantId: string,
    payload: ChangeSubscriptionPayload,
  ): Observable<Subscription> {
    return this.api.post<Subscription>(`/admin/tenants/${tenantId}/subscription`, payload);
  }

  getTenantUsage(tenantId: string): Observable<SubscriptionUsage> {
    return this.api.get<SubscriptionUsage>(`/admin/tenants/${tenantId}/usage`);
  }

  /**
   * Assign or change a tenant's plan (super admin).
   */
  assignTenantPlan(
    tenantId: string,
    payload: { planId: string; validUntil?: string; featureOverrides?: Record<string, boolean> },
  ): Observable<any> {
    return this.api.post(`/admin/tenants/${tenantId}/subscription`, payload);
  }

  /**
   * Update feature overrides for a tenant (super admin).
   */
  updateTenantFeatures(
    tenantId: string,
    features: Record<string, boolean>,
  ): Observable<any> {
    return this.api.patch(`/admin/tenants/${tenantId}/features`, { features });
  }
}
