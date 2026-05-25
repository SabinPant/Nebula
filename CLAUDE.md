# NEBULA — Virtual Stock Trading & Learning Platform
> FYP Project | BSc Computer Science | 18-Month Build | Agile Scrum (2-Week Sprints)

---

> ⚠️ **IMPORTANT NOTE FOR CLAUDE CODE**
> Everything in this file is a **reference and starting point** — not a locked-in final spec.
> Folder structure, schema fields, env variable names, module names, API endpoints, Redis keys,
> and folder organisation **may evolve during development**. Use this as a guide, not a contract.
> When something needs to change to make better technical sense, change it and note why.

---

## What This Project Is

Nebula is an educational virtual stock trading platform simulating the NEPSE market.
Users get Rs. 100,000 virtual money, trade stocks powered by a custom Market Simulation
Engine, and receive AI coaching via Google Gemini. No real money. No KYC. Learning only.

The Market Simulation Engine is a fully independent, commercialisable service — designed
to be licensed as a stock simulation API post-FYP.

---

## Repository Structure (Reference — may evolve)

```
Nebula/
├── client/    # React (Vite + TypeScript) — UI/UX ONLY, ZERO business logic
├── server/    # NestJS + Prisma + PostgreSQL + Redis — ALL logic lives here
└── engine/    # Custom Market Simulation Engine — independent, commercialisable
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | NestJS v10+, Node.js v20+, TypeScript 5+ |
| Database | PostgreSQL v15+ via Prisma v5+ ORM |
| Cache / Queue | Redis v7+, BullMQ |
| WebSocket | Socket.io + NestJS Gateway |
| Frontend | React v18 + Vite + TypeScript |
| Styling | Tailwind CSS v3+ |
| Charts | TradingView Lightweight Charts |
| State | Zustand (UI state) + React Query (server state) |
| Auth | Passport.js — JWT + Google OAuth |
| Validation | class-validator (server) + Zod (engine) |
| AI | Google Gemini API (server-side only, never exposed to client) |
| Logging | Winston |
| Testing | Jest + Supertest |
| Deployment | Vercel (client) + Render (server + engine) + Supabase (DB) + Upstash (Redis) |

---

## ARCHITECTURE RULES — ALWAYS FOLLOW THESE

These rules are non-negotiable regardless of how the implementation evolves.

### Layer Separation (CRITICAL)

| Layer | Owns | Does NOT own |
|---|---|---|
| Controller | Receives HTTP request, calls service, returns response | Business logic, DB calls, calculations, if-statements about trading rules |
| Service | ALL business logic — balance checks, market status, circuit breaker rules | Raw Prisma calls, Redis ops, external HTTP requests |
| Repository | All Prisma queries + Redis reads/writes, returns plain data objects | Business logic, rule checks, formatting |
| DTO / Validator | Validates incoming data shape via class-validator, rejects malformed input | Domain logic, DB queries, response formatting |

### Module Import Rules

- ✅ Any module can import from `core/` and `shared/`
- ⚠️ Module-to-module only when explicitly necessary
- ❌ No circular imports between modules
- ✅ Cross-module communication via NestJS EventEmitter only (e.g. ORDER_FILLED → wallet updates)
- ❌ Frontend NEVER contains business logic — no price calcs, no balance checks, no validation

### Error Handling

- Services throw typed `HttpException` subclasses — NO try/catch in services or controllers
- One global `@Catch()` ExceptionFilter handles ALL errors — logs via Winston, formats response
- Register in main.ts: `app.useGlobalFilters(new GlobalExceptionFilter())`
- NEVER include stack traces, SQL queries, passwords, or JWT tokens in error responses

### Shared Utils — No Duplication

Any logic used by more than one module lives in `server/src/shared/utils/` only.
Never copy-paste logic between modules. Examples of what belongs here:
- `currency.ts` — paise → Rs. display formatter
- `pnl.ts` — P&L calculation helpers
- `date.ts` — market day/time checks
- `symbol.ts` — stock symbol validator
- `shared/validation/schemas.ts` — Zod schemas for shared input shapes

### Money Arithmetic (CRITICAL — NEVER BREAK THIS RULE)

```typescript
// ❌ WRONG — floating point money causes rounding errors
const total = 1320.50 * quantity;

