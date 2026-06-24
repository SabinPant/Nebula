/**
 * Wallet Repository
 *
 * Database access layer for wallet operations.
 * Contains Prisma queries ONLY — zero business logic, zero validation.
 *
 * All money values are in integer paise. Display conversion happens
 * at the service layer via currency utilities.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { getStartOfWeekNepal } from '../../shared/utils/date';

@Injectable()
export class WalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds a wallet by user ID, including the user's assigned broker info.
   * Returns null if no wallet exists for the user.
   */
  async findWalletByUserId(userId: string) {
    return this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            assignedBroker: {
              select: {
                id: true,
                displayName: true,
                brokerNumber: true,
                email: true,
                phone: true,
                isSuspended: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Finds a wallet by wallet ID.
   */
  async findWalletById(walletId: string) {
    return this.prisma.wallet.findUnique({
      where: { id: walletId },
    });
  }

     /**
   * Returns paginated transactions for a wallet using skip/take (page-based).
   *
   * @param walletId - The wallet's ID
   * @param skip - Number of records to skip (page - 1) * limit
   * @param limit - Number of transactions per page (default 20, max 50)
   */
  async findTransactions(walletId: string, skip: number = 0, limit: number = 20) {
    return this.prisma.transaction.findMany({
      where: { walletId },
      orderBy: { id: 'desc' },
      skip,
      take: Math.min(limit, 50),
    });
  }

  /**
   * Returns the total number of transactions for a wallet.
   * Used for page-based pagination to calculate totalPages.
   */
  async countTransactions(walletId: string): Promise<number> {
    return this.prisma.transaction.count({
      where: { walletId },
    });
  }

  /**
   * Returns the sum of COMPLETED top-ups for a trader this week.
   * Week starts Monday 00:00 Asia/Kathmandu.
   * Only counts COMPLETED status — BLOCKED_BY_CAP top-ups didn't add funds.
   */
  async getWeeklyTopUpTotal(traderId: string): Promise<number> {
    const weekStart = getStartOfWeekNepal();

    const result = await this.prisma.topUpRequest.aggregate({
      where: {
        traderId,
        status: 'COMPLETED',
        createdAt: {
          gte: weekStart,
        },
      },
      _sum: {
        amountPaise: true,
      },
    });

    return result._sum.amountPaise ?? 0;
  }
}