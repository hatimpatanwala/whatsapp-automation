import { Injectable, NestMiddleware, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.module';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly windowMs = 60000; // 1 minute
  private readonly maxRequests = 100; // per tenant per minute
  // Strict per-IP limit for credential/OTP endpoints (brute-force defense).
  private readonly authWindowMs = 60000;
  private readonly maxAuthRequests = 10;
  private readonly authPathRe =
    /(auth\/login|auth\/send-email-otp|auth\/verify-email-otp|auth\/signup|admin-whatsapp\/(send-otp|verify-otp)|request-otp|verify-otp)/i;

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      // Per-IP throttle on sensitive auth/OTP endpoints.
      if (this.authPathRe.test(req.path)) {
        const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString();
        const akey = `ratelimit:auth:${ip}:${Math.floor(Date.now() / this.authWindowMs)}`;
        const ac = await this.redis.incr(akey);
        if (ac === 1) await this.redis.expire(akey, Math.ceil(this.authWindowMs / 1000));
        if (ac > this.maxAuthRequests) {
          throw new HttpException('Too many attempts. Please wait a minute and try again.', HttpStatus.TOO_MANY_REQUESTS);
        }
      }

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
