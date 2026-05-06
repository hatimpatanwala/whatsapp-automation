import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs';

/**
 * Unwraps the backend's standard response envelope.
 * Backend returns: { success: true, data: <payload> }
 * This interceptor extracts just the `data` property so services
 * don't need to deal with the wrapper.
 */
export const apiResponseInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    map((event) => {
      if (event instanceof HttpResponse && event.body && typeof event.body === 'object') {
        const body = event.body as Record<string, unknown>;
        if ('success' in body && 'data' in body) {
          return event.clone({ body: body['data'] });
        }
      }
      return event;
    }),
  );
};
