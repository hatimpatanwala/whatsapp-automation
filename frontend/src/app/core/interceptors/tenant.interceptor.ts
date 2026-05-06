import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/** localStorage key used to persist the active tenant context. */
const TENANT_ID_KEY = 'x-tenant-id';

/**
 * Functional HTTP interceptor that injects the `X-Tenant-ID` header on every
 * outgoing API request so the backend can scope data to the correct tenant.
 *
 * Tenant ID resolution order:
 *  1. The currently authenticated user's `tenantId` (from the auth signal).
 *  2. A value stored in localStorage under `x-tenant-id` (used when the
 *     super admin is impersonating / viewing a specific tenant).
 *
 * Super-admin requests that target `/admin/*` endpoints do not require the
 * header and it is intentionally omitted when no tenant context is available.
 */
export const tenantInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // Resolve tenant ID from the signal or from the persisted context.
  const tenantId =
    auth.currentUser()?.tenantId ??
    (typeof localStorage !== 'undefined' ? localStorage.getItem(TENANT_ID_KEY) : null);

  // Skip adding the header when there is no tenant context (super admin
  // global requests) or when the request already carries the header.
  if (!tenantId || req.headers.has('X-Tenant-ID')) {
    return next(req);
  }

  const tenantReq = req.clone({
    headers: req.headers.set('X-Tenant-ID', tenantId),
  });

  return next(tenantReq);
};

// ─── Helpers for the super admin impersonation flow ───────────────────────────

/**
 * Persist a tenant ID in localStorage so the interceptor can inject it on
 * subsequent requests (e.g. while the super admin is viewing a tenant).
 */
export function setActiveTenantContext(tenantId: string): void {
  localStorage.setItem(TENANT_ID_KEY, tenantId);
}

/**
 * Clear the persisted tenant context (e.g. when the super admin stops
 * impersonating and returns to the global admin view).
 */
export function clearActiveTenantContext(): void {
  localStorage.removeItem(TENANT_ID_KEY);
}

/**
 * Read the currently persisted tenant context without injecting the service.
 */
export function getActiveTenantContext(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(TENANT_ID_KEY) : null;
}
