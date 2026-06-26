/**
 * Root Application Module
 *
 * Top-level NestJS module. Imports all feature modules and global configuration.
 * ConfigModule, RedisClient, and ThrottlerModule are global — available everywhere.
 *
 * ThrottlerModule uses Redis storage for rate limiting — never in-memory.
 * This ensures limits work across multiple server instances in production.
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerGuard } from './core/guards/throttler.guard';
import { configValidationSchema } from './core/config/config.validation';
import { AuthModule } from './modules/auth/auth.module';
import { RedisClient } from './core/database/redis.client';
import { ThrottlerRedisStorage } from './core/config/throttler-redis.storage';
import { RATE_LIMITS } from './core/config/rate-limit.config';
import { BrokerModule } from './modules/broker/broker.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { MarketModule } from './modules/market/market.module';
import { SharedModule } from './shared/shared.module';
import { HealthController } from './health.controller';
import { PrismaService } from './core/database/prisma.service';
import { TradingModule } from './modules/trading/trading.module';
import { ScheduleModule } from '@nestjs/schedule';
import { DailyResetCron } from './cron/daily-reset.cron';

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
    ThrottlerModule.forRootAsync({
      inject: [RedisClient],
      useFactory: (redisClient: RedisClient) => ({
        throttlers: [{
          ttl: RATE_LIMITS.GLOBAL.ttl,
          limit: RATE_LIMITS.GLOBAL.limit,
        }],
        storage: new ThrottlerRedisStorage(redisClient),
      }),
    }),
    AuthModule,
    BrokerModule,
    WalletModule,
    MarketModule,
    TradingModule,
    SharedModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [HealthController],
   providers: [
    RedisClient,
    PrismaService,
    DailyResetCron,
    {
      provide: 'APP_GUARD',
      useClass: ThrottlerGuard,
    },
  ],
  exports: [RedisClient],
})
export class AppModule {}