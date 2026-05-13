import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        console.log(configService.get("REDIS_URL"))
        return configService.get<string>('REDIS_URL')
          ? new Redis(configService.get<string>('REDIS_URL'), {
              tls: {},
              maxRetriesPerRequest: null,
              enableReadyCheck: false,
            })
          : new Redis({
              host: configService.get<string>('REDIS_HOST', 'localhost'),
              port: configService.get<number>('REDIS_PORT', 6379),
              password: configService.get<string>('REDIS_PASSWORD', undefined),
              maxRetriesPerRequest: null,
            });
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
