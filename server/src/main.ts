import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // Security headers — 14 headers set by default
  app.use(helmet());

  // Cookie parser — required for refresh token HTTP-only cookies
  app.use(cookieParser());

  // CORS — locked to exact origin from env, credentials enabled for cookies
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

  // Global validation pipe — strips unknown fields, rejects non-whitelisted
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter will be registered here when created
  // app.useGlobalFilters(new GlobalExceptionFilter());

  // Use PORT from Render in production, fall back to APP_PORT from env
  const port = process.env.PORT || configService.get<number>('APP_PORT') || 3001;

  await app.listen(port);
  console.log(`Nebula server running on port ${port}`);
}

bootstrap();