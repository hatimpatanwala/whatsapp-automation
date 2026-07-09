import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_PERMISSION_KEY, PermissionLevel } from '../decorators/requires-permission.decorator';
import { AccessService } from '../../modules/access/access.service';
import { levelSatisfies } from '../../modules/access/access.constants';

/**
 * Enforces @RequiresPermission(feature, level) for tenant users. The owner/admin
 * always passes; super-admin sessions pass (platform staff). Everyone else must
 * hold the required level on the feature in their resolved RBAC permission map.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<{ feature: string; level: PermissionLevel }>(
      REQUIRES_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) return true;

    const req = context.switchToHttp().getRequest();
    const session = req.session || {};
    if (session.isAdmin) return true; // platform super-admin
    const schema = req.tenantContext?.schemaName || session.tenantSchema;
    const userId = session.userId;
    if (!schema || !userId) throw new ForbiddenException('Sign in to continue');
    // Fast path: owner/admin role from the session.
    if (session.userRole === 'owner' || session.userRole === 'admin') return true;

    const { owner, permissions } = await this.access.getPermissions(schema, userId);
    if (owner) return true;
    if (levelSatisfies(permissions[meta.feature], meta.level)) return true;

    throw new ForbiddenException(
      `You don't have ${meta.level} access to ${meta.feature}. Ask your admin to update your role.`,
    );
  }
}
