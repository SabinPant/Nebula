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
   * Returns cursor-paginated transactions for a wallet.
   *
   * @param walletId - The wallet's ID
   * @param cursor - Optional cursor (transaction ID) for pagination
   * @param limit - Number of transactions to return (default 20, max 50)
   */
  async findTransactions(walletId: string, cursor?: string, limit: number = 20) {
    const take = Math.min(limit, 50) + 1; // Fetch one extra to determine hasMore

    const transactions = await this.prisma.transaction.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1, // Skip the cursor itself
          }
        : {}),
    });

    return transactions;
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