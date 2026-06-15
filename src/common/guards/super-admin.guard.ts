import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Requires an authenticated super-admin session. Apply at the class level on
 * platform-admin controllers whose routes are not individually role-decorated.
 * Honours @Public() so the admin login route stays reachable.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const session = context.switchToHttp().getRequest().session;
    if (!session?.isAdmin || !session?.adminId) {
      throw new ForbiddenException('Super admin access required');
    }
    return true;
  }
}
