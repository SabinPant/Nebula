import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { TradingController } from './trading.controller';
import { TradingService } from './trading.service';
import { TradingRepository } from './trading.repository';
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
  ],
  controllers: [TradingController],
  providers: [TradingService, TradingRepository, PrismaService],
})
export class TradingModule {}