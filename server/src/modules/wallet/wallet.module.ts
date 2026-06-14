/**
 * Wallet Module
 *
 * Wires together the wallet controller, service, and repository.
 * Mirrors the BrokerModule pattern — bare JwtModule import,
 * PrismaService provided directly.
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletRepository } from './wallet.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisClient } from '../../core/database/redis.client';

@Module({
  imports: [JwtModule],
  controllers: [WalletController],
  providers: [WalletService, WalletRepository, PrismaService, RedisClient],
  exports: [WalletService],
})
export class WalletModule {}