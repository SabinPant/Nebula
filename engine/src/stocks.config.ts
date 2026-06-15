/**
 * Stock Configuration
 *
 * Hardcoded stock data for the mock engine.
 * Mirrors the 10 seeded NEPSE stocks from server/prisma/seed.ts.
 *
 * The engine does not use Prisma or connect to PostgreSQL —
 * this file is the engine's source of truth for stock parameters.
 *
 * Prices are in integer paise. Volatility and drift parameters
 * control the Geometric Brownian Motion simulation.
 */

export interface StockConfig {
  symbol: string;
  companyName: string;
  sector: string;
  currentPrice: number; // paise
  previousClose: number; // paise — baseline for circuit breaker
  volatility: number; // sigma in GBM formula
  drift: number; // mu in GBM formula
  isHalted: boolean;
}

export const STOCKS: StockConfig[] = [
  {
    symbol: 'NABIL',
    companyName: 'Nabil Bank Limited',
    sector: 'Banking',
    currentPrice: 48_500,
    previousClose: 48_300,
    volatility: 0.02,
    drift: 0.0001,
    isHalted: false,

  },
  {
    symbol: 'NICA',
    companyName: 'NIC Asia Bank Limited',
    sector: 'Banking',
    currentPrice: 62_000,
    previousClose: 61_800,
    volatility: 0.02,
    drift: 0.0001,
    isHalted: false,

  },
  {
    symbol: 'GBIME',
    companyName: 'Global IME Bank Limited',
    sector: 'Banking',
    currentPrice: 31_200,
    previousClose: 31_000,
    volatility: 0.02,
    drift: 0.0001,
    isHalted: false,

  },
  {
    symbol: 'NTC',
    companyName: 'Nepal Telecom',
    sector: 'Telecom',
    currentPrice: 92_500,
    previousClose: 92_200,
    volatility: 0.018,
    drift: 0.0001,
    isHalted: false,

  },
  {
    symbol: 'SHIVM',
    companyName: 'Shivam Cements Limited',
    sector: 'Manufacturing',
    currentPrice: 54_000,
    previousClose: 53_800,
    volatility: 0.025,
    drift: 0.0001,
    isHalted: false,

  },
  {
    symbol: 'HDL',
    companyName: 'Himalayan Distillery Limited',
    sector: 'Manufacturing',
    currentPrice: 315_000,
    previousClose: 313_000,
    volatility: 0.022,
    drift: 0.0001,
    isHalted: false,

  },
  {
    symbol: 'CHCL',
    companyName: 'Chilime Hydropower Company Limited',
    sector: 'Hydro',
    currentPrice: 78_500,
    previousClose: 78_200,
    volatility: 0.015,
    drift: 0.0001,
    isHalted: false,

  },
  {
    symbol: 'UPPER',
    companyName: 'Upper Tamakoshi Hydropower Limited',
    sector: 'Hydro',
    currentPrice: 38_500,
    previousClose: 38_300,
    volatility: 0.015,
    drift: 0.0001,
    isHalted: false,

  },
  {
    symbol: 'NLIC',
    companyName: 'Nepal Life Insurance Company Limited',
    sector: 'Insurance',
    currentPrice: 125_000,
    previousClose: 124_500,
    volatility: 0.019,
    drift: 0.0001,
    isHalted: false,
  },
  {
    symbol: 'SCB',
    companyName: 'Standard Chartered Bank Nepal Limited',
    sector: 'Banking',
    currentPrice: 72_000,
    previousClose: 71_800,
    volatility: 0.02,
    drift: 0.0001,
    isHalted: false,
  },
];

/** Sector-specific volatility from CLAUDE.md */
export const SECTOR_VOLATILITY: Record<string, number> = {
  Banking: 0.02,
  Telecom: 0.018,
  Manufacturing: 0.025,
  Hydro: 0.015,
  Insurance: 0.019,
};