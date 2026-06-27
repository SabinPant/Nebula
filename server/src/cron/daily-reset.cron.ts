/**
 * Daily Reset Cron
 *
 * Runs every day at 1:00 AM Nepal time (after the settlement window closes).
 * Resets previousClose to currentPrice for all stocks and unhalt any
 * halted stocks so the next trading day starts fresh with new circuit
 * breaker baselines.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../core/database/prisma.service';

@Injectable()
export class DailyResetCron {
  private readonly logger = new Logger(DailyResetCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 1 * * *', { timeZone: 'Asia/Kathmandu' })
  async resetDaily(): Promise<void> {
    this.logger.log('Starting daily reset — updating previousClose and unhallting stocks');

    try {
      // Update previousClose = currentPrice and unhalt all stocks
      const result: [{ count: number }] = await this.prisma.$queryRaw`
        UPDATE "Stock"
        SET "previousClose" = "currentPrice",
            "isHalted" = false,
            "haltReason" = NULL
      `;

      this.logger.log(`Daily reset complete`);
    } catch (error) {
      this.logger.error('Daily reset failed', error);
    }
  }
}