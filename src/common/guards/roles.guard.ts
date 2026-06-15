import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// Platform (super-admin) roles vs tenant-scoped roles live in separate
// namespaces and never overlap.
const SUPER_ADMIN_ROLES = ['admin', 'support'];

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const session = context.switchToHttp().getRequest().session;
    const isAdmin = !!session?.isAdmin;
    const requiresAdminRole = requiredRoles.some((r) => SUPER_ADMIN_ROLES.includes(r));

    if (isAdmin) {
      // Super-admin routes: enforce the specific admin role (admin vs support).
      if (requiresAdminRole) {
        if (requiredRoles.includes(session?.adminRole)) return true;
        throw new ForbiddenException('Insufficient permissions');
      }
      // Tenant-scoped @Roles route reached while impersonating a tenant — allow.
      return true;
    }

    // Tenant user. Block them from admin-role routes outright.
    if (requiresAdminRole) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const userRole = session?.userRole;
    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
