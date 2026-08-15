/**
 * Application Entry Point
 *
 * Bootstraps the NestJS server with all global middleware and configuration.
 * Sets up Helmet (security headers), CORS (locked to env origin), cookie parsing
 * (refresh token HTTP-only cookies), and global validation (DTO whitelist).
 *
 * ConfigService validates all environment variables on startup via Joi —
 * the server refuses to start with missing or invalid configuration.
 *
 * The global exception filter is registered here so every thrown HttpException
 * is caught and returned in the standardized { statusCode, error, message, code, timestamp } shape.
 *
 * Graceful shutdown handles SIGTERM/SIGINT for zero-downtime deployments
 * on Render, AWS ECS, or any container orchestration platform.
 *
 * Trust proxy is enabled so req.ip returns the real client IP behind
 * reverse proxies (Render LB, AWS ALB, Nginx, CloudFront).
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/filters/http-exception.filter';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        process.env.NODE_ENV === 'production'
          ? winston.format.json()
          : winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(({ timestamp, level, message, context }) => {
                return `[${timestamp}] ${level} [${context || 'Nest'}] ${message}`;
              }),
            ),
      ),
      transports: [new winston.transports.Console()],
    }),
  });

  const configService = app.get(ConfigService);

  // Trust the first proxy for correct client IP behind reverse proxies
  // Works with: Render LB, AWS ALB/NLB, Nginx, CloudFront, Cloudflare
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Idempotency-Key',
      'X-Device-Id',
      // Required on POST /auth/refresh — see auth.controller.ts's refresh()
      // docstring. A cross-site page can't set this header without a CORS
      // preflight, and the preflight only succeeds for CORS_ORIGIN, so this
      // closes the one CSRF gap the sameSite:none refresh cookie leaves open.
      'X-Requested-With',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.setGlobalPrefix('/api/v1');

  const port = process.env.PORT || configService.get<number>('APP_PORT') || 3001;
  await app.listen(port);
  console.log(`Nebula server running on port ${port}`);

  // Graceful shutdown for zero-downtime deployments
  const shutdown = async (signal: string) => {
    console.log(`${signal} received — closing gracefully`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();