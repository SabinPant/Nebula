/**
 * Root Application Module
 *
 * Top-level NestJS module. Imports all feature modules and global configuration.
 * ConfigModule and RedisClient are global — available in every module without re-importing.
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configValidationSchema } from './core/config/config.validation';
import { AuthModule } from './modules/auth/auth.module';
import { RedisClient } from './core/database/redis.client';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      validationSchema: configValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    AuthModule,
  ],
  controllers: [],
  providers: [RedisClient],
  exports: [RedisClient],
})
export class AppModule {}