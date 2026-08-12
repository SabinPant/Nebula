/**
 * Trading Service
 *
 * ALL business logic for order placement, cancellation, and history.
 * Validates balances, reserves funds/shares, settles trades, manages holdings.
 *
 * Design decisions (Sprint 5):
 * - MARKET orders check engine counterparty BEFORE reserving (atomic rejection)
 * - MARKET fills immediately under mock engine
 * - All wallet mutations inside Redis lock + Prisma transaction
 * - Settlement completes before HTTP response
 * - Cost basis locked at placement (stored on order.price)
 *
 * Design decisions (Sprint 9 — real engine integration):
 * - LIMIT orders now publish to the engine (orders:new) after the placement
 *   transaction commits, and stay PENDING — the engine's matching loop
 *   fills them asynchronously; EngineService (engine.service.ts) subscribes
 *   to orders:filled and performs the actual wallet/holding settlement.
 * - LIMIT cancellations publish to orders:cancel so the engine drops the
 *   order from its book; the server-side fund/share release is unchanged.
 * - Trade rows are now created (Sprint 9-10 scope) — but only by
 *   EngineService for engine-matched fills, since MARKET orders under the
 *   current mock-fill path still have no real counterparty order to link.
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
import { buildPageResponse } from '../../shared/utils/paginate';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { z } from 'zod';

// Mirrors engine/src/index.ts's NewOrderMessageSchema / CancelOrderMessageSchema
// exactly — the two services are independent processes, so the contract is
// duplicated by design rather than shared via an import (the engine has zero
// dependency on the server, and must stay that way).
const NewOrderMessageSchema = z.object({
  orderId: z.string().min(1),
  userId: z.string().min(1),
  stockSymbol: z.string().min(1),
  type: z.enum(['BUY', 'SELL']),
  price: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

const CancelOrderMessageSchema = z.object({
  orderId: z.string().min(1),
});

@Injectable()
export class TradingService {
  private readonly redis: Redis;

  constructor(
    private readonly tradingRepo: TradingRepository,
    private readonly prisma: PrismaService,
    redisClient: RedisClient,
    private readonly eventEmitter: EventEmitter2,
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

    // ── 1.5. Daily Order Cap ─────────────────────────────────────────
    const todayKey = `ratelimit:orders:daily:${userId}`;
    const todayCount = await this.redis.incr(todayKey);
    if (todayCount === 1) {
      await this.redis.expire(todayKey, 86400);
    }
    if (todayCount > 50) {
      throw new BadRequestException({
        code: ErrorCodes.RATE_LIMIT_EXCEEDED,
        message: 'Daily order limit reached (50 orders per day)',
      });
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

          return this.tradingRepo.findOrderById(created.id, tx);
        }

        // LIMIT: stays PENDING
        return created;
      });
    });

    // Emit portfolio changed event after MARKET fill
    if (dto.orderStyle === 'MARKET') {
      this.eventEmitter.emit('portfolio.changed', { userId });
    }

    // ── 7.5. Publish LIMIT orders to the engine ────────────────────────
    // Published AFTER the transaction commits, never inside it — the
    // engine could start matching this order the instant it's published,
    // and a DB transaction that later rolled back would leave a phantom
    // order resting in the engine's book with no corresponding row here.
    // The order stays PENDING in Postgres; EngineService (subscribed to
    // orders:filled) settles it whenever the engine matches it.
    if (dto.orderStyle === 'LIMIT' && order) {
      await this.publishNewOrderToEngine(order, stock.symbol);
    }

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

    const result = await withWalletLock(this.redis, userId, async () => {
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

    this.eventEmitter.emit('portfolio.changed', { userId });

    // Tell the engine to drop it from the order book too. Only LIMIT
    // orders are ever published to orders:new in the first place (MARKET
    // orders fill or reject instantly and never enter the engine's book),
    // so only LIMIT cancellations need to be forwarded. Published after
    // the DB transaction commits, same reasoning as placeOrder: the order
    // is already CANCELLED here even if the engine message is dropped or
    // delayed, so there is no correctness dependency on ordering — this
    // is strictly "also tell the engine," not part of the transaction.
    if (order.orderStyle === OrderStyle.LIMIT) {
      await this.publishCancelToEngine(orderId);
    }

    return result;
  }

  /**
   * Returns page-based paginated order history for a user.
   *
   * @param userId - The authenticated user's ID
   * @param page - Page number (1-indexed, default 1)
   * @param limit - Items per page (default 10, max 50)
   */
  async getOrders(userId: string, page: number = 1, limit: number = 10) {
    const cappedLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (page - 1) * cappedLimit;

    const [orders, totalCount] = await Promise.all([
      this.tradingRepo.findOrdersByUserId(userId, skip, cappedLimit),
      this.tradingRepo.countOrdersByUserId(userId),
    ]);

    return buildPageResponse(orders, totalCount, page, cappedLimit);
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

  /**
   * Publishes a newly-created LIMIT order to the engine's orders:new
   * channel so it can be added to the Redis order book and matched.
   *
   * The message is validated against the same shape the engine expects
   * (engine/src/index.ts NewOrderMessageSchema) before publishing — this
   * is defense-in-depth so a future refactor that accidentally changes a
   * field name fails loudly here in a typed context, instead of silently
   * producing a message the engine's own Zod schema then rejects and logs
   * as malformed with no visibility on the server side.
   */
  private async publishNewOrderToEngine(
    order: { id: string; userId: string; price: number | null; quantity: number; type: OrderType },
    stockSymbol: string,
  ): Promise<void> {
    const message = NewOrderMessageSchema.parse({
      orderId: order.id,
      userId: order.userId,
      stockSymbol,
      type: order.type,
      price: order.price,
      quantity: order.quantity,
    });

    await this.redis.publish('orders:new', JSON.stringify(message));
  }

  /**
   * Publishes a cancellation request to the engine's orders:cancel channel
   * so it removes the order from the Redis order book.
   */
  private async publishCancelToEngine(orderId: string): Promise<void> {
    const message = CancelOrderMessageSchema.parse({ orderId });
    await this.redis.publish('orders:cancel', JSON.stringify(message));
  }
}