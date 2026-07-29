import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, of, throwError } from 'rxjs';
import { OfflineQueueService, SKIP_OFFLINE_QUEUE } from '../services/offline-queue.service';

/**
 * Parks field-sales writes that fail because the device is offline, then lets
 * the UI proceed optimistically. A synthetic 202 (`{ queued: true }`) is
 * returned so the caller's success path runs; OfflineQueueService replays the
 * real request when connectivity returns.
 */
export const offlineQueueInterceptor: HttpInterceptorFn = (req, next) => {
  const queue = inject(OfflineQueueService);

  // Replayed requests (and anything not a queueable field-sales write) pass straight through.
  if (req.context.get(SKIP_OFFLINE_QUEUE) || !OfflineQueueService.isQueueable(req.method, req.url)) {
    return next(req);
  }

  return next(req).pipe(
    catchError((err) => {
      const offline = err?.status === 0 || (typeof navigator !== 'undefined' && !navigator.onLine);
      if (offline) {
        queue.enqueue(req.method, req.url, req.body);
        return of(new HttpResponse({ status: 202, body: { queued: true } }));
      }
      return throwError(() => err);
    }),
  );
};
