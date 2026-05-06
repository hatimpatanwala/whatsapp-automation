import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantConnectionManager } from '../../database/tenant-connection.manager';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantConnectionManager: TenantConnectionManager) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();

    if (request.tenantContext?.schemaName) {
      // Store the schema name for downstream services to use
      request['tenantSchema'] = request.tenantContext.schemaName;
    }

    return next.handle();
  }
}
