/**
 * Root Application Module
 *
 * Top-level NestJS module. Imports all feature modules and global configuration.
 * ConfigModule is global — available in every module without re-importing.
 *
 * New feature modules are added to the imports array as they are built.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configValidationSchema } from './core/config/config.validation';
import { AuthModule } from './modules/auth/auth.module';

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
  providers: [],
})
export class AppModule {}