// ✅ CORRECT — integer paise always
const priceInPaise = 132050;             // Rs. 1320.50 stored as 132050
const totalInPaise = priceInPaise * quantity; // Always exact integer
const display = (priceInPaise / 100).toFixed(2); // Convert ONLY at display time
```

All DB columns for money = INTEGER PAISE. Never float. Never rupees in the database.

---

## BUILD ORDER (FOLLOW THIS EXACTLY)

```
Phase 1 → Build Nebula server + DB + client using a MOCK ENGINE
Phase 2 → Stabilise the full system end-to-end (auth, wallet, orders, portfolio, UI all working)
Phase 3 → Replace mock engine with the real GBM engine
Phase 4 → Harden and commercialise the engine
```

**Why this order:** The server defines the engine's API contract. Building the engine first
means guessing what the server needs. When Nebula is done, the interface is locked and the
engine just plugs in — Nebula doesn't notice the swap.

**What the mock engine looks like** (~30 lines of Node.js):
- Publishes a slightly randomised price to Redis every 3 seconds
- Returns `"filled"` immediately for any order it receives
- This is enough to build and fully test auth, wallet, portfolio P&L, WebSocket, charts, and
  the entire frontend — without writing a single line of GBM code

---

## Folder Structure (Reference — will evolve during development)

> This is the intended starting structure. Add, rename, or reorganise folders as needed
> during development. The layer separation rules above matter more than exact folder names.

```
server/src/
├── modules/
│   ├── auth/              # JWT, OAuth, 2FA, session management
│   ├── users/             # Profile management, avatar upload
│   ├── wallet/            # Balance, reservations, transaction ledger
│   ├── trading/           # Order placement, matching logic
│   │   ├── trading.controller.ts
│   │   ├── order.service.ts
│   │   ├── order-matcher.service.ts
│   │   └── trading.repository.ts
│   ├── portfolio/         # Holdings, P&L calculation
│   ├── market/            # Stock data, price history, market status
│   ├── ai-assistant/      # Gemini integration, rate limiting
│   └── admin/             # User management, engine controls
├── core/
│   ├── database/
│   │   ├── prisma.service.ts
│   │   └── redis.client.ts
│   ├── filters/
│   │   └── http-exception.filter.ts   # Global exception filter
│   └── security/
│       ├── jwt.service.ts
│       └── 2fa.service.ts
└── shared/
    ├── utils/             # All shared helpers — NEVER duplicate logic here
    ├── constants/         # errors.ts, market.constants.ts
    └── middleware/        # auth guard, rate-limit, validation pipe

engine/src/
├── core/
│   ├── price-simulator/   # GBM algorithm
│   ├── order-book/        # Price-time priority matching
│   └── circuit-breaker/   # ±10% halt logic
├── market/
│   ├── market-state.ts    # OPEN / CLOSED / HALTED state machine
│   └── stock-registry.ts
└── api/
    ├── ws-gateway.ts      # WebSocket port 3002 — internal only
    └── http-api.ts        # REST API port 3003 — internal only

client/src/
├── pages/                 # Route-level page components
├── components/            # Reusable UI components
├── hooks/                 # React Query hooks
├── stores/                # Zustand — auth token, theme ONLY
├── services/              # axios HTTP request functions
└── types/                 # TypeScript interfaces
```

---

## Prisma Schema (Reference — fields and relations may change during development)

> This is the intended schema. Column names, optional fields, indexes, and relations
> may be adjusted as development progresses. Always run `npx prisma migrate dev --name <description>`
> after any schema change — never manually alter the database.

```prisma
// server/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ────────────────────────────────────────────────────────────────────

enum UserType {
  TRADER
  BROKER
  ADMIN
}

enum TransactionType {
  INITIAL_DEPOSIT
  ORDER_PLACE
  ORDER_CANCEL
  TRADE_SETTLE
  MANUAL_ADJUST
}

enum OrderType {
  BUY
  SELL
}

enum OrderStyle {
  MARKET
  LIMIT
}

enum OrderStatus {
  PENDING
  PARTIALLY_FILLED
  COMPLETED
  CANCELLED
  REJECTED
}

enum NotificationType {
  ORDER_FILLED
  ORDER_CANCELLED
  PRICE_ALERT
  CIRCUIT_BREAKER
  SYSTEM
}

// ─── Models ───────────────────────────────────────────────────────────────────

model User {
  id              String    @id @default(cuid())
  email           String    @unique
  password        String                          // bcrypt hashed
  userType        UserType  @default(TRADER)
  displayName     String?
  avatarUrl       String?
  isEmailVerified Boolean   @default(false)
  is2FAEnabled    Boolean   @default(false)
  twoFASecret     String?                         // encrypted at application level
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  wallet          Wallet?
  portfolio       Portfolio?
  orders          Order[]
  watchlistItems  WatchlistItem[]
  notifications   Notification[]
  auditLogs       AuditLog[]

  @@index([email])
}

