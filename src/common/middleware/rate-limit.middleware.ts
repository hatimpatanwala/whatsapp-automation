import { Injectable, NestMiddleware, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.module';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly windowMs = 60000; // 1 minute
  private readonly maxRequests = 100; // per tenant per minute

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantContext?.id || 'anonymous';
      const key = `ratelimit:${tenantId}:${Math.floor(Date.now() / this.windowMs)}`;

      const current = await this.redis.incr(key);
      if (current === 1) {
        await this.redis.expire(key, Math.ceil(this.windowMs / 1000));
      }

      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - current));

      if (current > this.maxRequests) {
        throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (err) {
      // If Redis is down, skip rate limiting rather than blocking all requests
      if (err instanceof HttpException) throw err;
      // Redis error — allow request through
    }

    next();
  }
}
