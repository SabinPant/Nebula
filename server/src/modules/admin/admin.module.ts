/**
 * Admin Module
 *
 * Wires together the admin panel's controller and guard. Business logic
 * for each domain (broker applications, users, top-ups, etc.) lives in
 * that domain's own module/service — AdminModule imports those modules
 * and AdminController composes their services under the /admin prefix,
 * rather than duplicating logic here.
 *
 * Imports AuthModule for JwtAuthGuard (JwtStrategy, token verification).
 * Imports BrokerModule for BrokerService (broker application approve/
 * reject — moved here from BrokerController in Sprint 13).
 * Imports TradingModule for TradingRepository — user suspension cancels
 * pending orders via the same order-cancellation.helper.ts logic
 * TradingService.cancelOrder() uses, rather than reimplementing it.
 * TokenStorage and RedisClient come from SharedModule/AppModule, both
 * genuinely @Global() providers. PrismaService is registered directly
 * in this module's own providers instead — @Global() on AppModule only
 * affects AppModule's own `exports` array (which is [RedisClient] only),
 * it does NOT make AppModule's other local providers globally injectable.
 * Every module in this codebase that uses PrismaService declares it
 * locally for this reason; AdminModule follows the same pattern.
 * JwtModule is registered async here so JwtService is available for
 * injection within this module, same pattern as AuthModule itself.
 *
 * EventEmitterModule.forRoot() is registered explicitly (not relied upon
 * from another eagerly-loaded module) — TradingModule's own docstring
 * documents exactly this mistake from Sprint 9: TradingService injected
 * EventEmitter2 without TradingModule importing EventEmitterModule, and it
 * only worked by accident because another module happened to register the
 * global instance first. AdminService (overrideTopUp's topup:credited
 * emit) needs EventEmitter2 too, so this module registers it directly
 * rather than repeating that fragile ordering dependency.
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AdminController } from './admin.controller';
import { AdminGuard } from './guards/admin.guard';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';
import { AuthModule } from '../auth/auth.module';
import { BrokerModule } from '../broker/broker.module';
import { TradingModule } from '../trading/trading.module';
import { PrismaService } from '../../core/database/prisma.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRY'),
        },
      }),
    }),
    AuthModule,
    BrokerModule,
    TradingModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [AdminController],
  providers: [AdminGuard, AdminService, AdminRepository, PrismaService],
  exports: [AdminGuard],
})
export class AdminModule {}
