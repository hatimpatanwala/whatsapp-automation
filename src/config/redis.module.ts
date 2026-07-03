import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const logger = new Logger('RedisModule');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('REDIS_URL');
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);
        const password = configService.get<string>('REDIS_PASSWORD', undefined);

        // Desktop (offline) mode: Redis is absent by design — commands must fail fast
        // (health checks would otherwise hang forever on maxRetriesPerRequest: null)
        // and the client must not enter an endless reconnect storm.
        const isDesktop = configService.get<string>('DESKTOP_MODE') === '1';
        const desktopOpts = isDesktop
          ? { maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: () => null as unknown as number }
          : { maxRetriesPerRequest: null as unknown as number };

        const client = url
          ? new Redis(url, { tls: { rejectUnauthorized: false }, enableReadyCheck: false, ...desktopOpts })
          : new Redis({ host, port, password, ...desktopOpts });

        client.on('connect', () => logger.log(`Redis connected to ${url ? 'Upstash' : host + ':' + port}`));
        client.on('error', () => {}); // Suppress — patch-ioredis handles logging

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
