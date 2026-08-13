/**
 * Learning Module
 *
 * Wires together the learning controller, service, repository.
 * Mirrors the WalletModule/MarketModule pattern — bare JwtModule
 * import, PrismaService provided directly.
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { LearningRepository } from './learning.repository';
import { PrismaService } from '../../core/database/prisma.service';

@Module({
  imports: [JwtModule],
  controllers: [LearningController],
  providers: [LearningService, LearningRepository, PrismaService],
  exports: [LearningService],
})
export class LearningModule {}