model Wallet {
  id               String   @id @default(cuid())
  userId           String   @unique
  availableBalance Int      @default(10000000) // Rs. 100,000 in paise
  reservedBalance  Int      @default(0)        // Locked by pending orders
  totalDeposited   Int      @default(10000000)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user         User          @relation(fields: [userId], references: [id])
  transactions Transaction[]

  @@index([userId])
}

model Transaction {
  id          String          @id @default(cuid())
  walletId    String
  type        TransactionType
  amount      Int                                  // Paise — positive = credit, negative = debit
  description String
  referenceId String?                              // orderId or tradeId for traceability
  createdAt   DateTime        @default(now())

  wallet Wallet @relation(fields: [walletId], references: [id])

  @@index([walletId, createdAt])
}

model Stock {
  id           String   @id @default(cuid())
  symbol       String   @unique
  companyName  String
  sector       String
  currentPrice Int                          // Paise
  previousClose Int                         // Paise — circuit breaker compares against this
  volatility   Float    @default(0.02)      // GBM sigma — sector dependent
  drift        Float    @default(0.0001)    // GBM drift
  isHalted     Boolean  @default(false)
  haltReason   String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  orders         Order[]
  holdings       Holding[]
  watchlistItems WatchlistItem[]
  priceHistory   PriceHistory[]
  trades         Trade[]

  @@index([symbol])
}

model Order {
  id             String      @id @default(cuid())
  userId         String
  stockId        String
  type           OrderType
  orderStyle     OrderStyle
  price          Int?                          // Paise — null for MARKET orders
  quantity       Int
  filledQuantity Int         @default(0)
  status         OrderStatus @default(PENDING)
  rejectionReason String?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  user   User    @relation(fields: [userId], references: [id])
  stock  Stock   @relation(fields: [stockId], references: [id])
  buyTrades  Trade[] @relation("BuyOrder")
  sellTrades Trade[] @relation("SellOrder")

  @@index([userId, createdAt])
  @@index([stockId, status])
}

model Trade {
  id          String   @id @default(cuid())
  buyOrderId  String
  sellOrderId String
  stockId     String
  quantity    Int
  price       Int                          // Paise — executed price
  createdAt   DateTime @default(now())

  buyOrder  Order @relation("BuyOrder",  fields: [buyOrderId],  references: [id])
  sellOrder Order @relation("SellOrder", fields: [sellOrderId], references: [id])
  stock     Stock @relation(fields: [stockId], references: [id])

  @@index([stockId, createdAt])
}

model Portfolio {
  id               String   @id @default(cuid())
  userId           String   @unique
  totalValue       Int      @default(0)   // Paise — recalculated on demand
  totalInvested    Int      @default(0)   // Paise
  totalProfitLoss  Int      @default(0)   // Paise — can be negative
  updatedAt        DateTime @updatedAt

  user     User      @relation(fields: [userId], references: [id])
  holdings Holding[]

  @@index([userId])
}

model Holding {
  id              String   @id @default(cuid())
  userId          String
  stockId         String
  portfolioId     String
  quantity        Int
  averageBuyPrice Int                          // Paise
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  stock     Stock     @relation(fields: [stockId], references: [id])
  portfolio Portfolio @relation(fields: [portfolioId], references: [id])

  @@unique([userId, stockId])
  @@index([userId])
}

model PriceHistory {
  id        String   @id @default(cuid())
  stockId   String
  open      Int                              // Paise
  high      Int                              // Paise
  low       Int                              // Paise
  close     Int                              // Paise
  volume    BigInt   @default(0)
  interval  String                           // "1m" | "5m" | "1h" | "1d"
  timestamp DateTime

  stock Stock @relation(fields: [stockId], references: [id])

  @@index([stockId, timestamp])               // Critical — chart queries hit this constantly
}

model WatchlistItem {
  id         String   @id @default(cuid())
  userId     String
  stockId    String
  priceAlert Int?                             // Paise — null if no alert set
  createdAt  DateTime @default(now())

  user  User  @relation(fields: [userId], references: [id])
  stock Stock @relation(fields: [stockId], references: [id])

  @@unique([userId, stockId])
}

