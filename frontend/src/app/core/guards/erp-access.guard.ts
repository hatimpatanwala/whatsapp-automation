import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ErpAccessService } from '../services/erp-access.service';

/**
 * Guards the /erp area. Allows access when the tenant has ERP enabled (full) OR is
 * downgraded-but-provisioned (read-only — they can view/export their data). Only a
 * tenant that never had ERP (or lost it without data) is redirected to upgrade.
 *
 * Unlike featureGuard('erp') (which reads the login-session feature list), this
 * checks the live /erp/status so read-only access works without re-login.
 */
export const erpAccessGuard: CanActivateFn = async () => {
  const access = inject(ErpAccessService);
  const router = inject(Router);
  const { enabled, readOnly } = await access.ensure();
  if (enabled || readOnly) return true;
  return router.createUrlTree(['/settings/upgrade'], { queryParams: { feature: 'erp' } });
};
