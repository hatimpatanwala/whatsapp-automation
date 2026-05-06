import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { OnboardingService } from '../services/onboarding.service';
import { firstValueFrom } from 'rxjs';

/**
 * Guard that checks if the tenant has completed onboarding.
 * If not, redirects to /onboarding.
 *
 * This guard runs AFTER authGuard, so the user is always authenticated.
 */
export const onboardingGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const onboardingService = inject(OnboardingService);

  try {
    const status = await firstValueFrom(onboardingService.getStatus());
    if (status.currentStep === 'completed') {
      return true;
    }
    // Not completed — redirect to onboarding
    return router.createUrlTree(['/onboarding']);
  } catch {
    // If we can't check status (e.g. new tenant), allow through
    // The dashboard or onboarding page will handle it
    return true;
  }
};