model Notification {
  id        String           @id @default(cuid())
  userId    String
  type      NotificationType
  title     String
  message   String
  data      Json?                             // Extra context (orderId, symbol, etc.)
  isRead    Boolean          @default(false)
  createdAt DateTime         @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId, isRead])
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String?                           // Null for system events
  action    String
  ipAddress String?
  userAgent String?
  metadata  Json?
  createdAt DateTime @default(now())

  user User? @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
  @@index([action, createdAt])
}
```

---

## Environment Variables (Reference — names may be adjusted during development)

```bash
# server/.env.development
DATABASE_URL="postgresql://nebula_user:nebula_pass@localhost:5432/nebula_dev"
REDIS_URL="redis://localhost:6379"
JWT_ACCESS_SECRET="replace-with-64-char-random-string-never-commit"
JWT_ACCESS_EXPIRY="15m"
JWT_REFRESH_SECRET="different-64-char-random-string-for-refresh"
JWT_REFRESH_EXPIRY="7d"
APP_PORT=3001
NODE_ENV="development"
GEMINI_API_KEY=          # SERVER-SIDE ONLY — never in client code or client .env
ENGINE_HTTP_URL="http://localhost:3003"
ENGINE_WS_URL="ws://localhost:3002"
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL="http://localhost:3001/auth/google/callback"
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# engine/.env.development
ENGINE_WS_PORT=3002
ENGINE_HTTP_PORT=3003
REDIS_URL="redis://localhost:6379"
MARKET_OPEN_TIME="09:30"
MARKET_CLOSE_TIME="18:00"
PRICE_UPDATE_INTERVAL_MS=3000

