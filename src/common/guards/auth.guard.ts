import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly sessionSecret: string;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    this.sessionSecret = this.configService.get<string>('SESSION_SECRET', '');
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const session = request.session;

    // Authenticated if either a tenant-user session (userId) or a super-admin
    // session (adminId) is present.
    if (!session || (!session.userId && !session.adminId)) {
      throw new UnauthorizedException('Authentication required');
    }

    // Validate session age
    if (session.createdAt) {
      const sessionAge = Date.now() - new Date(session.createdAt).getTime();
      if (sessionAge > MAX_SESSION_AGE_MS) {
        throw new UnauthorizedException('Session expired');
      }
    }

    // Validate session integrity via HMAC if session secret is configured
    if (this.sessionSecret && session.integrity) {
      const expectedHash = createHmac('sha256', this.sessionSecret)
        .update(`${session.userId}:${session.tenantId}:${session.createdAt}`)
        .digest('hex');
      if (expectedHash !== session.integrity) {
        throw new UnauthorizedException('Session integrity check failed');
      }
    }

    return true;
  }
}
