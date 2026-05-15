import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FeatureService } from '../services/feature.service';

/**
 * Route guard factory that checks if the tenant's plan includes a specific feature.
 * Redirects to the upgrade page if the feature is not enabled.
 *
 * Usage: canActivate: [featureGuard('campaigns')]
 */
export function featureGuard(featureKey: string): CanActivateFn {
  return () => {
    const featureService = inject(FeatureService);
    const router = inject(Router);

    if (featureService.hasFeature(featureKey)) {
      return true;
    }

    return router.createUrlTree(['/settings/upgrade'], {
      queryParams: { feature: featureKey },
    });
  };
}
