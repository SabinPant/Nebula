/**
 * Trading Repository
 *
 * Database access layer for order operations.
 * Contains Prisma queries ONLY — zero business logic, zero validation.
 *
 * Mutation methods accept an optional Prisma.TransactionClient.
 * When called from a Prisma transaction, pass the tx client so all
 * operations share the same transactional context.
 *
 * All money values are in integer paise.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import {
  OrderStatus,
  OrderType,
  OrderStyle,
  TransactionType,
  Prisma,
} from '@prisma/client';

interface CreateOrderData {
  userId: string;
  stockId: string;
  type: OrderType;
  orderStyle: OrderStyle;
  price: number; // Always stored — MARKET uses currentPrice at placement
  quantity: number;
  idempotencyKey?: string;
}

interface SettleWalletParams {
  availableDelta: number; // Negative for BUY (deduct), positive for SELL (credit)
  reservedDelta: number; // Always negative (releases reservation)
}

@Injectable()
export class TradingRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Reads ───────────────────────────────────────────────────────────────

  async findStockById(stockId: string) {
    return this.prisma.stock.findUnique({ where: { id: stockId } });
  }

  async findWalletByUserId(userId: string) {
    return this.prisma.wallet.findUnique({ where: { userId } });
  }

  async findHolding(userId: string, stockId: string) {
    return this.prisma.holding.findUnique({
      where: { userId_stockId: { userId, stockId } },
    });
  }

   async findOrderById(orderId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.order.findUnique({
      where: { id: orderId },
      include: { stock: true },
    });
  }

    /**
   * Returns page-based paginated orders for a user.
   *
   * @param userId - The user's ID
   * @param skip - Number of records to skip (page - 1) * limit
   * @param limit - Number of orders per page (default 10, max 50)
   */
  async findOrdersByUserId(userId: string, skip: number = 0, limit: number = 10) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      skip,
      take: Math.min(limit, 50),
      include: { stock: { select: { symbol: true, companyName: true } } },
    });
  }

  /**
   * Returns the total number of orders for a user.
   * Used for page-based pagination to calculate totalPages.
   */
  async countOrdersByUserId(userId: string): Promise<number> {
    return this.prisma.order.count({
      where: { userId },
    });
  }

  // ─── Writes: Portfolio ───────────────────────────────────────────────────

  /**
   * Ensures a Portfolio row exists for the user.
   * Uses upsert to avoid TOCTOU race conditions on first order.
   */
  async ensurePortfolio(userId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx ?? this.prisma;
    const portfolio = await client.portfolio.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return portfolio.id;
  }

  // ─── Writes: Orders ──────────────────────────────────────────────────────

  async createOrder(data: CreateOrderData, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.order.create({ data });
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    extra?: { filledQuantity?: number; rejectionReason?: string },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.order.update({
      where: { id: orderId },
      data: { status, ...extra },
    });
  }

  // ─── Writes: Wallet Mutations (must be in Redis lock + Prisma tx) ───────

  async reserveBalanceForOrder(
    walletId: string,
    amountPaise: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.wallet.update({
      where: { id: walletId },
      data: {
        reservedBalance: { increment: amountPaise },
      },
    });
  }

  async releaseBalanceForOrder(
    walletId: string,
    amountPaise: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.wallet.update({
      where: { id: walletId },
      data: {
        reservedBalance: { decrement: amountPaise },
      },
    });
  }

  async settleWalletTrade(
    walletId: string,
    params: SettleWalletParams,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.wallet.update({
      where: { id: walletId },
      data: {
        availableBalance: { increment: params.availableDelta },
        reservedBalance: { decrement: Math.abs(params.reservedDelta) },
      },
    });
  }

  // ─── Writes: Holding Mutations ──────────────────────────────────────────

  async reserveHoldingShares(
    userId: string,
    stockId: string,
    quantity: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.holding.update({
      where: { userId_stockId: { userId, stockId } },
      data: { reservedQuantity: { increment: quantity } },
    });
  }

  async releaseHoldingShares(
    userId: string,
    stockId: string,
    quantity: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.holding.update({
      where: { userId_stockId: { userId, stockId } },
      data: { reservedQuantity: { decrement: quantity } },
    });
  }

  async consumeHoldingShares(
    userId: string,
    stockId: string,
    quantity: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.holding.update({
      where: { userId_stockId: { userId, stockId } },
      data: {
        quantity: { decrement: quantity },
        reservedQuantity: { decrement: quantity },
      },
    });
  }

  async createOrUpdateHolding(
    userId: string,
    stockId: string,
    portfolioId: string,
    quantity: number,
    pricePaise: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    const existing = await client.holding.findUnique({
      where: { userId_stockId: { userId, stockId } },
    });

    if (existing) {
      const oldTotal = existing.quantity * existing.averageBuyPrice;
      const newTotal = quantity * pricePaise;
      const newQuantity = existing.quantity + quantity;
      const newAverage = Math.round((oldTotal + newTotal) / newQuantity);

      return client.holding.update({
        where: { userId_stockId: { userId, stockId } },
        data: {
          quantity: { increment: quantity },
          averageBuyPrice: newAverage,
        },
      });
    }

    return client.holding.create({
      data: {
        userId,
        stockId,
        portfolioId,
        quantity,
        averageBuyPrice: pricePaise,
      },
    });
  }

  // ─── Writes: Transactions ────────────────────────────────────────────────

  async createTransaction(
    walletId: string,
    type: TransactionType,
    amountPaise: number,
    description: string,
    referenceId?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.transaction.create({
      data: {
        walletId,
        type,
        amount: amountPaise,
        description,
        referenceId,
      },
    });
  }
}