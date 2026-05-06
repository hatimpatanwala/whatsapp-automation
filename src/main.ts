import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
/* eslint-disable @typescript-eslint/no-require-imports */
const session = require('express-session');
const RedisStore = require('connect-redis').default;
import Redis from 'ioredis';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Security
  app.use(helmet());
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN', '*'),
    credentials: true,
  });

  // Global prefix
  const apiPrefix = configService.get<string>('API_PREFIX', 'api');
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health'],
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters & interceptors
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformResponseInterceptor(),
  );

  // Session setup with Redis
  const redisClient = new Redis({
    host: configService.get<string>('REDIS_HOST', 'localhost'),
    port: configService.get<number>('REDIS_PORT', 6379),
    password: configService.get<string>('REDIS_PASSWORD', undefined),
  });

  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'sess:',
  });

  app.use(
    session({
      store: redisStore,
      secret: configService.get<string>('SESSION_SECRET', 'change-me'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: configService.get<number>('SESSION_TTL', 86400) * 1000,
        httpOnly: true,
        secure: configService.get<string>('NODE_ENV') === 'production',
        sameSite: 'lax',
      },
    }),
  );

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`🚀 Application running on port ${port}`);
}

bootstrap();
