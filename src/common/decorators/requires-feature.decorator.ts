import { SetMetadata } from '@nestjs/common';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';

/**
 * Marks a route (or controller) as requiring one or more plan features to be
 * enabled on the tenant's active subscription plan (SubscriptionPlan.features).
 *
 * Enforced by {@link ErpFeatureGuard}. All listed features must be true.
 *
 * @example
 *   @UseGuards(TenantGuard, ErpFeatureGuard)
 *   @RequiresFeature('erp')
 *   @Controller('erp/invoices')
 *   export class ErpInvoiceController {}
 */
export const RequiresFeature = (...features: string[]) =>
  SetMetadata(REQUIRES_FEATURE_KEY, features);
