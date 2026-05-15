// Patch ioredis BEFORE any other imports (suppresses ECONNREFUSED spam)

// OpenTelemetry must be initialized before any other imports
import './telemetry';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json } from 'express';
/* eslint-disable @typescript-eslint/no-require-imports */
const session = require('express-session');
const RedisStore = require('connect-redis').default;
import Redis from 'ioredis';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

// Optional Sentry initialization
try {
  const Sentry = require('@sentry/node');
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    });
  }
} catch {
  // Sentry is optional
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Raw body parsing for webhook signature verification
  app.use(
    json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // Security
  app.use(helmet());
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');
  console.log(corsOrigin)
  app.enableCors({
    origin: corsOrigin.includes(',') ? corsOrigin.split(',').map((s) => s.trim()) : corsOrigin,
    credentials: true,
  });

  // Global prefix
  const apiPrefix = configService.get<string>('API_PREFIX', 'api');
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health', 'health/liveness', 'health/readiness'],
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
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformResponseInterceptor());

  // Session setup — use Redis if available, otherwise in-memory (dev only)
  let sessionStore: any = undefined; // undefined = express-session default MemoryStore
  const redisUrl = configService.get<string>('REDIS_URL');
  const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
  const redisPort = configService.get<number>('REDIS_PORT', 6379);

  try {
    const redisClient = redisUrl
      ? new Redis(redisUrl, { tls: { rejectUnauthorized: false }, maxRetriesPerRequest: null, enableReadyCheck: false, connectTimeout: 3000 })
      : new Redis({ host: redisHost, port: redisPort, password: configService.get<string>('REDIS_PASSWORD', undefined), connectTimeout: 3000, lazyConnect: true });

    if (!redisUrl) await redisClient.connect();
    // Quick ping test
    await redisClient.ping();
    sessionStore = new RedisStore({ client: redisClient, prefix: 'sess:' });
    logger.log('Session store: Redis');
  } catch {
    logger.warn('Redis unavailable — using in-memory session store (sessions lost on restart)');
  }

  // app.use(
  //   session({
  //     store: redisStore,
  //     secret: configService.get<string>('SESSION_SECRET', 'change-me'),
  //     resave: false,
  //     saveUninitialized: false,
  //     cookie: {
  //       maxAge: configService.get<number>('SESSION_TTL', 86400) * 1000,
  //       httpOnly: true,
  //       secure: configService.get<string>('NODE_ENV') === 'production',
  //       sameSite: 'lax',
  //     },
  //   }),
  // );
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  app.use(
    session({
      ...(sessionStore ? { store: sessionStore } : {}),
      secret: configService.get<string>('SESSION_SECRET', 'change-me'),
      resave: false,
      saveUninitialized: false,
      proxy: isProduction,
      cookie: {
        maxAge: configService.get<number>('SESSION_TTL', 86400) * 1000,
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
      },
    }),
  );
  // Enable graceful shutdown hooks (drain queues, close connections)
  app.enableShutdownHooks();

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Application running on port ${port}`);
}

bootstrap();
