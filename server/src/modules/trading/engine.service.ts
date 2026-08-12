/**
 * Engine Service
 *
 * Listens for fill events published by the real matching engine on Redis
 * channel `orders:filled` and settles them: updates both orders, moves
 * money and shares between the two traders' wallets/holdings, records the
 * Trade and Transaction rows, and notifies both users.
 *
 * This is the server-side counterpart to engine/src/matching-engine.ts —
 * the engine only knows about the Redis-backed order book (userId/symbol
 * strings, no Prisma). Settlement against real User/Wallet/Holding rows
 * happens here, exactly once per fill event.
 *
 * Fill events arrive as untrusted JSON over pub/sub, so every message is
 * validated with Zod before touching the database. Malformed events, or
 * events referencing orders that can't be settled, are logged and skipped
 * — never allowed to crash the server (the engine has no way to know if
 * settlement succeeded, so it will not retry; skipping just means that one
 * fill is lost and logged for manual investigation, which is preferable to
 * taking the whole server down).
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { z } from 'zod';
import { ConfigService } from '@nestjs/config';
import { TradingRepository } from './trading.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisClient } from '../../core/database/redis.client';
import { withWalletLock } from '../../shared/utils/wallet-lock';
import { OrderStatus, TransactionType, NotificationType, Prisma } from '@prisma/client';
import type { Order as PrismaOrder, Stock } from '@prisma/client';

const FillEventSchema = z.object({
  buyOrderId: z.string().min(1),
  sellOrderId: z.string().min(1),
  symbol: z.string().min(1),
  price: z.number().int().positive(), // paise — the resting sell order's limit price
  quantity: z.number().int().positive(), // shares filled in this event
  timestamp: z.string().min(1),
});

type FillEvent = z.infer<typeof FillEventSchema>;

type OrderWithStock = PrismaOrder & { stock: Stock };

@Injectable()
export class EngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EngineService.name);

  // Separate subscriber connection — once a connection issues SUBSCRIBE it
  // enters pub/sub mode and can no longer run ordinary commands. The shared
  // RedisClient (below) is used for the wallet lock, which needs plain
  // commands (SET/GET/DEL) — the exact same split MarketGateway uses
  // between its own redisSubscriber and the app's normal Redis usage.
  private redisSubscriber!: Redis;
  private readonly redis: Redis;

  constructor(
    private readonly tradingRepo: TradingRepository,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    redisClient: RedisClient,
  ) {
    this.redis = redisClient.getClient();
  }

  async onModuleInit(): Promise<void> {
    const redisUrl =
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    this.redisSubscriber = new Redis(redisUrl);

    await this.redisSubscriber.subscribe('orders:filled');

    this.redisSubscriber.on('message', (channel: string, message: string) => {
      if (channel === 'orders:filled') {
        this.handleFillMessage(message).catch((err) => {
          this.logger.error(`Unhandled error settling fill: ${err.message}`, err.stack);
        });
      }
    });

    this.logger.log('Subscribed to orders:filled');
  }

  async onModuleDestroy(): Promise<void> {
    await this.redisSubscriber?.quit();
  }

  /**
   * Parses and validates a raw orders:filled message, then settles it.
   * Never throws — logs and returns on any failure so one bad message
   * cannot take down the subscriber loop or the server.
   */
  private async handleFillMessage(raw: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.logger.error(`Ignoring non-JSON message on orders:filled: ${raw}`);
      return;
    }

    const result = FillEventSchema.safeParse(json);
    if (!result.success) {
      this.logger.error(
        `Ignoring malformed fill event: ${JSON.stringify(result.error.flatten())}`,
      );
      return;
    }

    await this.settleFill(result.data);
  }

  /**
   * Settles one fill event: updates both orders, moves money/shares between
   * the two wallets, records the Trade, and notifies both users.
   */
  private async settleFill(fill: FillEvent): Promise<void> {
    const [buyOrder, sellOrder] = await Promise.all([
      this.tradingRepo.findOrderById(fill.buyOrderId),
      this.tradingRepo.findOrderById(fill.sellOrderId),
    ]);

    if (!buyOrder || !sellOrder) {
      this.logger.error(
        `Fill references missing order(s) — buy=${fill.buyOrderId} (${buyOrder ? 'found' : 'MISSING'}), ` +
        `sell=${fill.sellOrderId} (${sellOrder ? 'found' : 'MISSING'}) — skipping settlement`,
      );
      return;
    }

    // Defense-in-depth: the engine already prevents self-trades, but a
    // settlement that debited and credited the SAME wallet in one
    // transaction would be a serious money bug if it ever happened, so the
    // server refuses to settle it rather than trust the engine blindly.
    if (buyOrder.userId === sellOrder.userId) {
      this.logger.error(
        `Fill event pairs orders from the same user (${buyOrder.userId}) — ` +
        `buy=${fill.buyOrderId}, sell=${fill.sellOrderId} — skipping settlement (self-trade)`,
      );
      return;
    }

    if (buyOrder.status === OrderStatus.CANCELLED || buyOrder.status === OrderStatus.COMPLETED) {
      this.logger.error(
        `Buy order ${fill.buyOrderId} is already ${buyOrder.status} — skipping settlement ` +
        `(engine and server order state have diverged)`,
      );
      return;
    }
    if (sellOrder.status === OrderStatus.CANCELLED || sellOrder.status === OrderStatus.COMPLETED) {
      this.logger.error(
        `Sell order ${fill.sellOrderId} is already ${sellOrder.status} — skipping settlement ` +
        `(engine and server order state have diverged)`,
      );
      return;
    }

    // Lock both wallets in a deterministic order (sorted by userId), not
    // buyer-then-seller. Two fills settling concurrently in opposite roles
    // — e.g. fill A is (buyer=X, seller=Y) while fill B is (buyer=Y,
    // seller=X) — would deadlock under a fixed buyer-first ordering: A
    // holds X's lock waiting for Y's, B holds Y's lock waiting for X's.
    // Sorting by userId guarantees every caller acquires locks in the same
    // global order, which makes that cycle impossible.
    const [firstUserId, secondUserId] =
      buyOrder.userId < sellOrder.userId
        ? [buyOrder.userId, sellOrder.userId]
        : [sellOrder.userId, buyOrder.userId];

    await withWalletLock(this.redis, firstUserId, () =>
      withWalletLock(this.redis, secondUserId, () =>
        this.settleUnderLock(fill, buyOrder, sellOrder),
      ),
    );

    // Fire WebSocket-facing events after the transaction has committed —
    // never inside it, so a slow/failed listener can't hold the DB lock.
    this.eventEmitter.emit('portfolio.changed', { userId: buyOrder.userId });
    this.eventEmitter.emit('portfolio.changed', { userId: sellOrder.userId });
    this.eventEmitter.emit('order.filled', {
      userId: buyOrder.userId,
      orderId: buyOrder.id,
      symbol: fill.symbol,
      price: fill.price,
      quantity: fill.quantity,
    });
    this.eventEmitter.emit('order.filled', {
      userId: sellOrder.userId,
      orderId: sellOrder.id,
      symbol: fill.symbol,
      price: fill.price,
      quantity: fill.quantity,
    });

    this.logger.log(
      `Settled fill: ${fill.symbol} ${fill.quantity} @ Rs. ${(fill.price / 100).toFixed(2)} ` +
      `(buy ${buyOrder.id} / sell ${sellOrder.id})`,
    );
  }

  /**
   * The actual settlement — assumes both wallet locks are already held.
   * Runs entirely inside one Prisma transaction: order status updates,
   * wallet mutations, holding mutations, Trade row, Transaction rows,
   * and Notification rows for both users, or none of it.
   */
  private async settleUnderLock(
    fill: FillEvent,
    buyOrder: OrderWithStock,
    sellOrder: OrderWithStock,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const buyWallet = await this.tradingRepo.findWalletByUserId(buyOrder.userId);
      const sellWallet = await this.tradingRepo.findWalletByUserId(sellOrder.userId);
      if (!buyWallet || !sellWallet) {
        this.logger.error(
          `Missing wallet during settlement — buyer=${buyOrder.userId} ` +
          `(${buyWallet ? 'ok' : 'MISSING'}), seller=${sellOrder.userId} (${sellWallet ? 'ok' : 'MISSING'})`,
        );
        return;
      }

      // ── Buyer side ──────────────────────────────────────────────────
      // The buyer's reservedBalance was locked at order.price (their own
      // limit), but the trade may execute at a better price (fill.price
      // is always the resting SELL order's limit — see matching-engine.ts).
      // Release the FULL reservation (order.price × quantity) but deduct
      // only the ACTUAL cost (fill.price × quantity) from availableBalance
      // — the difference is price improvement and flows back to the buyer
      // automatically, since availableBalance drops by less than
      // reservedBalance does.
      const buyOrderPrice = buyOrder.price ?? fill.price; // MARKET orders always have price stored at placement
      const reservationToRelease = buyOrderPrice * fill.quantity;
      const actualCost = fill.price * fill.quantity;

      await this.tradingRepo.settleWalletTrade(
        buyWallet.id,
        { availableDelta: -actualCost, reservedDelta: -reservationToRelease },
        tx,
      );

      const buyerPortfolioId = await this.tradingRepo.ensurePortfolio(buyOrder.userId, tx);
      await this.tradingRepo.createOrUpdateHolding(
        buyOrder.userId,
        buyOrder.stockId,
        buyerPortfolioId,
        fill.quantity,
        fill.price, // cost basis = actual execution price, not the buyer's limit
        tx,
      );

      await this.tradingRepo.createTransaction(
        buyWallet.id,
        TransactionType.TRADE_SETTLE,
        -actualCost,
        `BUY ${fill.quantity} × ${fill.symbol} @ Rs.${(fill.price / 100).toFixed(2)} — SETTLED`,
        buyOrder.id,
        tx,
      );

      // ── Seller side ─────────────────────────────────────────────────
      // Seller reserved SHARES (not balance) at placement, so there is no
      // wallet reservation to release here — only the sale proceeds credit
      // availableBalance, and consumeHoldingShares releases the reserved
      // shares in the same call.
      const proceeds = fill.price * fill.quantity;

      await this.tradingRepo.settleWalletTrade(
        sellWallet.id,
        { availableDelta: proceeds, reservedDelta: 0 },
        tx,
      );

      await this.tradingRepo.consumeHoldingShares(
        sellOrder.userId,
        sellOrder.stockId,
        fill.quantity,
        tx,
      );

      await this.tradingRepo.createTransaction(
        sellWallet.id,
        TransactionType.TRADE_SETTLE,
        proceeds,
        `SELL ${fill.quantity} × ${fill.symbol} @ Rs.${(fill.price / 100).toFixed(2)} — SETTLED`,
        sellOrder.id,
        tx,
      );

      // ── Order status updates ────────────────────────────────────────
      await this.updateOrderAfterFill(buyOrder, fill.quantity, tx);
      await this.updateOrderAfterFill(sellOrder, fill.quantity, tx);

      // ── Trade row ────────────────────────────────────────────────────
      // Sprint 9-10: the real engine has a genuine counterparty order, so
      // (unlike the MARKET-under-mock-engine path) a Trade row linking
      // both sides can now be created.
      await this.tradingRepo.createTrade(
        {
          buyOrderId: buyOrder.id,
          sellOrderId: sellOrder.id,
          stockId: buyOrder.stockId,
          quantity: fill.quantity,
          price: fill.price,
        },
        tx,
      );

      // ── Notifications ────────────────────────────────────────────────
      await tx.notification.create({
        data: {
          userId: buyOrder.userId,
          type: NotificationType.ORDER_FILLED,
          title: 'Order filled',
          message: `Your BUY order for ${fill.quantity} × ${fill.symbol} filled at Rs. ${(fill.price / 100).toFixed(2)}.`,
          data: {
            orderId: buyOrder.id,
            symbol: fill.symbol,
            quantity: fill.quantity,
            price: fill.price,
          } as Prisma.InputJsonValue,
        },
      });
      await tx.notification.create({
        data: {
          userId: sellOrder.userId,
          type: NotificationType.ORDER_FILLED,
          title: 'Order filled',
          message: `Your SELL order for ${fill.quantity} × ${fill.symbol} filled at Rs. ${(fill.price / 100).toFixed(2)}.`,
          data: {
            orderId: sellOrder.id,
            symbol: fill.symbol,
            quantity: fill.quantity,
            price: fill.price,
          } as Prisma.InputJsonValue,
        },
      });
    });
  }

  /**
   * Marks an order PARTIALLY_FILLED or COMPLETED depending on whether this
   * fill consumed all of its remaining quantity.
   */
  private async updateOrderAfterFill(
    order: OrderWithStock,
    fillQuantity: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const newFilledQuantity = order.filledQuantity + fillQuantity;
    const isFullyFilled = newFilledQuantity >= order.quantity;

    await this.tradingRepo.updateOrderStatus(
      order.id,
      isFullyFilled ? OrderStatus.COMPLETED : OrderStatus.PARTIALLY_FILLED,
      { filledQuantity: newFilledQuantity },
      tx,
    );
  }

}
