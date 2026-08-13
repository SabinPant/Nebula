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

import { PrismaClient, UserType, ResourceTier } from '@prisma/client';
import { hashPassword } from '../src/shared/utils/crypto';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding database...');

  // Default admin password — bcrypt cost 12, same as every other password
  // in the system (see shared/utils/crypto.ts). Change this immediately
  // after first login via PATCH /auth/change-password.
  const adminPasswordHash = await hashPassword('ChangeMe123!');

  // Create Admin user (singular — only one exists, hardcoded, no registration endpoint)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@nebula.com' },
    update: {
      password: adminPasswordHash,
    },
    create: {
      email: 'admin@nebula.com',
      password: adminPasswordHash,
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

  // Seed 8 starter learning articles — beginner-friendly NEPSE trading education
  const learningResources = [
    {
      title: 'What is NEPSE?',
      slug: 'what-is-nepse',
      category: 'basics',
      tier: ResourceTier.FREE,
      order: 1,
      summary:
        "A quick introduction to the Nepal Stock Exchange — what it is, how it works, and why it matters for anyone learning to trade.",
      content: `# What is NEPSE?

**NEPSE** (Nepal Stock Exchange) is the only stock exchange in Nepal. It is where shares of publicly listed companies — banks, hydropower producers, insurance firms, telecoms, and manufacturers — are bought and sold.

## Why Does NEPSE Exist?

Companies need money to grow. Instead of borrowing from a bank, a company can sell small pieces of itself — called **shares** — to the public. NEPSE is the marketplace where those shares change hands after the company's initial listing.

When you buy a share, you become a **part-owner** of that company. If the company does well, the share price tends to rise, and you may also receive a portion of the profits as a **dividend**.

## How Trading Works

- Buyers and sellers submit **orders** stating how many shares they want and at what price.
- The exchange matches compatible buy and sell orders — this is called **order matching**.
- The price at which a trade actually happens becomes the stock's **current price**.

## Key Terms You'll See Often

| Term | Meaning |
| --- | --- |
| Symbol | Short code identifying a company, e.g. NABIL |
| Current Price | The most recent traded price |
| Previous Close | Yesterday's final price — used to measure daily change |
| Sector | The industry a company belongs to (Banking, Hydro, etc.) |
| Circuit Breaker | A safety pause when price swings too far in one day |

## Why Nebula Uses a Simulated NEPSE

Nebula gives every trader Rs. 50,000 in **virtual** balance to practice with. Nothing here involves real money — it's a safe space to learn how order types, price movement, and portfolios actually behave before ever risking real capital.

Once you're comfortable with the basics here, the same concepts — symbols, order types, circuit breakers — apply directly to real NEPSE trading through a licensed broker.`,
    },
    {
      title: 'How to Place Your First Trade',
      slug: 'how-to-place-your-first-trade',
      category: 'basics',
      tier: ResourceTier.FREE,
      order: 2,
      summary:
        "A step-by-step walkthrough of placing your first BUY order on Nebula, from picking a stock to confirming the trade.",
      content: `# How to Place Your First Trade

Placing a trade on Nebula takes less than a minute once you know where to look. Here's the full walkthrough.

## Step 1 — Explore the Market

Open the **Market** page to see all listed stocks with their current price and daily change. Click any stock to view its price chart and recent history.

## Step 2 — Go to the Trade Page

From the **Trade** page, pick a stock from the dropdown. You'll immediately see its live price and the order form.

## Step 3 — Choose BUY or SELL

Since this is your first trade, you'll choose **BUY**. SELL is used later once you already hold shares of that stock.

## Step 4 — Choose an Order Style

- **MARKET** — fills immediately at the current price. Simplest option for beginners.
- **LIMIT** — fills only at a price you set or better. Useful once you're comfortable with order books.

## Step 5 — Enter Quantity

Type how many shares you want. Nebula shows your estimated total cost as you type, calculated from live prices — so there are no surprises.

## Step 6 — Review and Confirm

Check the estimated cost against your available balance (shown at the top of the page). If everything looks right, submit the order.

## Step 7 — Check Your Order

Head to the **Orders** page to see your order's status:

| Status | Meaning |
| --- | --- |
| PENDING | Order placed, not yet filled |
| PARTIALLY_FILLED | Some shares filled, rest still open |
| COMPLETED | Fully filled |
| CANCELLED | You cancelled it before it filled |
| REJECTED | Order could not be processed (e.g. market closed) |

## A Few Things to Know

- MARKET BUY orders fill instantly — you own the shares right away.
- Your **Portfolio** page updates automatically to reflect new holdings and live profit/loss.
- You can only place a MARKET order while the market is open — check the status banner if you get an error.

That's it — you've placed your first trade. From here, try selling a small portion of your position to see how a SELL order works.`,
    },
    {
      title: 'Understanding Candlestick Charts',
      slug: 'understanding-candlestick-charts',
      category: 'charts',
      tier: ResourceTier.FREE,
      order: 3,
      summary:
        "Learn to read a candlestick chart — the open, high, low, close, and what the colors mean — so you can follow price action at a glance.",
      content: `# Understanding Candlestick Charts

Candlestick charts are the standard way traders visualize price movement over time. Each "candle" packs four numbers into one shape, letting you scan hundreds of price periods quickly.

## Anatomy of a Candle

Every candle represents one time period (1 minute, 1 hour, 1 day — whatever interval you select) and shows four prices:

| Price | Meaning |
| --- | --- |
| Open | The price at the start of the period |
| Close | The price at the end of the period |
| High | The highest price reached during the period |
| Low | The lowest price reached during the period |

The thick middle section is called the **body** — it spans from open to close. The thin lines above and below are called **wicks** (or shadows) — they show the high and low.

## Reading the Color

- **Green (or unfilled) candle** — the close was *higher* than the open. Price went up during this period.
- **Red (or filled) candle** — the close was *lower* than the open. Price went down during this period.

## What the Shape Tells You

- A **long body** means strong buying or selling pressure — price moved a lot in one direction.
- A **long wick** with a small body means the price tried to move but was pushed back — a sign of hesitation or reversal.
- A series of small candles in a row often signals a period of low volatility or indecision.

## Choosing a Time Interval

Nebula lets you view candles at different intervals: 1 minute, 5 minutes, 1 hour, and 1 day.

- Shorter intervals (1m, 5m) show fine detail — useful for watching a stock you're about to trade right now.
- Longer intervals (1h, 1d) show the bigger trend — useful for understanding where a stock has been over days or weeks.

## Practice Tip

Open any stock's chart on the Market page and switch between intervals. Notice how the same price history looks completely different zoomed in versus zoomed out — this is one of the most important lessons in reading charts.`,
    },
    {
      title: 'What is a Limit Order?',
      slug: 'what-is-a-limit-order',
      category: 'basics',
      tier: ResourceTier.FREE,
      order: 4,
      summary:
        "LIMIT orders let you name your price instead of accepting whatever the market offers. Here's how they work and when to use one.",
      content: `# What is a Limit Order?

A **LIMIT order** lets you specify the exact price you're willing to buy or sell at, instead of accepting the current market price.

## How It Works

- A **BUY LIMIT** order fills at your specified price **or lower** — you never pay more than you agreed to.
- A **SELL LIMIT** order fills at your specified price **or higher** — you never receive less than you agreed to.

If no matching counterparty exists yet, your order rests in the **order book**, waiting for someone else's order to cross it.

## Example

Suppose a stock is currently trading at Rs. 500, but you believe it will dip to Rs. 480 before rebounding.

You place a **BUY LIMIT** order at Rs. 480 for 10 shares. Nothing happens immediately — the order sits in the book. If the price later drops to Rs. 480 (or below) and a seller is willing to match it, your order fills automatically, even if you're not watching the screen.

## Order Book Priority

When multiple LIMIT orders exist at the same price, **price-time priority** decides who fills first:

1. Better prices are matched first (higher bids, lower asks).
2. Among equal prices, the **earliest** order placed is matched first.

This is why the order book ladder on the Market and Trade pages shows depth at each price level — it tells you how much competition exists at your chosen price.

## Why Use a LIMIT Order Instead of MARKET?

| Scenario | Better Order Type |
| --- | --- |
| You want certainty of execution right now | MARKET |
| You want price control and can wait | LIMIT |
| You're trying to buy a dip or sell a spike | LIMIT |

## What Happens If It Doesn't Fill?

Your order stays **PENDING** in the order book until it either fills, partially fills, or you cancel it from the Orders page. Unfilled LIMIT orders carry over between trading sessions — they don't expire automatically.

## Key Risk to Understand

A LIMIT order has no fill guarantee. If the market never reaches your price, your order simply never executes. This is the tradeoff for price control.`,
    },
    {
      title: 'What is a Market Order?',
      slug: 'what-is-a-market-order',
      category: 'basics',
      tier: ResourceTier.FREE,
      order: 5,
      summary:
        "MARKET orders trade instantly at the current price. Learn how they work, their tradeoffs, and when to prefer them over a LIMIT order.",
      content: `# What is a Market Order?

A **MARKET order** is the simplest order type: it buys or sells **immediately** at the best currently available price, with no price specified by you.

## How It Works

When you submit a MARKET order on Nebula:

1. The system checks the stock's current live price.
2. Your order fills instantly at that price.
3. Your wallet balance and portfolio update right away.

There's no waiting, no order book entry, and no chance the order goes unfilled — as long as the market is open.

## Example

A stock is trading at Rs. 620. You place a MARKET BUY order for 5 shares. Your order fills immediately at (approximately) Rs. 620 per share, and 5 shares appear in your portfolio within moments.

## MARKET vs. LIMIT

| | MARKET | LIMIT |
| --- | --- | --- |
| Speed | Instant | May take time or never fill |
| Price control | None — takes current price | Full — you set the price |
| Best for | Acting now, simple trades | Targeting a specific entry/exit price |

## When to Use a MARKET Order

- You want to enter or exit a position **right now** and are comfortable with the current price.
- You're a beginner still learning how order books work — MARKET orders remove one variable.
- The stock is stable and unlikely to move much before your order fills.

## Important Restrictions

- MARKET orders are **only accepted while the market is open**. Outside trading hours, you'll see a \`MARKET_CLOSED\` error.
- If the trading engine is temporarily unavailable, MARKET orders are blocked with an \`ENGINE_UNAVAILABLE\` error until it recovers — this protects you from an order filling against stale data.
- A **circuit breaker** can halt a specific stock if its price swings more than 10% in a day. Halted stocks reject new orders, MARKET or LIMIT, until the halt clears.

## Practice Tip

Try a small MARKET order first to get comfortable with the flow, then experiment with a LIMIT order on the same stock to feel the difference in control versus speed.`,
    },
    {
      title: 'Understanding P&L',
      slug: 'understanding-pnl',
      category: 'strategy',
      tier: ResourceTier.FREE,
      order: 6,
      summary:
        "P&L (profit and loss) tells you whether your trades are making or losing money. Here's how it's calculated and where to see it.",
      content: `# Understanding P&L

**P&L** stands for **Profit and Loss** — the single most important number for any trader. It answers one question: *am I making money or losing it?*

## Two Kinds of P&L

### 1. Unrealized P&L

This is the profit or loss on shares you **still hold**. It's calculated as:

\`\`\`
Unrealized P&L = (Current Price − Average Buy Price) × Quantity Held
\`\`\`

It's called "unrealized" because it's only on paper — the price can still move up or down before you sell. Nebula recalculates this live every time you view your Portfolio page, using the stock's current price.

### 2. Realized P&L

This is the profit or loss **locked in** once you actually sell shares. Once a SELL order fills, that portion of your gain or loss becomes permanent and won't change even if the price moves afterward.

## Average Buy Price (Cost Basis)

If you buy the same stock multiple times at different prices, Nebula tracks your **average cost basis**:

\`\`\`
Average Buy Price = Total Amount Spent ÷ Total Shares Bought
\`\`\`

Example: You buy 10 shares at Rs. 500, then later 10 more shares at Rs. 540. Your average buy price becomes:

\`\`\`
(10 × 500 + 10 × 540) ÷ 20 = Rs. 520
\`\`\`

Every P&L calculation uses this blended average, not each individual purchase price.

## Where to See It

- **Portfolio page** — shows unrealized P&L per holding, plus your total portfolio P&L, updated live as prices move.
- **Day's Change** — shows how much your portfolio moved just today, separate from all-time P&L.

## A Common Mistake

New traders sometimes panic-sell the moment unrealized P&L turns negative. Remember: unrealized losses aren't final until you sell. A dip today doesn't necessarily mean the position is a bad one — but a sustained, well-understood downtrend might be a signal to reconsider your position.

## Why This Matters

Understanding P&L is the foundation for every trading decision that follows — position sizing, when to cut losses, and when to take profits all depend on reading this number correctly.`,
    },
    {
      title: 'Common Trading Mistakes',
      slug: 'common-trading-mistakes',
      category: 'strategy',
      tier: ResourceTier.FREE,
      order: 7,
      summary:
        "The mistakes almost every new trader makes — and how to avoid them while you still have the safety net of virtual money.",
      content: `# Common Trading Mistakes

Every trader makes mistakes early on. The advantage of practicing on Nebula is that you can make these mistakes with **virtual** money before they cost you anything real.

## 1. Putting All Your Balance Into One Stock

Buying a single stock with your entire balance means one bad move wipes out your whole account. Spreading your balance across a few different stocks and sectors reduces the damage any single loss can do.

## 2. Chasing a Rising Price (FOMO)

Buying a stock only because it just went up sharply — without understanding why — is one of the most common beginner mistakes. Sharp rises often reverse just as quickly. Ask yourself: would I still want to buy this stock if I'd never seen the recent chart?

## 3. Ignoring Order Types

Beginners often default to MARKET orders for everything, even when a LIMIT order would give them meaningfully better control over their entry price. Learn both — see [What is a Limit Order?](what-is-a-limit-order) and [What is a Market Order?](what-is-a-market-order).

## 4. No Exit Plan

Entering a trade without deciding in advance *when* you'll sell — whether at a profit target or to cut a loss — leads to emotional decisions later. Decide your plan before you buy, not after.

## 5. Overtrading

Placing many trades in a short period, often to "make back" a loss quickly, usually compounds mistakes instead of fixing them. Nebula's daily order cap (50 orders/day) exists partly to encourage more deliberate trading.

## 6. Confusing Unrealized Loss With Failure

A position that's down today isn't automatically a bad trade — see [Understanding P&L](understanding-pnl). Reacting to every daily fluctuation leads to selling low out of fear and buying high out of excitement — the opposite of what works.

## 7. Not Watching the Circuit Breaker

If a stock halts due to a ±10% price swing, that's a signal something significant is happening. Understand *why* before assuming the halt is either purely bad or purely good news.

## The Takeaway

Every mistake on this list is far cheaper to make here, with virtual Rs. 50,000, than with real money. Treat losing trades on Nebula as lessons, not failures — that's exactly what this platform is for.`,
    },
    {
      title: 'Stock Market Glossary',
      slug: 'stock-market-glossary',
      category: 'glossary',
      tier: ResourceTier.FREE,
      order: 8,
      summary:
        "Quick-reference definitions for the trading terms used throughout Nebula and NEPSE — bookmark this one.",
      content: `# Stock Market Glossary

A quick reference for terms you'll encounter throughout Nebula and NEPSE.

## Trading Terms

| Term | Definition |
| --- | --- |
| **Symbol** | The short code identifying a listed company (e.g. NABIL, NICA) |
| **Order** | An instruction to buy or sell a specific quantity of a stock |
| **MARKET Order** | An order that fills instantly at the current price |
| **LIMIT Order** | An order that fills only at your specified price or better |
| **Order Book** | The live list of pending BUY and SELL orders waiting to be matched |
| **Bid** | The highest price a buyer is currently willing to pay |
| **Ask** | The lowest price a seller is currently willing to accept |
| **Fill** | When an order is matched and executed, fully or partially |
| **Price-Time Priority** | The rule that better prices, then earlier orders, are matched first |

## Price & Movement

| Term | Definition |
| --- | --- |
| **Current Price** | The most recent traded price for a stock |
| **Previous Close** | The stock's final price from the prior trading session |
| **Circuit Breaker** | A trading halt triggered when price moves ±10% from previous close in a day |
| **Volatility** | How much and how quickly a stock's price tends to move |
| **Candlestick** | A chart shape showing open, high, low, and close for a time period |

## Account & Portfolio

| Term | Definition |
| --- | --- |
| **Wallet** | Your virtual cash balance used to place trades |
| **Available Balance** | Funds free to use for new orders |
| **Reserved Balance** | Funds locked against pending orders, not yet spent |
| **Holding** | Shares of a stock you currently own |
| **Portfolio** | Your complete set of holdings plus overall performance |
| **P&L (Profit & Loss)** | How much money a position has gained or lost — see [Understanding P&L](understanding-pnl) |
| **Average Buy Price** | The blended cost basis across all your purchases of a stock |

## Platform-Specific Terms

| Term | Definition |
| --- | --- |
| **Broker** | A Nebula-verified user who processes collateral top-ups for assigned traders |
| **Collateral Top-Up** | Adding virtual balance to your wallet, arranged through your broker |
| **Weekly Cap** | The maximum top-up amount allowed per trader per week (Rs. 5,00,000) |
| **Onboarding** | The setup steps (email verification, broker selection) completed after registration |

## Order Status Terms

| Status | Meaning |
| --- | --- |
| **PENDING** | Order placed, not yet filled |
| **PARTIALLY_FILLED** | Some quantity filled, remainder still open |
| **COMPLETED** | Order fully filled |
| **CANCELLED** | Order withdrawn before it filled |
| **REJECTED** | Order could not be processed (e.g. market closed, engine unavailable) |

Bookmark this page — you'll likely refer back to it as you work through the other articles.`,
    },
  ];

  for (const resource of learningResources) {
    await prisma.learningResource.upsert({
      where: { slug: resource.slug },
      update: {},
      create: { ...resource, isPublished: true },
    });
  }
  console.log(`${learningResources.length} learning resources seeded`);
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