import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { PermissionService } from '../services/permission.service';

/**
 * Blocks navigation to create/edit (write) routes for read-only users — a role
 * with no `write` on any feature (e.g. "Viewer"). The backend already rejects
 * their writes with 403; this stops the UI from even opening a data-entry screen
 * (whether reached via the menu, a function key, or a direct URL).
 *
 * Owners and any role with write permission pass through unchanged.
 */
export const writeGuard: CanActivateFn = async (_route, state) => {
  const perms = inject(PermissionService);
  const router = inject(Router);
  await perms.ensure();
  if (!perms.isReadOnly()) return true;

  try {
    inject(MessageService).add({
      severity: 'warn',
      summary: 'Read-only access',
      detail: 'Your role can view but not create or edit. Ask an admin for write access.',
      life: 4000,
    });
  } catch {
    /* MessageService not in scope — redirect silently */
  }
  const url = state.url;
  const back = url.startsWith('/products') ? '/products'
    : url.startsWith('/entry') || url.startsWith('/accounting') || url.startsWith('/home') ? '/home'
    : '/dashboard';
  return router.createUrlTree([back]);
};
