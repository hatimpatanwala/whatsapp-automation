import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/**
 * Base API service. All feature services extend or inject this to gain a
 * pre-configured HttpClient pointed at the backend base URL.
 *
 * The auth interceptor adds `withCredentials: true` for session cookies.
 * The tenant interceptor injects the `X-Tenant-ID` header automatically.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly http = inject(HttpClient);
  readonly baseUrl = environment.apiUrl;

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Build an absolute API URL from a relative path. */
  url(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  /** Convert a plain object to Angular HttpParams, dropping null/undefined values. */
  buildParams(params?: QueryParams): HttpParams {
    let httpParams = new HttpParams();
    if (!params) return httpParams;

    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined) {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return httpParams;
  }

  // ─── Generic CRUD wrappers ─────────────────────────────────────────────────

  get<T>(path: string, params?: QueryParams, context?: HttpContext): Observable<T> {
    return this.http.get<T>(this.url(path), {
      withCredentials: true,
      params: this.buildParams(params),
      ...(context ? { context } : {}),
    });
  }

  post<T>(path: string, body: unknown, context?: HttpContext): Observable<T> {
    return this.http.post<T>(this.url(path), body, {
      ...(context ? { context } : {}),
      withCredentials: true,
    });
  }

  put<T>(path: string, body: unknown, context?: HttpContext): Observable<T> {
    return this.http.put<T>(this.url(path), body, {
      ...(context ? { context } : {}),
      withCredentials: true,
    });
  }

  patch<T>(path: string, body: unknown, context?: HttpContext): Observable<T> {
    return this.http.patch<T>(this.url(path), body, {
      ...(context ? { context } : {}),
      withCredentials: true,
    });
  }

  delete<T>(path: string, context?: HttpContext): Observable<T> {
    return this.http.delete<T>(this.url(path), {
      ...(context ? { context } : {}),
      withCredentials: true,
    });
  }
}
