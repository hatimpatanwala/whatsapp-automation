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

  // Raw body parsing for webhook signature verification (bounded to limit DoS).
  app.use(
    json({
      limit: configService.get<string>('JSON_BODY_LIMIT', '1mb'),
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // Security
  app.use(helmet());

  // CORS: never combine a wildcard origin with credentials (cookie auth). Require
  // an explicit allowlist in production; reflect origin only in development.
  const isProductionEnv = configService.get<string>('NODE_ENV') === 'production';
  const corsList = configService.get<string>('CORS_ORIGIN', '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const wildcard = corsList.length === 0 || corsList.includes('*');
  let corsOrigin: any;
  if (wildcard) {
    if (isProductionEnv) {
      logger.warn('CORS_ORIGIN is wildcard/empty in production — restricting to same-origin only. Set CORS_ORIGIN to your frontend domain(s) to allow cross-origin.');
      corsOrigin = false; // disables CORS headers → same-origin requests still work
    } else {
      corsOrigin = true; // dev convenience: reflect the requesting origin
    }
  } else {
    corsOrigin = corsList.length === 1 ? corsList[0] : corsList;
  }
  app.enableCors({ origin: corsOrigin, credentials: true });

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
    // TLS cert validation on by default; opt out only via REDIS_TLS_INSECURE=true.
    const redisTlsInsecure = configService.get<string>('REDIS_TLS_INSECURE', 'false') === 'true';
    const redisClient = redisUrl
      ? new Redis(redisUrl, { tls: { rejectUnauthorized: !redisTlsInsecure }, maxRetriesPerRequest: null, enableReadyCheck: false, connectTimeout: 3000 })
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

  // Session signing secret must be strong in production — never the placeholder.
  let sessionSecret = configService.get<string>('SESSION_SECRET', '');
  if (isProduction && (!sessionSecret || sessionSecret.length < 16 || sessionSecret === 'change-me')) {
    throw new Error('SESSION_SECRET must be set to a strong (16+ char) value in production');
  }
  if (!sessionSecret) sessionSecret = 'dev-insecure-session-secret';

  app.use(
    session({
      ...(sessionStore ? { store: sessionStore } : {}),
      secret: sessionSecret,
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
