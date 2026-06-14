import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from './api.service';

// ─── Models ──────────────────────────────────────────────────────────────────

export interface WabaAccount {
  id: string;
  wabaId: string;
  name: string;
  businessId: string;
  currency: string;
  timezone: string;
  status: string;
  metaBusinessVerification: string;
  paymentMethodAttached: boolean;
  messagingLimitTier: string;
  accountReviewStatus: string;
  settings: Record<string, any>;
  phoneNumbers?: WabaPhoneNumber[];
  createdAt: string;
  updatedAt: string;
}

export interface WabaPhoneNumber {
  id: string;
  wabaAccountId: string;
  tenantId: string | null;
  phoneNumber: string;
  phoneNumberId: string;
  displayName: string;
  verifiedName: string;
  qualityRating: string;
  messagingLimit: string;
  status: string;
  registrationStatus: string;
  codeVerificationStatus: string;
  webhookSubscribed: boolean;
  tenant?: { id: string; name: string; slug: string };
  wabaAccount?: WabaAccount;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingStatus {
  phoneId: string;
  step: 'pending' | 'code_requested' | 'code_verified' | 'registered' | 'profile_set' | 'webhook_subscribed' | 'complete';
  details: Record<string, any>;
}

export interface WabaTemplate {
  id: string;
  wabaAccountId: string;
  tenantId: string | null;
  templateName: string;
  metaTemplateId: string;
  category: string;
  language: string;
  components: any;
  status: string;
  rejectionReason: string | null;
  qualityScore: number | null;
  isPlatformTemplate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QualityScoreEntry {
  id: string;
  phoneNumberId: string;
  qualityRating: string;
  previousRating: string | null;
  reason: string | null;
  recordedAt: string;
  createdAt: string;
}

export interface QualitySummary {
  total: number;
  green: number;
  yellow: number;
  red: number;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string | null;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, any>;
  ipAddress: string | null;
  createdAt: string;
}

export interface ConversationUsage {
  total: number;
  byCategory: {
    marketing: number;
    utility: number;
    authentication: number;
    service: number;
  };
  totalCostInr: number;
}

@Injectable({ providedIn: 'root' })
export class WabaService {
  private readonly api = inject(ApiService);

  // ─── WABA Accounts ──────────────────────────────────────────────────────────

  getAccounts(): Observable<WabaAccount[]> {
    return this.api.get<WabaAccount[]>('/admin/waba/accounts');
  }

  getAccount(id: string): Observable<WabaAccount> {
    return this.api.get<WabaAccount>(`/admin/waba/accounts/${id}`);
  }

  createAccount(data: Partial<WabaAccount> & { accessToken?: string }): Observable<WabaAccount & { syncedPhones?: number; syncWarning?: string }> {
    return this.api.post<WabaAccount & { syncedPhones?: number; syncWarning?: string }>('/admin/waba/accounts', data);
  }

  deleteAccount(id: string): Observable<{ success: boolean; deleted: string }> {
    return this.api.delete<{ success: boolean; deleted: string }>(`/admin/waba/accounts/${id}`);
  }

  resyncAccount(id: string): Observable<WabaAccount & { syncedPhones?: number }> {
    return this.api.post<WabaAccount & { syncedPhones?: number }>(`/admin/waba/accounts/${id}/resync`, {});
  }

  syncAccount(wabaId: string, accessToken: string): Observable<WabaAccount> {
    return this.api.post<WabaAccount>('/admin/waba/accounts/sync', { wabaId, accessToken });
  }

  // ─── Phone Numbers ──────────────────────────────────────────────────────────

  getPhones(wabaAccountId?: string): Observable<WabaPhoneNumber[]> {
    const params: QueryParams = {};
    if (wabaAccountId) params['wabaAccountId'] = wabaAccountId;
    return this.api.get<WabaPhoneNumber[]>('/admin/waba/phones', params);
  }

  getPhone(id: string): Observable<WabaPhoneNumber> {
    return this.api.get<WabaPhoneNumber>(`/admin/waba/phones/${id}`);
  }

  assignPhone(phoneId: string, tenantId: string): Observable<WabaPhoneNumber> {
    return this.api.post<WabaPhoneNumber>(`/admin/waba/phones/${phoneId}/assign`, { phoneId, tenantId });
  }

  getAssignableTenants(): Observable<Array<{ id: string; name: string; slug: string; businessName: string | null }>> {
    return this.api.get<Array<{ id: string; name: string; slug: string; businessName: string | null }>>('/admin/waba/assignable-tenants');
  }

  unassignPhone(phoneId: string): Observable<WabaPhoneNumber> {
    return this.api.post<WabaPhoneNumber>(`/admin/waba/phones/${phoneId}/unassign`, {});
  }

