import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Functional HTTP interceptor responsible for session-cookie authentication.
 *
 * - Adds `withCredentials: true` to every request so the browser sends the
 *   HttpOnly session cookie to the backend (including cross-origin requests
 *   when the API lives on a different port in development).
 * - Handles 401 Unauthorized responses globally: clears the in-memory user
 *   signal and redirects to /auth/login without triggering an infinite loop
 *   by excluding the /auth/* endpoints.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);

  const authenticatedReq = req.clone({ withCredentials: true });

  return next(authenticatedReq).pipe(
    catchError((error) => {
      if (
        error.status === 401 &&
        !req.url.includes('/auth/login') &&
        !req.url.includes('/auth/register')
      ) {
        // Session has expired or cookie is invalid — clear client state.
        auth.currentUser.set(null);
        router.navigate(['/auth/login'], {
          queryParams: { sessionExpired: 'true' },
        });
      }
      return throwError(() => error);
    }),
  );
};
