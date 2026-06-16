/// <reference types="node" />
/**
 * Database Seeder
 *
 * Seeds the database with essential data required for the application to function.
 * Creates the single Admin user (hardcoded — no public registration exists for Admin)
 * and 10 NEPSE-listed stocks with realistic sector assignments and initial prices.
 *
 * Run via: npx prisma db seed
 * Requires ts-node to be configured in package.json prisma.seed field.
 */

import { PrismaClient, UserType } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding database...');

  // Create Admin user (singular — only one exists, hardcoded, no registration endpoint)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@nebula.com' },
    update: {},
    create: {
      email: 'admin@nebula.com',
      password: null, // Will be set via direct DB update or a setup script in production
      userType: UserType.ADMIN,
      displayName: 'Nebula Admin',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      isOnboardingComplete: true,
      isFirstLogin: false,
    },
  });
  console.log(`Admin user created: ${admin.id}`);

  // Create Admin wallet
  await prisma.wallet.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      availableBalance: 0,
      reservedBalance: 0,
      totalDeposited: 0,
    },
  });
  console.log('Admin wallet created');

  // Seed 10 NEPSE-listed stocks with realistic data
  const stocks = [
    {
      symbol: 'NABIL',
      companyName: 'Nabil Bank Limited',
      sector: 'Banking',
      currentPrice: 48500, // Rs. 485.00 in paise
      previousClose: 48300,
      volatility: 0.02,
      drift: 0.0001,
    },
    {
      symbol: 'NICA',
      companyName: 'NIC Asia Bank Limited',
      sector: 'Banking',
      currentPrice: 62000,
      previousClose: 61800,
      volatility: 0.02,
      drift: 0.0001,
    },
    {
      symbol: 'GBIME',
      companyName: 'Global IME Bank Limited',
      sector: 'Banking',
      currentPrice: 31200,
      previousClose: 31000,
      volatility: 0.02,
      drift: 0.0001,
    },
    {
      symbol: 'NTC',
      companyName: 'Nepal Telecom',
      sector: 'Telecom',
      currentPrice: 92500,
      previousClose: 92200,
      volatility: 0.018,
      drift: 0.0001,
    },
    {
      symbol: 'SHIVM',
      companyName: 'Shivam Cements Limited',
      sector: 'Manufacturing',
      currentPrice: 54000,
      previousClose: 53800,
      volatility: 0.025,
      drift: 0.0001,
    },
    {
      symbol: 'HDL',
      companyName: 'Himalayan Distillery Limited',
      sector: 'Manufacturing',
      currentPrice: 315000,
      previousClose: 313000,
      volatility: 0.022,
      drift: 0.0001,
    },
    {
      symbol: 'CHCL',
      companyName: 'Chilime Hydropower Company Limited',
      sector: 'Hydro',
      currentPrice: 78500,
      previousClose: 78200,
      volatility: 0.015,
      drift: 0.0001,
    },
    {
      symbol: 'UPPER',
      companyName: 'Upper Tamakoshi Hydropower Limited',
      sector: 'Hydro',
      currentPrice: 38500,
      previousClose: 38300,
      volatility: 0.015,
      drift: 0.0001,
    },
    {
      symbol: 'NLIC',
      companyName: 'Nepal Life Insurance Company Limited',
      sector: 'Insurance',
      currentPrice: 125000,
      previousClose: 124500,
      volatility: 0.019,
      drift: 0.0001,
    },
    {
      symbol: 'SCB',
      companyName: 'Standard Chartered Bank Nepal Limited',
      sector: 'Banking',
      currentPrice: 72000,
      previousClose: 71800,
      volatility: 0.02,
      drift: 0.0001,
    },
  ];

  for (const stock of stocks) {
    await prisma.stock.upsert({
      where: { symbol: stock.symbol },
      update: {},
      create: stock,
    });
  }
  console.log(`${stocks.length} stocks seeded`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Seed complete');
  })
  .catch(async (error) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });