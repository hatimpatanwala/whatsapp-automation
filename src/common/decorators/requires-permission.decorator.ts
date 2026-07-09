import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PERMISSION_KEY = 'requiresPermission';

export type PermissionLevel = 'read' | 'write';

/**
 * Marks a route as requiring a given access level on a feature for the current
 * tenant user (RBAC). Enforced by {@link PermissionGuard}. The tenant owner and
 * super-admins always pass. `write` implies `read`.
 *
 * @example
 *   @RequiresPermission('orders', 'write')
 *   @Post() create() {}
 */
export const RequiresPermission = (feature: string, level: PermissionLevel = 'read') =>
  SetMetadata(REQUIRES_PERMISSION_KEY, { feature, level });
