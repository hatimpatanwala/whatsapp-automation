import { Injectable, inject, computed } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Feature keys that map to gatable sidebar/route features.
 * Core features (dashboard, products, orders, inventory, payments, settings) are always enabled.
 */
export const FEATURE_KEYS = {
  deliveries: 'deliveries',
  customers: 'customers',
  campaigns: 'campaigns',
  conversations: 'conversations',
  quotes: 'quotes',
  whatsappCatalog: 'whatsappCatalog',
  workflowBuilder: 'workflowBuilder',
  aiFeatures: 'aiFeatures',
  advancedAnalytics: 'advancedAnalytics',
  multiCatalog: 'multiCatalog',
  // Premium ERP/CRM layer. `erp` is the master switch that toggles the ERP
  // navigation section; the sub-keys gate individual ERP areas so plans can be
  // packaged at different tiers (see public migration 007_erp_feature_flag).
  erp: 'erp',
  erpInvoicing: 'erpInvoicing',
  erpCrm: 'erpCrm',
  erpProcurement: 'erpProcurement',
  erpHr: 'erpHr',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly auth = inject(AuthService);

  readonly enabledFeatures = computed(() =>
    this.auth.subscriptionInfo()?.enabledFeatures ?? [],
  );

  readonly enabledFeaturesSet = computed(() =>
    new Set(this.enabledFeatures()),
  );

  readonly currentPlanName = computed(() =>
    this.auth.subscriptionInfo()?.planName ?? this.auth.subscriptionInfo()?.plan ?? 'Free',
  );

  hasFeature(key: string): boolean {
    return this.enabledFeaturesSet().has(key);
  }
}
