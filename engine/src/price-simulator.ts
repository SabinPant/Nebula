/**
 * Price Simulator
 *
 * Geometric Brownian Motion (GBM) price simulation for the mock engine.
 * Generates the next price tick for a given stock using the GBM formula:
 *
 *   nextPrice = currentPrice * exp((drift - 0.5 * σ²) * dt + σ * √dt * Z)
 *
 * Where:
 *   drift (μ) — expected return, from stock config
 *   sigma (σ) — volatility, from stock config
 *   dt — time step = tick interval / trading day in milliseconds
 *   Z — standard normal random variable (Box-Muller transform)
 *
 * Circuit breaker: if price moves ±10% from previousClose, the price is
 * clamped to the limit and the stock is marked as halted. The halted price
 * is frozen — subsequent ticks will not move it further until unhalted.
 *
 * All prices are in integer paise.
 */

import type { StockConfig } from './stocks.config';

const CIRCUIT_BREAKER_PERCENT = 0.1;
const TRADING_DAY_MS = 1000 * 60 * 1; // 1 hour — compresses a full day's movement into 1 hour
const TICK_INTERVAL_MS = parseInt(
  process.env.PRICE_UPDATE_INTERVAL_MS || '3000',
  10,
);
const DT = TICK_INTERVAL_MS / TRADING_DAY_MS;

// Safety clamps (in paise)
const MIN_PRICE_PAISE = 100; // Rs. 1.00
const MAX_PRICE_PAISE = 1_000_000_000; // Rs. 10,00,000.00

/**
 * Box-Muller transform — generates a standard normal random variable N(0,1).
 */
function randomNormal(): number {
  let u1 = 0;
  let u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

export interface TickResult {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  isHalted: boolean;
  timestamp: string;
}

/**
 * Simulates one price tick for a stock.
 * If the circuit breaker triggers, the price is clamped to the limit
 * and frozen — it will not move further until the stock is unhalted.
 */
export function simulateTick(stock: StockConfig): TickResult {
  const sigma = stock.volatility;
  const drift = stock.drift;

  // GBM formula
  const Z = randomNormal();
  const exponent = (drift - 0.5 * sigma * sigma) * DT + sigma * Math.sqrt(DT) * Z;
  let newPrice = Math.round(stock.currentPrice * Math.exp(exponent));

  // Circuit breaker — check against previousClose (not currentPrice)
  const upperLimit = Math.round(stock.previousClose * (1 + CIRCUIT_BREAKER_PERCENT));
  const lowerLimit = Math.round(stock.previousClose * (1 - CIRCUIT_BREAKER_PERCENT));
  let isHalted = false;

  if (newPrice >= upperLimit) {
    newPrice = upperLimit; // Clamp to ceiling
    isHalted = true;
  } else if (newPrice <= lowerLimit) {
    newPrice = lowerLimit; // Clamp to floor
    isHalted = true;
  }

  // Safety clamps (absolute min/max)
  if (newPrice < MIN_PRICE_PAISE) newPrice = MIN_PRICE_PAISE;
  if (newPrice > MAX_PRICE_PAISE) newPrice = MAX_PRICE_PAISE;

  // Update the stock's current price in-place (frozen at limit if halted)
  stock.currentPrice = newPrice;
  stock.isHalted = isHalted;
  
  const change = newPrice - stock.previousClose;
  const changePercent = (change / stock.previousClose) * 100;

  return {
    symbol: stock.symbol,
    price: newPrice,
    previousClose: stock.previousClose,
    change,
    changePercent: Math.round(changePercent * 100) / 100,
    isHalted,
    timestamp: new Date().toISOString(),
  };
}