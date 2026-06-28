/**
 * Portfolio Repository
 *
 * Database access layer for portfolio operations.
 * Contains Prisma queries ONLY — zero business logic, zero calculations.
 *
 * All money values are in integer paise.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class PortfolioRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the user's portfolio with all holdings and current stock prices.
   * Used for live P&L calculation — always fetches fresh stock.currentPrice.
   */
  async findPortfolioWithHoldings(userId: string) {
    return this.prisma.portfolio.findUnique({
      where: { userId },
      include: {
        holdings: {
          include: {
            stock: {
              select: {
                id: true,
                symbol: true,
                companyName: true,
                sector: true,
                currentPrice: true,
                previousClose: true,
                isHalted: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Returns just the holdings list with current stock data.
   * Used when client only needs holdings without portfolio summary.
   */
  async findHoldingsByUserId(userId: string) {
    return this.prisma.holding.findMany({
      where: { userId },
      include: {
        stock: {
          select: {
            id: true,
            symbol: true,
            companyName: true,
            sector: true,
            currentPrice: true,
            previousClose: true,
            isHalted: true,
          },
        },
      },
      orderBy: { stock: { symbol: 'asc' } },
    });
  }

    async ensurePortfolio(userId: string): Promise<string> {
    const portfolio = await this.prisma.portfolio.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return portfolio.id;
  }
  
}