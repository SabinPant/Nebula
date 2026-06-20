/**
 * Trading Service
 *
 * ALL business logic for order placement, cancellation, and history.
 * Validates balances, reserves funds/shares, settles trades, manages holdings.
 *
 * Design decisions (Sprint 5):
 * - MARKET orders check engine counterparty BEFORE reserving (atomic rejection)
 * - MARKET fills immediately under mock engine
 * - LIMIT orders reserve and stay PENDING
 * - All wallet mutations inside Redis lock + Prisma transaction
 * - Settlement completes before HTTP response
 * - No Trade rows created (mock engine has no counterparty)
 * - Cost basis locked at placement (stored on order.price)
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TradingRepository } from './trading.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisClient } from '../../core/database/redis.client';
import { withWalletLock } from '../../shared/utils/wallet-lock';
import {
  checkIdempotency,
  storeIdempotencyResult,
} from '../../shared/utils/idempotency';
import { isMarketOpenNow } from '../../shared/utils/date';
import { ErrorCodes } from '../../shared/constants/errors';
import { OrderStatus, OrderType, OrderStyle, TransactionType } from '@prisma/client';
import type { CreateOrderDto } from './dto/create-order.dto';
import type Redis from 'ioredis';

@Injectable()
export class TradingService {
  private readonly redis: Redis;

  constructor(
    private readonly tradingRepo: TradingRepository,
    private readonly prisma: PrismaService,
    redisClient: RedisClient,
  ) {
    this.redis = redisClient.getClient();
  }

  /**
   * Places an order. Handles both MARKET (immediate fill under mock engine)
   * and LIMIT (reserve, stay PENDING).
   */
  async placeOrder(userId: string, dto: CreateOrderDto, idempotencyKey?: string) {
    // ── 1. Idempotency Check ──────────────────────────────────────────
    if (idempotencyKey) {
      const cached = await checkIdempotency(this.redis, idempotencyKey, dto);
      if (cached) return cached;
    }

    // ── 2. Validate Stock ─────────────────────────────────────────────
    const stock = await this.tradingRepo.findStockById(dto.stockId);
    if (!stock) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Stock not found',
      });
    }
    if (stock.isHalted) {
      throw new BadRequestException({
        code: ErrorCodes.MARKET_STOCK_HALTED,
        message: `${stock.symbol} is currently halted and cannot be traded`,
      });
    }

    // ── 3. Validate Market Open (MARKET orders only) ──────────────────
    if (dto.orderStyle === 'MARKET' && !isMarketOpenNow()) {
      throw new BadRequestException({
        code: ErrorCodes.MARKET_CLOSED,
        message: 'MARKET orders are only accepted while the market is open',
      });
    }

    // ── 4. Determine Price ────────────────────────────────────────────
    const price = dto.orderStyle === 'LIMIT' ? dto.price! : stock.currentPrice;
    const totalCost = price * dto.quantity;

    // ── 5. Pre-validation: Balance / Holdings ─────────────────────────
    const wallet = await this.tradingRepo.findWalletByUserId(userId);
    if (!wallet) {
      throw new NotFoundException({
        code: ErrorCodes.WALLET_NOT_FOUND,
        message: 'Wallet not found',
      });
    }

    if (dto.type === 'BUY') {
      if (wallet.availableBalance < totalCost) {
        throw new BadRequestException({
          code: ErrorCodes.WALLET_INSUFFICIENT_FUNDS,
          message: 'Insufficient available balance for this order',
        });
      }
    } else {
      const holding = await this.tradingRepo.findHolding(userId, dto.stockId);
      if (!holding) {
        throw new NotFoundException({
          code: ErrorCodes.HOLDING_NOT_FOUND,
          message: `You don't own any shares of ${stock.symbol}`,
        });
      }
      const available = holding.quantity - holding.reservedQuantity;
      if (available < dto.quantity) {
        throw new BadRequestException({
          code: ErrorCodes.HOLDING_INSUFFICIENT,
          message: `You only have ${available} unreserved shares of ${stock.symbol}`,
        });
      }
    }

    // ── 6. Engine check (MARKET only — BEFORE reserving) ──────────────
    // Design rule: MARKET rejection is atomic. Check counterparty BEFORE
    // the Prisma transaction. No reservation if no counterparty exists.
    if (dto.orderStyle === 'MARKET') {
      const hasCounterparty = await this.checkEngineCounterparty(stock.symbol);
      if (!hasCounterparty) {
        const rejected = await this.prisma.$transaction(async (tx) => {
          const order = await this.tradingRepo.createOrder(
            {
              userId,
              stockId: dto.stockId,
              type: dto.type as OrderType,
              orderStyle: OrderStyle.MARKET,
              price,
              quantity: dto.quantity,
              idempotencyKey,
            },
            tx,
          );
          await this.tradingRepo.updateOrderStatus(
            order.id,
            OrderStatus.REJECTED,
            { rejectionReason: 'No counterparty available' },
            tx,
          );
          return this.tradingRepo.findOrderById(order.id);
        });

        if (idempotencyKey) {
          await storeIdempotencyResult(this.redis, idempotencyKey, rejected, dto);
        }
        return rejected;
      }
    }

    // ── 7. Execute Under Lock + Transaction ───────────────────────────
    const order = await withWalletLock(this.redis, userId, async () => {
      return this.prisma.$transaction(async (tx) => {
        const created = await this.tradingRepo.createOrder(
          {
            userId,
            stockId: dto.stockId,
            type: dto.type as OrderType,
            orderStyle: dto.orderStyle as OrderStyle,
            price,
            quantity: dto.quantity,
            idempotencyKey,
          },
          tx,
        );

        // Reserve funds or shares
        if (dto.type === 'BUY') {
          await this.tradingRepo.reserveBalanceForOrder(wallet.id, totalCost, tx);
        } else {
          await this.tradingRepo.reserveHoldingShares(
            userId,
            dto.stockId,
            dto.quantity,
            tx,
          );
        }

        // ORDER_PLACE transaction
        await this.tradingRepo.createTransaction(
          wallet.id,
          TransactionType.ORDER_PLACE,
          0,
          `${dto.type} ${dto.quantity} × ${stock.symbol} @ Rs.${(price / 100).toFixed(2)}`,
          created.id,
          tx,
        );

        // MARKET: fill immediately (counterparty confirmed in step 6)
        if (dto.orderStyle === 'MARKET') {
          await this.tradingRepo.updateOrderStatus(
            created.id,
            OrderStatus.COMPLETED,
            { filledQuantity: dto.quantity },
            tx,
          );

          if (dto.type === 'BUY') {
            await this.tradingRepo.settleWalletTrade(wallet.id, {
              availableDelta: -totalCost,
              reservedDelta: -totalCost,
            }, tx);
            const portfolioId = await this.tradingRepo.ensurePortfolio(userId, tx);
            await this.tradingRepo.createOrUpdateHolding(
              userId,
              dto.stockId,
              portfolioId,
              dto.quantity,
              price,
              tx,
            );
          } else {
            await this.tradingRepo.settleWalletTrade(wallet.id, {
              availableDelta: totalCost,
              reservedDelta: 0,
            }, tx);
            await this.tradingRepo.consumeHoldingShares(
              userId,
              dto.stockId,
              dto.quantity,
              tx,
            );
          }

          await this.tradingRepo.createTransaction(
            wallet.id,
            TransactionType.TRADE_SETTLE,
            dto.type === 'BUY' ? -totalCost : totalCost,
            `${dto.type} ${dto.quantity} × ${stock.symbol} @ Rs.${(price / 100).toFixed(2)} — SETTLED`,
            created.id,
            tx,
          );

          return this.tradingRepo.findOrderById(created.id);
        }

        // LIMIT: stays PENDING
        return created;
      });
    });

    // ── 8. Store Idempotency ──────────────────────────────────────────
    if (idempotencyKey) {
      await storeIdempotencyResult(this.redis, idempotencyKey, order, dto);
    }

    return order;
  }

  /**
   * Cancels a PENDING or PARTIALLY_FILLED order.
   */
  async cancelOrder(userId: string, orderId: string) {
    const order = await this.tradingRepo.findOrderById(orderId);

    if (!order) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Order not found',
      });
    }

    if (order.userId !== userId) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'You can only cancel your own orders',
      });
    }

    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.PARTIALLY_FILLED
    ) {
      throw new BadRequestException({
        code: ErrorCodes.ORDER_NOT_CANCELLABLE,
        message: `Cannot cancel an order with status ${order.status}`,
      });
    }

    const unfilledQuantity = order.quantity - order.filledQuantity;
    const releaseAmount = unfilledQuantity * (order.price ?? 0);

    return withWalletLock(this.redis, userId, async () => {
      return this.prisma.$transaction(async (tx) => {
        if (order.type === 'BUY') {
          const wallet = await this.tradingRepo.findWalletByUserId(userId);
          await this.tradingRepo.releaseBalanceForOrder(
            wallet!.id,
            releaseAmount,
            tx,
          );
        } else {
          await this.tradingRepo.releaseHoldingShares(
            userId,
            order.stockId,
            unfilledQuantity,
            tx,
          );
        }

        const updated = await this.tradingRepo.updateOrderStatus(
          orderId,
          OrderStatus.CANCELLED,
          {},
          tx,
        );

        const wallet = await this.tradingRepo.findWalletByUserId(userId);
        await this.tradingRepo.createTransaction(
          wallet!.id,
          TransactionType.ORDER_CANCEL,
          0,
          `${order.type} ${unfilledQuantity} × ${order.stock.symbol} — CANCELLED`,
          orderId,
          tx,
        );

        return updated;
      });
    });
  }

  /**
   * Returns cursor-paginated order history.
   */
  async getOrders(userId: string, cursor?: string, limit?: number) {
    const orders = await this.tradingRepo.findOrdersByUserId(
      userId,
      cursor,
      limit ?? 20,
    );

    const cappedLimit = Math.min(limit ?? 20, 50);
    const hasMore = orders.length > cappedLimit;
    const data = hasMore ? orders.slice(0, -1) : orders;

    return {
      data,
      pagination: {
        nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null,
        hasMore,
        limit: cappedLimit,
      },
    };
  }

  /**
   * Checks whether the engine has a counterparty for a MARKET order.
   *
   * Sprint 5 (mock engine): Always returns true.
   * Sprint 9-10: Replace with actual engine HTTP health + order book depth check.
   */
  private async checkEngineCounterparty(_symbol: string): Promise<boolean> {
    return true;
  }
}