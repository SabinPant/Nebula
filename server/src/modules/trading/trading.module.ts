import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '../auth/auth.module';
import { TradingController } from './trading.controller';
import { TradingService } from './trading.service';
import { TradingRepository } from './trading.repository';
import { EngineService } from './engine.service';
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
    // EventEmitterModule.forRoot() registers the global EventEmitter2
    // instance. TradingService already injected EventEmitter2 before this
    // change without importing it here — it happened to work only because
    // another eagerly-loaded module (BrokerModule/PortfolioModule)
    // registered it first, which is a fragile ordering dependency, not a
    // guarantee. EngineService also needs EventEmitter2 (portfolio.changed,
    // order.filled), so this module now registers it explicitly.
    EventEmitterModule.forRoot(),
  ],
  controllers: [TradingController],
  providers: [TradingService, TradingRepository, EngineService, PrismaService],
})
export class TradingModule {}