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
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/filters/http-exception.filter';

// cookie-parser uses CommonJS module.exports = function
// The @types package expects ESM default import but the runtime export is a bare function
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

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

  const port = process.env.PORT || configService.get<number>('APP_PORT') || 3001;

  await app.listen(port);
  console.log(`Nebula server running on port ${port}`);
}

bootstrap();