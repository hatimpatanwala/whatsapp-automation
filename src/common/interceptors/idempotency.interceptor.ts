import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.module';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly ttlSeconds = 3600; // 1 hour

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['x-idempotency-key'] as string;

    if (!idempotencyKey) {
      return next.handle();
    }

    const tenantId = request.tenantContext?.id || 'global';
    const cacheKey = `idempotent:${tenantId}:${idempotencyKey}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return of(JSON.parse(cached));
    }

    return next.handle().pipe(
      tap(async (response) => {
        await this.redis.setex(cacheKey, this.ttlSeconds, JSON.stringify(response));
      }),
    );
  }
}
