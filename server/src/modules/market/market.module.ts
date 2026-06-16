/**
 * Market Module
 *
 * Wires together the market controller, service, repository, and gateway.
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MarketRepository } from './market.repository';
import { MarketGateway } from './market.gateway';
import { PrismaService } from '../../core/database/prisma.service';

@Module({
  imports: [JwtModule],
  controllers: [MarketController],
  providers: [MarketService, MarketRepository, MarketGateway, PrismaService],
  exports: [MarketService],
})
export class MarketModule {}