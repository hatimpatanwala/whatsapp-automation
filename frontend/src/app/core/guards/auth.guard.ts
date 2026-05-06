import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { firstValueFrom } from 'rxjs';

export const authGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  try {
    await firstValueFrom(auth.rehydrateSession());
    return auth.isAuthenticated()
      ? true
      : router.createUrlTree(['/auth/login'], {
          queryParams: { returnUrl: state.url },
        });
  } catch {
    return router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: state.url },
    });
  }
};