# client/.env.development
VITE_API_URL="http://localhost:3001"
VITE_WS_URL="ws://localhost:3001"
# ❌ NO engine URL here — client NEVER connects to engine directly
```

---

## Communication Protocol

| From | To | Protocol | Notes |
|---|---|---|---|
| Client | Server | HTTP REST | All business ops — orders, auth, portfolio |
| Client | Server | Socket.io | Receive live prices, notifications (server pushes only) |
| Server | Engine | HTTP REST (internal) | Forward orders, admin controls. Port never exposed to internet |
| Engine | Server | Redis Pub/Sub | Price updates, trade fills, circuit breaker events |
| Server | Modules | NestJS EventEmitter | ORDER_FILLED → wallet module updates balance |
| Server | Gemini | HTTPS REST | AI queries. API key stays server-side only |
| Client | Engine | ❌ BLOCKED | Frontend NEVER connects directly to engine |

---

## API Endpoints (Reference — may change during development)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /auth/register | Public | Register, returns JWT pair, creates wallet |
| POST | /auth/login | Public | Login, sets refresh token in HTTP-only cookie |
| POST | /auth/refresh | Cookie | Rotate refresh token, return new pair |
| POST | /auth/logout | JWT | Blacklist JWT, clear cookie |
| POST | /auth/verify-email | Public | Verify email from link token |
| POST | /auth/reset-password | Public | Trigger password reset email |
| GET | /users/me | JWT | Get own profile |
| PATCH | /users/me | JWT | Update display name, avatar |
| GET | /wallet/me | JWT | Current balance and buying power |
| GET | /wallet/transactions | JWT | Paginated transaction history |
| POST | /orders | JWT | Place buy or sell order |
| GET | /orders | JWT | Order history (paginated) |
| PATCH | /orders/:id/cancel | JWT | Cancel pending order, release reserved funds |
| GET | /portfolio/me | JWT | Full portfolio with P&L |
| GET | /portfolio/holdings | JWT | All holdings with quantities and P&L |
| GET | /market/stocks | JWT | All stocks with current prices |
| GET | /market/stocks/:symbol | JWT | Stock detail, circuit breaker status |
| GET | /market/stocks/:symbol/history | JWT | Price history for charts (?interval=1m\|5m\|1h\|1d) |
| GET | /market/status | Public | OPEN / CLOSED / HALTED |
| POST | /ai/ask | JWT | AI question (5/day free tier) |
| POST | /ai/analyse-portfolio | JWT | AI portfolio risk analysis |
| GET | /admin/users | ADMIN | List all users |
| PATCH | /admin/users/:id/suspend | ADMIN | Suspend user |
| POST | /admin/engine/start | ADMIN | Start market simulation |
| POST | /admin/engine/stop | ADMIN | Stop market simulation |
| PATCH | /admin/stocks/:symbol/halt | ADMIN | Manually halt a stock |

---

## WebSocket Events (Reference)

| Event | Direction | Scope | Payload |
|---|---|---|---|
| price:update | Server→Client | stock:{symbol} room | { symbol, price, changePercent, volume, timestamp } |
| order:filled | Server→Client | user:{userId} room | { orderId, status, executedPrice, quantity, stockSymbol } |
| order:partial | Server→Client | user:{userId} room | { orderId, filledQty, remainingQty } |
| portfolio:update | Server→Client | user:{userId} room | Updated totals and P&L |
| circuit:triggered | Server→Client | broadcast all | { symbol, direction, haltReason, educationalNote } |
| market:status | Server→Client | broadcast all | { status: OPEN\|CLOSED\|HALTED } |
| notification:new | Server→Client | user:{userId} room | { type, title, message, data } |
| subscribe:stock | Client→Server | — | { symbol } — join price room |
| unsubscribe:stock | Client→Server | — | { symbol } — leave price room |

---

## Standard Error Response

```typescript
// Every error returns this exact shape — no exceptions
{
  statusCode: 400,
  error:      "BAD_REQUEST",
  message:    "Insufficient wallet balance",   // Human-readable
  code:       "WALLET_INSUFFICIENT_FUNDS",     // Machine-readable for frontend
  timestamp:  "2025-01-01T09:30:00Z"
  // NEVER include: passwords, JWT tokens, stack traces, SQL queries
}
```

---

## Redis Key Structure (Reference — may evolve)

| Key Pattern | Purpose | TTL |
|---|---|---|
| `session:{userId}` | JWT session data | 7 days |
| `token:blacklist:{jti}` | Revoked JWT on logout | Max 15 min |
| `refreshtoken:{userId}` | Hashed refresh token | 7 days |
| `stock:price:{symbol}` | Latest price cache (paise) | 10 seconds |
| `orderbook:buy:{symbol}` | Buy order sorted set | No TTL |
| `orderbook:sell:{symbol}` | Sell order sorted set | No TTL |
| `circuit:{symbol}` | Circuit breaker state | 1 hour |
| `market:status` | OPEN / CLOSED / HALTED | No TTL |
| `ratelimit:auth:{ip}` | Auth rate limit counter | 1 min |
| `ratelimit:orders:{userId}` | Order rate limit counter | 1 min |
| `ratelimit:ai:{userId}` | AI rate limit counter | 1 day |
| `ratelimit:public:{ip}` | Public endpoint counter | 1 min |
| `2fa:pending:{userId}` | Pending TOTP code | 5 min |
| `pubsub:prices` | Engine price broadcast channel | N/A |
| `pubsub:trades` | Trade fill notification channel | N/A |
| `queue:orders` | BullMQ order queue | N/A |

---

## Security Rules

- JWT access tokens: 15 min expiry, memory only — NOT localStorage, NOT sessionStorage
- JWT refresh tokens: 7 days, HTTP-only Secure SameSite=Strict cookie only
- Token rotation: every `/auth/refresh` invalidates old token and issues new one
- Blacklisted JWTs stored in Redis by `jti` claim for the remaining 15 min window
- Helmet.js on all server responses (14 security headers)
- `ValidationPipe` globally: `whitelist: true` + `forbidNonWhitelisted: true`
- All Gemini API calls stay server-side — API key never reaches the client

### Rate Limits (Reference)

| Endpoint Group | Limit | Window |
|---|---|---|
| Auth (login/register/reset) | 10 req | per minute |
| Order placement | 50 req | per minute |
| AI queries (free tier) | 5 req | per day |
| Public endpoints | 100 req | per minute |
| Admin endpoints | 30 req | per minute |

---

## Market Simulation Engine Rules

### GBM Formula
```
Next Price = Current Price × exp( (drift - 0.5σ²) × dt + σ × √dt × Z )

drift  = 0.0001 (small positive for gradual upward bias)
sigma  = sector volatility — IT: 0.03 | Banking: 0.02 | Hydro: 0.015
dt     = PRICE_UPDATE_INTERVAL_MS / trading_day_ms
Z      = Box-Muller transform random N(0,1)

