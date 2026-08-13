/**
 * Order Cancellation Helper
 *
 * Extracted from TradingService.cancelOrder() so the release-amount math
 * (unfilledQuantity * order.price) and the release/cancel/transaction
 * sequence exist in exactly one place. TradingService.cancelOrder() and
 * AdminService.suspendUser() both call this for each order they cancel —
 * neither reimplements the arithmetic independently.
 *
 * This function does ONLY the per-order database work (release balance or
 * shares, mark CANCELLED, write the ORDER_CANCEL transaction) inside an
 * already-open Prisma transaction. It does NOT acquire the wallet lock,
 * open the transaction, or publish to the engine — those differ by caller:
 * - TradingService.cancelOrder() locks/transacts/publishes for ONE order.
 * - AdminService.suspendUser() locks/transacts ONCE for potentially MANY
 *   orders (looping this function inside), then publishes for each LIMIT
 *   order after the single transaction commits.
 *
 * Publishing to the engine (orders:cancel) is deliberately left to the
 * caller for the same reason placeOrder/cancelOrder already publish only
 * after their transaction commits — the order is already CANCELLED in
 * Postgres even if the engine message is dropped or delayed, so there is
 * no correctness dependency on publishing inside the transaction.
 */

import type { Prisma, Order } from '@prisma/client';
import { OrderStatus, TransactionType } from '@prisma/client';
import type { TradingRepository } from './trading.repository';

export interface CancellableOrder extends Order {
  stock: { symbol: string };
}

/**
 * Releases the reserved balance (BUY) or reserved shares (SELL) for one
 * PENDING/PARTIALLY_FILLED order, marks it CANCELLED, and writes the
 * ORDER_CANCEL transaction row. Must run inside an existing Prisma
 * transaction (tx) — this function never opens its own.
 *
 * Callers are responsible for verifying order.status is cancellable
 * before calling this — it does not re-check status itself, since both
 * callers already filter to PENDING/PARTIALLY_FILLED orders upstream.
 */
export async function releaseAndCancelOrder(
  tradingRepo: TradingRepository,
  tx: Prisma.TransactionClient,
  order: CancellableOrder,
  walletId: string,
): Promise<void> {
  const unfilledQuantity = order.quantity - order.filledQuantity;
  const releaseAmount = unfilledQuantity * (order.price ?? 0);

  if (order.type === 'BUY') {
    await tradingRepo.releaseBalanceForOrder(walletId, releaseAmount, tx);
  } else {
    await tradingRepo.releaseHoldingShares(order.userId, order.stockId, unfilledQuantity, tx);
  }

  await tradingRepo.updateOrderStatus(order.id, OrderStatus.CANCELLED, {}, tx);

  await tradingRepo.createTransaction(
    walletId,
    TransactionType.ORDER_CANCEL,
    0,
    `${order.type} ${unfilledQuantity} × ${order.stock.symbol} — CANCELLED`,
    order.id,
    tx,
  );
}
