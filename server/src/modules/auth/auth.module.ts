/**
 * Auth Module
 *
 * Wires together all authentication dependencies:
 * controller, service, repository, JWT, and shared services.
 *
 * JwtModule is registered here so JwtService is available for injection.
 * Secrets and expiry come from ConfigService — never hardcoded.
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { EmailService } from '../../shared/services/email.service';
import { TokenStorage } from '../../shared/utils/token-storage';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { OnboardingGuard } from './guards/onboarding.guard';
import { GoogleStrategy } from './strategies/google.strategy';

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
  ],
  controllers: [AuthController],
  providers: [
  AuthService,
  AuthRepository,
  PrismaService,
  EmailService,
  TokenStorage,
  JwtStrategy,
  JwtAuthGuard,
  RolesGuard,
  OnboardingGuard,
  GoogleStrategy,
],
  exports: [AuthService, JwtAuthGuard, RolesGuard, OnboardingGuard],
})
export class AuthModule {}