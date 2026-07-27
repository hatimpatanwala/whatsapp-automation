import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FeatureService } from '../services/feature.service';

/**
 * Route guard factory that checks if the tenant's plan includes a specific feature.
 * Redirects to the upgrade page if the feature is not enabled.
 *
 * Usage: canActivate: [featureGuard('campaigns')]
 * Multiple keys pass if ANY is enabled, e.g. featureGuard('quotes', 'erp') so the
 * ERP suite unlocks quoting for ERP tenants alongside the standalone plan feature.
 */
export function featureGuard(...featureKeys: string[]): CanActivateFn {
  return () => {
    const featureService = inject(FeatureService);
    const router = inject(Router);

    if (featureKeys.some((k) => featureService.hasFeature(k))) {
      return true;
    }

    return router.createUrlTree(['/settings/upgrade'], {
      queryParams: { feature: featureKeys[0] },
    });
  };
}
