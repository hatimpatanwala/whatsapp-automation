import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { firstValueFrom } from 'rxjs';

export const adminGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isSuperAdmin()) {
    return true;
  }

  try {
    await firstValueFrom(auth.rehydrateSession());
    if (auth.isSuperAdmin()) {
      return true;
    }
  } catch {
    // Not authenticated
  }

  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
};