  updatePhoneStatus(phoneId: string, status: 'active' | 'inactive'): Observable<WabaPhoneNumber> {
    return this.api.patch<WabaPhoneNumber>(`/admin/waba/phones/${phoneId}/status`, { status });
  }

  // ─── Released numbers pending WhatsApp Manager removal ───────────────────────

  getPendingRemovalPhones(): Observable<WabaPhoneNumber[]> {
    return this.api.get<WabaPhoneNumber[]>('/admin/waba/phones/pending-removal');
  }

  deregisterPhone(phoneId: string): Observable<{ deregistered: boolean; message: string }> {
    return this.api.post(`/admin/waba/phones/${phoneId}/deregister`, {});
  }

  markPhoneRemoved(phoneId: string): Observable<{ removed: boolean; message: string }> {
    return this.api.post(`/admin/waba/phones/${phoneId}/mark-removed`, {});
  }

  // ─── Phone Onboarding ──────────────────────────────────────────────────────

  getOnboardingStatus(phoneId: string): Observable<OnboardingStatus> {
    return this.api.get<OnboardingStatus>(`/admin/waba/phones/${phoneId}/onboarding-status`);
  }

  startOnboarding(phoneId: string, tenantId: string): Observable<OnboardingStatus> {
    return this.api.post<OnboardingStatus>(`/admin/waba/phones/${phoneId}/onboard`, { tenantId });
  }

  requestCode(phoneId: string, method: 'SMS' | 'VOICE' = 'SMS'): Observable<any> {
    return this.api.post(`/admin/waba/phones/${phoneId}/request-code`, { method });
  }

  verifyCode(phoneId: string, code: string): Observable<any> {
    return this.api.post(`/admin/waba/phones/${phoneId}/verify-code`, { code });
  }

  registerPhone(phoneId: string, pin: string): Observable<any> {
    return this.api.post(`/admin/waba/phones/${phoneId}/register`, { pin });
  }

  completeOnboarding(phoneId: string): Observable<OnboardingStatus> {
    return this.api.post<OnboardingStatus>(`/admin/waba/phones/${phoneId}/complete`, {});
  }

  /**
   * Register a phone number for a specific tenant under the platform WABA.
   */
  registerForTenant(phone: string, tenantId: string): Observable<any> {
    return this.api.post('/admin/waba/phones/register-for-tenant', { phone, tenantId });
  }

  // ─── Templates ──────────────────────────────────────────────────────────────

  getTemplates(wabaAccountId?: string, tenantId?: string): Observable<WabaTemplate[]> {
    const params: QueryParams = {};
    if (wabaAccountId) params['wabaAccountId'] = wabaAccountId;
    if (tenantId) params['tenantId'] = tenantId;
    return this.api.get<WabaTemplate[]>('/admin/waba/templates', params);
  }

  getTemplate(id: string): Observable<WabaTemplate> {
    return this.api.get<WabaTemplate>(`/admin/waba/templates/${id}`);
  }

  createTemplate(data: any): Observable<WabaTemplate> {
    return this.api.post<WabaTemplate>('/admin/waba/templates', data);
  }

  syncTemplates(wabaAccountId: string): Observable<{ synced: number; added: number; updated: number }> {
    return this.api.post('/admin/waba/templates/sync/' + wabaAccountId, {});
  }

  deleteTemplate(id: string): Observable<void> {
    return this.api.delete<void>(`/admin/waba/templates/${id}`);
  }

  // ─── Quality Monitoring ─────────────────────────────────────────────────────

  getQualityHistory(phoneId: string): Observable<QualityScoreEntry[]> {
    return this.api.get<QualityScoreEntry[]>(`/admin/waba/phones/${phoneId}/quality-history`);
  }

  getQualitySummary(): Observable<QualitySummary> {
    return this.api.get<QualitySummary>('/admin/waba/phones/quality/summary');
  }

  // ─── Tokens ─────────────────────────────────────────────────────────────────

  storeToken(wabaAccountId: string, token: string, tokenType?: string): Observable<any> {
    return this.api.post('/admin/waba/tokens', { wabaAccountId, token, tokenType });
  }

  rotateToken(wabaAccountId: string, token: string): Observable<any> {
    return this.api.post(`/admin/waba/tokens/${wabaAccountId}/rotate`, { token });
  }

  // ─── Audit Logs ─────────────────────────────────────────────────────────────

  getAuditLogs(params?: QueryParams): Observable<{ data: AuditLogEntry[]; total: number }> {
    return this.api.get('/admin/waba/audit-logs', params);
  }
}
