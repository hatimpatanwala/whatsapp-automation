import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '../middleware/tenant-resolution.middleware';

export const CurrentTenant = createParamDecorator(
  (data: keyof TenantContext | undefined, ctx: ExecutionContext): TenantContext | string => {
    const request = ctx.switchToHttp().getRequest();
    const tenant = request.tenantContext;

    if (data) {
      return tenant?.[data];
    }

    return tenant;
  },
);
