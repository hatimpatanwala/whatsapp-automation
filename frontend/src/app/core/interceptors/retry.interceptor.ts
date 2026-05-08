import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { retry, timer } from 'rxjs';

/**
 * HTTP retry interceptor with exponential backoff.
 *
 * Retries:
 * - 429 (Too Many Requests): waits 2s, 4s
 * - 5xx (Server Error): waits 1s, 2s
 * - Does NOT retry 4xx client errors (except 429)
 * - Does NOT retry non-idempotent methods (POST, PATCH, DELETE) unless it's a GET or webhook
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  const isIdempotent = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';

  return next(req).pipe(
    retry({
      count: isIdempotent ? 2 : 0,
      delay: (error, retryCount) => {
        // Rate limited — use longer backoff
        if (error.status === 429) {
          return timer(retryCount * 2000);
        }
        // Server errors — short backoff
        if (error.status >= 500) {
          return timer(retryCount * 1000);
        }
        // Client errors (4xx except 429) — don't retry
        throw error;
      },
    }),
  );
};