Safety clamp: never below Rs.1 (100 paise), never above Rs.10,00,000
```

### Circuit Breaker
```typescript
const UPPER_LIMIT =  0.10; // +10% from previousClose triggers halt
const LOWER_LIMIT = -0.10; // -10% from previousClose triggers halt
// ALWAYS compare against previousClose — NEVER against currentPrice
const change = (currentPrice - previousClose) / previousClose;
```

### Market State Machine

| State | Entry Condition | Orders | Prices |
|---|---|---|---|
| PRE_OPEN | Before 09:30 | Accepted but NOT matched | None |
| OPEN | 09:30 daily | Matched, circuit breakers active | GBM every 3s |
| HALTED | ±10% hit | Existing orders paused, no new matching | Frozen |
| CLOSED | 18:00 daily | MARKET orders rejected, LIMIT orders queue | None |

### Engine Independence — CRITICAL

The engine ONLY knows about: stocks, orders, prices, market state, circuit breakers, order book.

The engine knows NOTHING about: users, wallets, portfolios, auth, JWT, Prisma, NestJS, Nebula business rules.

### Zod Validation in Engine (Required)
All data read from Redis MUST be parsed through Zod schemas before processing.
Wrap `Zod.parse()` in try-catch — log and reject malformed data, never halt the engine process.

---

## Order Matching — All Edge Cases Must Be Unit Tested

| Scenario | Expected Behaviour |
|---|---|
| Full market fill | Both orders COMPLETED, Trade record created, quantities match |
| Partial fill | Order PARTIALLY_FILLED, remainder stays PENDING, reserved funds adjusted |
| Multiple matches | Multiple Trade records created, filledQuantity updated after each |
| No counterpart (MARKET) | Order REJECTED immediately, wallet funds NOT reserved |
| Self-trade prevention | Engine skips self-match, finds next counterparty or stays PENDING |
| Cancel PARTIALLY_FILLED | Unfilled portion released from wallet.reservedBalance |
| Circuit breaker block | REJECTED with MARKET_STOCK_HALTED |
| Market closed (MARKET order) | REJECTED with MARKET_CLOSED |
| Price-time priority | Same price → earlier timestamp wins |
| Integer paise math | 132050 × 7 = 924350 exactly — no floating-point error |

---

## First-Day Setup (Reference — adjust as needed)

```bash
# From Nebula/ root
docker-compose up -d
sleep 5

# Server setup
cd server
npm install
cp .env.example .env.development   # Fill in credentials
npx prisma generate
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts
npm run start:dev &

# Engine setup (mock engine first — real engine built in Sprint 6)
cd ../engine
npm install
npm run start:dev &

# Client setup
cd ../client
npm install
npm run dev &

echo "Nebula running at http://localhost:5173"
```

---

## Sprint Roadmap (High-Level Reference)

| Sprint | Weeks | Key Deliverable |
|---|---|---|
| 0 | 1–2 | Dev environment, NestJS + Prisma + PostgreSQL + Redis running, first migration |
| 1 | 3–4 | Auth: register, login, email verify, JWT, refresh tokens, rate limiting |
| 2 | 5–6 | Wallet: balance tracking, reservations, transaction ledger |
| 3 | 7–8 | Mock engine + WebSocket → frontend, candlestick charts working |
| 4 | 9–10 | Orders: place/cancel, balance reservation, order history |
| 5 | 11–12 | Portfolio: holdings, unrealised P&L, diversification view |
| 6 | 13–14 | Real Engine Core: GBM, order book, circuit breakers, state machine |
| 7 | 15–16 | Real Engine Advanced: partial fills, self-trade prevention, BullMQ |
| 8 | 17–18 | AI Assistant: Gemini Q&A + portfolio analysis, 5/day rate limit |
| 9 | 19–20 | Security hardening: full audit, OWASP scan |
| 10 | 21–22 | Admin panel: user/stock management, engine controls |
| 11–15 | 23–36 | Gamification, Engine API product, testing, deployment, buffer |

---

## Key Development Rules (These Never Change)

1. **Core 5 MVP first** — auth, wallet, orders, portfolio, market data before anything else
2. **Build Nebula first, engine second** — server defines the engine's contract, not the other way around
3. **Controllers route, services decide, repositories query** — never cross layer boundaries
4. **No try/catch in controllers or services** — throw typed exceptions, global filter catches everything
5. **Shared logic in `shared/utils/` only** — never duplicated across modules
6. **All money = integer paise everywhere** — only convert to display format at the UI layer
7. **Unit test ALL order matching edge cases** before integrating the engine with the server
8. **Security from Day 1** — Helmet, rate limiting, JWT rotation, parameterised queries, no secrets in frontend
9. **Frontend is UI only** — if financial logic appears in React, move it to the server immediately
10. **Engine knows nothing about Nebula** — no users, no wallets, no auth, no NestJS, no Prisma
