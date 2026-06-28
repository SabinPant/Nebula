import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioGateway } from './portfolio.gateway';
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
    EventEmitterModule.forRoot(),
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService, PortfolioRepository, PortfolioGateway, PrismaService],
})
export class PortfolioModule {}