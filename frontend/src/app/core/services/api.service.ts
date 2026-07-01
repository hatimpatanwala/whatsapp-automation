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

  // ─── File download / delivery ──────────────────────────────────────────────

  /**
   * True when running inside the WhatsApp in-app browser (its WebView). That
   * WebView cannot download files — `window.open('_blank')` and blob/`download`
   * links both bounce to the external system browser, ejecting the user out of
   * WhatsApp (and 401-ing on the cookie-less external context). So on this
   * surface we deliver PDFs to the user's chat instead of downloading.
   */
  inAppWebview(): boolean {
    if (typeof window === 'undefined') return false;
    // The portal-login bridge tags the landing URL with `ctx=wa` when opened from
    // WhatsApp; persist it so the whole SPA session knows (survives navigation).
    // This is reliable where the userAgent isn't (iOS WhatsApp doesn't brand it).
    try {
      if (/[?&]ctx=wa\b/.test(window.location.search)) sessionStorage.setItem('wa_webview', '1');
      if (sessionStorage.getItem('wa_webview') === '1') return true;
    } catch { /* sessionStorage may be unavailable */ }
    return /WhatsApp/i.test((navigator && navigator.userAgent) || '');
  }

  /**
   * Get a PDF to the user the right way for their surface:
   *   - Desktop / normal browser → download the file inline.
   *   - WhatsApp webview → POST `sendPath` so the server sends it to their chat.
   */
  deliverPdf(opts: {
    downloadPath: string; filename: string; sendPath: string;
    onSent?: () => void; onError?: (e: unknown) => void;
  }): void {
    if (this.inAppWebview()) {
      this.post(opts.sendPath, {}).subscribe({
        next: () => { if (opts.onSent) opts.onSent(); },
        error: (e) => { if (opts.onError) opts.onError(e); },
      });
    } else {
      this.downloadFile(opts.downloadPath, opts.filename, opts.onError);
    }
  }

  /**
   * Download a file (PDF, xlsx, receipt…) WITHOUT `window.open`.
   *
   * On desktop we fetch the file as a blob through this authenticated client and
   * trigger a same-page save. Inside the WhatsApp WebView (which can't save a
   * blob without ejecting to Chrome) we navigate the current tab to the file so
   * it opens/downloads natively and the user stays in WhatsApp.
   *
   * @param path      API path (relative — same as the other wrappers) or absolute URL.
   * @param filename  Suggested download name.
   * @param onError   Optional callback for surfacing failures to the user.
   */
  downloadFile(path: string, filename: string, onError?: (e: unknown) => void): void {
    const target = /^https?:\/\//.test(path) ? path : this.url(path);
    if (this.inAppWebview()) {
      // Same-tab navigation carries the session cookie and does NOT eject to the
      // external browser the way `_blank` / blob downloads do.
      window.location.href = target;
      return;
    }
    this.http.get(target, { withCredentials: true, responseType: 'blob' }).subscribe({
      next: (blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => { try { URL.revokeObjectURL(objectUrl); } catch { /* noop */ } }, 10000);
      },
      error: (e) => { if (onError) onError(e); },
    });
  }
}
