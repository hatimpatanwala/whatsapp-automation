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

        const client = url
          ? new Redis(url, { tls: { rejectUnauthorized: false }, maxRetriesPerRequest: null, enableReadyCheck: false })
          : new Redis({ host, port, password, maxRetriesPerRequest: null });

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
