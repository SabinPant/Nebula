# NEBULA — Virtual Stock Trading & Learning Platform

> Real Product | BSc Computer Science FYP | 18-Month Build | Agile Scrum (2-Week Sprints)
> Goal: Build production-quality software — secure, scalable, maintainable. Not just a project to pass.

---

> ⚠️ **IMPORTANT NOTE FOR CLAUDE CODE**
> Everything in this file is a **reference and starting point** — not a locked-in final spec.
> Folder structure, schema fields, env variable names, module names, API endpoints, and Redis keys
> **may evolve during development**. Use this as a guide, not a contract.
> When something needs to change to make better technical sense, change it and note why.
> **Quality over quantity. One clean, tested, secure feature beats ten broken ones.**

📋 **SESSION BEHAVIOUR FOR CLAUDE CODE**

> At the start of every session, the developer will tell you: which sprint we are on and what
> the current task is. Focus only on that task. Do not implement future sprints speculatively.
>
> When generating multiple files for a task, create related files together as a logical unit
> (e.g. controller + service + repository + DTO for one module = one unit). After each unit,
> state clearly what was created, where each file lives, and what to run next. Wait for
> confirmation before moving to the next unit.
>
> When something goes wrong, explain what the error means and how to fix it — do not just
> output a silent code change. The developer needs to understand what happened.
>
> Keep responses focused. Skip restating instructions that were already in the prompt.
> Lead with the code or command, follow with a brief explanation only if needed.

---

## What This Project Is

Nebula is an educational virtual stock trading platform simulating the NEPSE market.
Traders receive Rs. 50,000 virtual starting balance, trade stocks powered by a custom
Market Simulation Engine, and receive AI coaching via Google Gemini.

Three distinct user roles: Trader, Broker, Admin — each with their own registration process,
dashboard, and responsibilities. Collateral top-ups involve real money changing hands outside
the platform (broker-mediated). Trading itself uses virtual balance only — no real trades executed.

The Market Simulation Engine is a fully independent, commercialisable service — designed
to be licensed as a stock simulation API post-FYP (B2B product).

---

## Repository Structure

```
Nebula/
├── client/    # React (Vite + TypeScript) — UI/UX ONLY, ZERO business logic
├── server/    # NestJS + Prisma + PostgreSQL + Redis — ALL logic lives here
└── engine/    # Custom Market Simulation Engine — fully independent
```

---

## Tech Stack

| Layer         | Technology                                                                           |
| ------------- | ------------------------------------------------------------------------------------ |
| Backend       | NestJS v10+, Node.js v24+, TypeScript 5+                                             |
| Database      | PostgreSQL v15+ via Prisma v5+ ORM                                                   |
| Cache / Queue | Redis v7+, BullMQ                                                                    |
| WebSocket     | Socket.io + NestJS Gateway                                                           |
| Frontend      | React v18 + Vite + TypeScript                                                        |
| Styling       | Tailwind CSS v3+                                                                     |
| Charts        | TradingView Lightweight Charts                                                       |
| State         | Zustand (UI state only) + React Query (server state)                                 |
| Auth          | Passport.js — JWT + Google OAuth 2.0                                                 |
| Validation    | class-validator + class-transformer (server) + Zod (engine only)                     |
| AI            | Google Gemini API — server-side only, never exposed to client                        |
| File Storage  | Cloudinary (broker documents, receipts, avatars) → migrate to AWS S3 when scaling    |
| Email         | SMTP via Nodemailer — Mailhog in development, real SMTP in production                |
| Logging       | Winston — debug level in dev, info level in prod                                     |
| Testing       | Jest + Supertest                                                                     |
| Deployment    | Vercel (client) + Render/Railway (server + engine) + Supabase (DB) + Upstash (Redis) |

---

## ARCHITECTURE RULES — ALWAYS FOLLOW THESE

### Layer Separation (CRITICAL — Never cross these boundaries)

| Layer           | Owns                                                                 | Never owns                                                         |
| --------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Controller      | Receives HTTP request, calls service, returns response               | Business logic, DB calls, calculations, trading rule if-statements |
| Service         | ALL business logic — balance checks, market status, rule enforcement | Raw Prisma calls, Redis ops, external HTTP calls                   |
| Repository      | All Prisma queries + Redis reads/writes, returns plain data          | Business logic, rule checks, response formatting                   |
| DTO / Validator | Validates and transforms incoming data shape via class-validator     | Domain logic, DB queries, formatting                               |

### Module Import Rules

- ✅ Any module can import from `core/` and `shared/`
- ⚠️ Module-to-module imports only when explicitly necessary
- ❌ No circular imports between modules ever
- ✅ Cross-module communication via NestJS EventEmitter only
- ❌ Frontend NEVER contains business logic — no price calcs, no balance checks, no validation

### Error Handling

- Services throw typed `HttpException` subclasses — NO try/catch in services or controllers
- One global `@Catch()` ExceptionFilter handles ALL errors — logs via Winston, formats response
- Register in main.ts: `app.useGlobalFilters(new GlobalExceptionFilter())`
- NEVER expose: stack traces, SQL queries, passwords, JWT tokens in error responses

### Shared Utils — Zero Duplication

Logic used by more than one module lives in `server/src/shared/utils/` only. Never copy-paste.

- `currency.ts` — paise ↔ Rs. conversion, display formatting
- `pnl.ts` — P&L, unrealised gain/loss, average cost basis
- `date.ts` — market day checks, week start calculation (Asia/Kathmandu), trading hours
- `symbol.ts` — stock symbol format validator
- `topup.ts` — weekly cap calculation using DB aggregation
- `paginate.ts` — shared cursor-based and page-based pagination wrapper
- `lock.ts` — Redis distributed lock helper for concurrency-sensitive operations

### Money Arithmetic (CRITICAL — NEVER BREAK)

```typescript
// ❌ WRONG — floating point causes rounding errors on financial data
const total = 1320.5 * quantity;

// ✅ CORRECT — integer paise everywhere
const priceInPaise = 132050; // Rs. 1320.50 → 132050 paise
const totalInPaise = priceInPaise * quantity; // Always exact integer
const display = (priceInPaise / 100).toFixed(2); // Convert to Rs. ONLY at display time
```

All DB money columns = INTEGER PAISE. Never float. Never store rupees in the database.

---

## ACTORS & REGISTRATION FLOWS

### Actor 1 — Trader

**Who:** Any member of the public wanting to learn trading.

**Email/password registration:**

```
Visit /register → fill form (name, email, password) → submit
        ↓
Email verification sent (Redis token: email:verify:{token}, TTL 24h)
        ↓
Trader clicks verify link → isEmailVerified = true, emailVerifiedAt = now()
        ↓
isOnboardingComplete = false → redirected to /onboarding/select-broker
        ↓
Trader browses available active brokers (brokerNumber, name, bio, assigned trader count)
        ↓
Selects preferred broker → confirms → assignedBrokerId set
        ↓
isOnboardingComplete = true → Trader Dashboard
Wallet auto-created: availableBalance = Rs. 50,000 (5,000,000 paise), INITIAL_DEPOSIT transaction created
```

**Google OAuth registration (same onboarding, different entry):**

```
Click "Sign in with Google" → Google returns verified profile
        ↓
User created: password = null, isEmailVerified = true, emailVerifiedAt = now()
(Google already verified the email — skip verification step entirely)
        ↓
isOnboardingComplete = false → redirected to /onboarding/select-broker
        ↓
Identical broker selection flow
        ↓
isOnboardingComplete = true → Trader Dashboard
```

> ⚠️ **Route guard rule:** Every protected route checks BOTH `isEmailVerified` AND
> `isOnboardingComplete`. If either is false, redirect accordingly. No exceptions.

> ⚠️ **Edge case — no brokers exist yet:** If broker list is empty, show:
> "No brokers are currently available. Please check back soon or contact admin@nebula.com"
> Hold trader in onboarding. Do NOT allow skipping broker selection under any circumstance.

> ⚠️ **Wallet creation is atomic with registration:** Create User + Wallet + initial
> Transaction in a single Prisma transaction. If any part fails, roll back entirely.
> Never leave a User without a Wallet.

**Trader capabilities:**

- Buy/sell stocks with virtual balance
- View portfolio, holdings, P&L, order history
- Add stocks to watchlist with price alerts
- Contact assigned broker for collateral top-up (broker contact shown in wallet page)
- Ask AI assistant (2 questions/day)
- Access free learning resources
- Cannot switch broker — must contact Admin for reassignment

---

### Actor 2 — Broker

**Who:** Verified professionals approved by Admin. Not self-service.

**Application flow:**

```
Visit /broker-apply (public page) → fill application form:
  - Full legal name (required)
  - Email address (required — used for setup link on approval)
  - Phone number (required — @@unique on BrokerApplication, prevents duplicate submissions)
  - Date of birth (required)
  - Document ID number (required — citizen card, driver licence, passport)
  - Document photo (required — uploaded to Cloudinary private folder)
  - Reason for applying (required — free text)
        ↓
System checks: does a User with this email already exist?
        ↓
    ├── No existing user → application stored (status: PENDING)
    │
    └── Existing User found (e.g. already a Trader) →
        Application still stored (status: PENDING)
        existingUserId set on BrokerApplication record
        Admin sees warning badge: "⚠️ Applicant already has a Trader account"
        ↓
Admin receives notification: new broker application pending review
```

**Admin approval decision:**

```
Admin reviews application + document
        ↓
    ├── REJECTED → adminNote required → rejection email sent → status = REJECTED
    │
    └── APPROVED →
            ├── No existing account →
            │   Admin assigns brokerNumber (e.g. BROKER-001)
            │   BrokerInvitation created: token (UUID, hashed in Redis), expiresAt = 48h
            │   Setup email sent: "Set up your Nebula Broker account → [link]"
            │   Broker clicks link → sets own password + confirms profile
            │   User created (UserType: BROKER, isFirstLogin: false — they set their own password)
            │   BrokerApplication.userId linked
            │
            └── Existing Trader account found →
                Admin chooses:
                Option A — "Upgrade account to Broker"
                    → UserType changed: TRADER → BROKER
                    → Wallet, portfolio, order history preserved
                    → brokerNumber assigned
                    → Notification email: "Your account has been upgraded to Broker"
                Option B — "Create separate Broker account"
                    → Admin provides different email for broker account
                    → New User created, setup link sent as above
```

> ⚠️ **Broker invitation token:** Stored as hashed value in Redis key
> `broker:invite:{token}` with 48h TTL. Single-use — deleted immediately on use or expiry.
> Never transmit or store plain password in email under any circumstance.

> ⚠️ **Broker suspension:** When Admin suspends a broker:
>
> - ALL /broker/\* endpoints return 403 BROKER_SUSPENDED immediately (checked in guard)
> - Broker's assigned traders KEEP their assignedBrokerId (not nulled out)
> - Trader's /wallet/topup-info shows: "Your broker is currently suspended. Contact admin@nebula.com"
> - Traders can continue trading normally — virtual balance unaffected
> - Admin can reassign traders and/or unsuspend broker at any time

**Broker capabilities:**

- View all assigned traders: profiles, portfolios, order history
- Process collateral top-ups for assigned traders only (weekly cap enforced)
- Flag suspicious trader behaviour → Admin notified
- Cannot access any trader not in their assigned list
- Activity log of every action they have taken

**Broker dashboard sections:**

- My Traders — assigned traders with key metrics
- Top-Up Management — process new top-ups, view history
- Trader Monitoring — deep view of individual assigned trader
- Flag Management — raise, track, view resolution of flags
- Activity Log — complete record of all broker actions
- Profile — edit own contact info (name, phone, email visible to assigned traders)

---

### Actor 3 — Admin (Singular — you only)

**Who:** One person. Hardcoded. Seeded in `prisma/seed.ts`. No registration endpoint exists.

**Admin capabilities:**

- User management: view, suspend, unsuspend (NO hard delete — suspend only)
- Broker application review: approve (create account via invitation) or reject with reason
- Upgrade existing trader to broker (on application approval)
- Reassign trader to different broker at any time
- Override weekly top-up cap: credit any amount to any trader (reason + reference mandatory)
- Stock and company management: add, edit, manually halt/unhalt
- Engine controls: start, stop, configure via admin panel
- Financial overview: top-up volumes, transaction totals, active user counts
  (No "company income" metric — platform is free for MVP. Post-MVP: transaction fees, subscriptions)
- Suspicious flag management: resolve or dismiss with admin decision note
- Learning content management: create, edit, publish, unpublish articles
- Full audit log viewer with filters
- View all AuditLog entries — every broker action, top-up, suspension is logged

---

## COLLATERAL TOP-UP FLOW

```
Trader visits /wallet → "Need more collateral?" section
Message: "Contact your broker to add collateral"
Assigned broker shown: Name | Phone | Email
        ↓
    If broker is suspended: "Your broker is currently suspended. Contact admin@nebula.com"
        ↓
Trader contacts broker OUTSIDE Nebula (WhatsApp, phone, email)
Agrees on amount → sends real payment (eSewa / Khalti / QR / bank transfer)
Sends payment receipt screenshot to broker (outside Nebula)
        ↓
Broker logs in → assigned trader's profile → Top-Up tab
Fills form:
  - Trader (pre-filled — own assigned traders only)
  - Amount in Rs. (min Rs. 100, max single top-up Rs. 100,000)
  - Payment method: eSewa | Khalti | Bank Transfer | QR
  - Transaction reference (MANDATORY — e.g. eSewa ID "TXN-XXXX")
    → @@unique([transactionRef, brokerId]) — prevents same ref used twice by same broker
  - Receipt image (MANDATORY — Cloudinary upload, private folder, 5MB max, images only)
  - Optional note
        ↓
System calculates weekly total from DB (NOT Redis TTL):
  weeklyTotal = SUM(amountPaise) WHERE traderId = X AND createdAt >= Monday 00:00 Asia/Kathmandu
        ↓
    ├── weeklyTotal + newAmount <= 50,000,000 paise (Rs. 500,000) →
    │   Redis wallet lock acquired: lock:wallet:{traderId} (5s TTL)
    │   Prisma transaction:
    │     → TopUpRequest created (status: COMPLETED, weeklyTotalBefore recorded)
    │     → wallet.availableBalance += amount
    │     → Transaction record (type: COLLATERAL_TOP_UP, referenceId = topUpRequest.id)
    │     → AuditLog entry (brokerId, traderId, amount, transactionRef, receiptUrl)
    │   Redis lock released
    │   Admin notified (notification record — every top-up visible in admin oversight)
    │   Trader notified: WebSocket topup:credited + notification record
    │
    └── Exceeds cap → request blocked, zero DB changes
        Broker error: "Rs. X,XX,XXX remaining this week for this trader.
        Weekly limit: Rs. 5,00,000. Contact Admin for override."
```

**Admin top-up override (no cap):**

```
Admin credits any amount to any trader wallet
Required fields: amount + reason (mandatory text) + payment reference
Entire operation logged to AuditLog with adminId — no silent credits ever
```

**Weekly cap implementation:**

```typescript
// shared/utils/topup.ts
// DB is source of truth — NOT Redis TTL
const weekStart = getStartOfWeek(new Date(), "Asia/Kathmandu"); // Monday 00:00 Nepal time
const result = await prisma.topUpRequest.aggregate({
  where: { traderId, status: "COMPLETED", createdAt: { gte: weekStart } },
  _sum: { amountPaise: true },
});
const weeklyTotal = result._sum.amountPaise ?? 0;
const remaining = WEEKLY_TOPUP_CAP_PAISE - weeklyTotal;
```

---

## CONCURRENCY & DATA INTEGRITY

### Wallet Race Condition Prevention

Any operation that reads then writes wallet balance MUST use a Redis distributed lock.
This prevents two simultaneous orders from both passing the balance check and overdrawing.

```typescript
// shared/utils/lock.ts
// Before ANY wallet mutation:
const lock = await acquireLock(`lock:wallet:${userId}`, 5000); // 5s TTL
try {
  // check balance, place order, deduct, etc.
} finally {
  await lock.release();
}
```

Rate limit of 10 orders/minute per user makes this sufficient without DB-level locking.

### Negative Balance Prevention

PostgreSQL CHECK constraint on wallet table. Add as raw SQL in a Prisma migration:

```sql
ALTER TABLE "Wallet"
  ADD CONSTRAINT "wallet_available_balance_non_negative" CHECK ("availableBalance" >= 0),
  ADD CONSTRAINT "wallet_reserved_balance_non_negative" CHECK ("reservedBalance" >= 0);
```

If somehow a bug causes a negative balance attempt, PostgreSQL rejects it at the DB level.
This is a last-resort safety net, not a replacement for application-level validation.

### Order Idempotency

Clients MUST send a unique `X-Idempotency-Key` header (UUID v4) with every POST /orders request.
Server stores `idempotency:{key}` in Redis (TTL 24h) mapped to the resulting orderId.
On duplicate key: return the original order response immediately without re-processing.
This prevents duplicate orders from network retries.

### Wallet Creation Atomicity

User + Wallet + initial Transaction created in single Prisma transaction on registration.
If any part fails, entire registration rolls back. Never leave a User without a Wallet.

---

## ORDER VALIDATION RULES

All enforced in DTO via class-validator before reaching the service layer:

| Field      | Rule                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| quantity   | Integer, min 1, max 100,000 shares per order                           |
| price      | LIMIT only: min 1 paise (Rs. 0.01), max 10,000,000 paise (Rs. 100,000) |
| orderStyle | MARKET orders only accepted when market status = OPEN                  |
| Daily cap  | Max 50 orders per user per day (tracked in Redis, absolute hard cap)   |

```typescript
// In CreateOrderDto:
@IsInt()
@Min(1)
@Max(100000)
quantity: number;

@IsOptional()
@IsInt()
@Min(1)
@Max(10000000)
price?: number; // paise — only for LIMIT orders
```

---

## PAGINATION STRATEGY

**All list endpoints use one of two consistent patterns:**

**Cursor-based** — for time-ordered lists (orders, transactions, notifications, audit logs, top-up history):

```typescript
// Request: GET /orders?cursor=base64value&limit=20
// Response shape (ALL list endpoints return this):
{
  data: [...],
  pagination: {
    nextCursor: "base64encodedcursor", // null if no more pages
    hasMore: true,
    limit: 20
  }
}
```

**Page-based** — for admin management lists (users, brokers, applications, stocks):

```typescript
// Request: GET /admin/users?page=1&limit=20
// Response shape:
{
  data: [...],
  pagination: {
    page: 1,
    totalPages: 14,
    totalCount: 267,
    limit: 20
  }
}
```

`shared/utils/paginate.ts` provides helper functions for both patterns.
Every frontend list component uses the same pagination hook. No ad-hoc implementations.

---

## BACKGROUND JOBS & CRON

All background jobs run via BullMQ. All cron jobs use NestJS `@Cron()` decorator.

### Price Alert Worker

Triggered every time server receives `price:update` from Redis pub/sub:

```
New price arrives for symbol X
        ↓
BullMQ job: process-price-alerts (async, non-blocking)
        ↓
Query WatchlistItem WHERE stockId = X AND priceAlert IS NOT NULL
        ↓
For each item where priceAlert threshold crossed:
  → Create Notification (type: PRICE_ALERT)
  → Send WebSocket notification:new to user
  → Set watchlistItem.priceAlert = null (one-time trigger — user must re-set)
```

### Market Close Cron (18:01 Nepal time daily)

```
@Cron using Asia/Kathmandu timezone, fires at 18:01
        ↓
For every Stock: UPDATE previousClose = currentPrice
        ↓
This ensures next day's circuit breaker uses correct baseline
Without this, circuit breaker calculates % change against stale value
```

### Email Rate Limit

Redis key: `ratelimit:email:{email}` — max 3 emails per hour per address.
Applied to: forgot-password, resend-verification, broker application status updates.
Prevents email bombing abuse.

---

## ENGINE RESILIENCE

### Health Check

Server pings `GET {ENGINE_HTTP_URL}/health` every 5 seconds.
Engine responds: `{ status: "ok", uptime: 123, ordersProcessed: 456 }`

```
Engine health = UP → normal operation
Engine health = DOWN →
  All POST /orders requests return 503 ENGINE_UNAVAILABLE
  Message to client: "Trading is temporarily unavailable. Please try again shortly."
  BullMQ queue continues accumulating jobs (persisted in Redis)
  When engine recovers → server resumes queue consumption automatically
```

### Order Queue Resilience (BullMQ)

- All order jobs persist in Redis — survive engine restarts
- Max 3 retries per failed job with exponential backoff
- Failed after 3 retries → moved to dead letter queue: `queue:orders:failed`
- Admin can view dead letter queue and manually replay jobs
- Market orders get BullMQ priority 1 (processed first)
- Limit orders get BullMQ priority 2

### Engine Restart Recovery

On engine startup, engine reads order book state from Redis sorted sets
(`orderbook:buy:{symbol}` and `orderbook:sell:{symbol}`).
These sets are NOT cleared on engine restart — they persist in Redis.
Engine resumes matching from exactly where it left off.

---

## MULTI-DEVICE SESSION MANAGEMENT

Multiple concurrent sessions supported per user (login on phone + laptop simultaneously).

```
Redis key pattern: refreshtoken:{userId}:{deviceId}
deviceId = UUID v4 generated by client on first login, stored in localStorage

On login:
  Server returns: { accessToken, deviceId }
  Client stores deviceId in localStorage, refresh token in HTTP-only cookie

On refresh:
  Client sends deviceId in header
  Server rotates only THAT device's refresh token
  Other devices unaffected

On logout:
  DELETE refreshtoken:{userId}:{deviceId}
  Only this device's session ends

On "logout all devices" (future feature):
  DELETE all keys matching refreshtoken:{userId}:*
```

Broker and Admin accounts: same pattern but single session enforced.
If broker logs in from new device, previous device session is invalidated.

---

## SOCKET.IO CONNECTION MANAGEMENT

Use a server-side `Map` to track every room each socket has joined.
On disconnect or logout, leave all rooms cleanly — no stale subscriptions.

```typescript
// In WebSocket gateway class:
private userRooms = new Map<string, Set<string>>(); // socketId → Set of room names

handleConnection(socket: Socket) {
  const userId = socket.handshake.auth.userId;
  const room = `user:${userId}`;
  socket.join(room);
  this.trackRoom(socket.id, room);
}

handleDisconnect(socket: Socket) {
  const rooms = this.userRooms.get(socket.id);
  if (rooms) {
    rooms.forEach(room => socket.leave(room));
    this.userRooms.delete(socket.id);
  }
}

@SubscribeMessage('subscribe:stock')
handleSubscribeStock(socket: Socket, { symbol }: { symbol: string }) {
  const room = `stock:${symbol}`;
  socket.join(room);
  this.trackRoom(socket.id, room);
}

@SubscribeMessage('unsubscribe:stock')
handleUnsubscribeStock(socket: Socket, { symbol }: { symbol: string }) {
  const room = `stock:${symbol}`;
  socket.leave(room);
  this.userRooms.get(socket.id)?.delete(room);
}

private trackRoom(socketId: string, room: string) {
  if (!this.userRooms.has(socketId)) {
    this.userRooms.set(socketId, new Set());
  }
  this.userRooms.get(socketId)!.add(room);
}
```

Socket.io transports: `['websocket', 'polling']` — polling fallback for environments
that block WebSocket upgrades (corporate firewalls, some hosting configurations).

---

## REQUIRED ERROR CODES

Every error response includes a `code` field (machine-readable string).
**Frontend MUST switch on `error.response.data.code`, not HTTP status alone.**
HTTP status can be the same for different errors — the `code` disambiguates.

```typescript
// client/src/services/api.ts — example error handling pattern
axios.interceptors.response.use(null, (error) => {
  const code = error.response?.data?.code;
  switch (code) {
    case "WALLET_INSUFFICIENT_FUNDS": // show balance warning
    case "ENGINE_UNAVAILABLE": // show "trading paused" banner
    case "MARKET_CLOSED": // show market hours message
    case "BROKER_SUSPENDED": // show broker contact admin message
    case "RATE_LIMIT_EXCEEDED": // show cooldown timer
    case "DUPLICATE_TRANSACTION_REFERENCE": // show "ref already used" error
    default: // show generic error
  }
});
```

**Complete error code reference — define all of these in `shared/constants/errors.ts`:**

| Code                              | HTTP Status | When                                               |
| --------------------------------- | ----------- | -------------------------------------------------- |
| `WALLET_INSUFFICIENT_FUNDS`       | 400         | Order with insufficient balance                    |
| `WALLET_RESERVED_EXCEED`          | 400         | Cancellation math error (should never happen)      |
| `BROKER_SUSPENDED`                | 403         | Suspended broker attempts /broker/\* action        |
| `BROKER_NOT_ASSIGNED`             | 403         | Broker accesses trader not in their list           |
| `DUPLICATE_TRANSACTION_REFERENCE` | 409         | Same transactionRef used twice by same broker      |
| `ENGINE_UNAVAILABLE`              | 503         | Engine health check failed — orders blocked        |
| `MARKET_CLOSED`                   | 400         | MARKET order placed outside 09:30–18:00 Nepal time |
| `MARKET_STOCK_HALTED`             | 400         | Order on circuit-breaker halted stock              |
| `ORDER_NOT_CANCELLABLE`           | 400         | Cancel on COMPLETED/CANCELLED/REJECTED order       |
| `WEEKLY_CAP_EXCEEDED`             | 400         | Top-up exceeds Rs. 500,000 weekly limit            |
| `ONBOARDING_INCOMPLETE`           | 403         | Trader accesses route before broker selection      |
| `EMAIL_NOT_VERIFIED`              | 403         | Trader accesses route before email verification    |
| `ACCOUNT_SUSPENDED`               | 403         | Suspended user attempts authenticated action       |
| `INVALID_INVITATION_TOKEN`        | 400         | Broker setup link invalid or expired               |
| `INVITATION_ALREADY_USED`         | 400         | Broker setup link already used                     |
| `RATE_LIMIT_EXCEEDED`             | 429         | Any rate limit hit                                 |
| `IDEMPOTENCY_CONFLICT`            | 409         | Idempotency key reused with different payload      |
| `VALIDATION_ERROR`                | 400         | DTO validation failed                              |
| `UNAUTHORIZED`                    | 401         | Missing or invalid JWT                             |
| `FORBIDDEN`                       | 403         | Valid JWT but insufficient role                    |
| `NOT_FOUND`                       | 404         | Resource not found                                 |
| `INTERNAL_ERROR`                  | 500         | Unexpected error (details logged, never exposed)   |

---

## IMPLEMENTATION PATTERNS — REFERENCE THESE WHEN BUILDING

### Idempotency Check (Order placement)

```typescript
// order.service.ts — check BEFORE any processing
async placeOrder(userId: string, dto: CreateOrderDto): Promise<Order> {
  if (dto.idempotencyKey) {
    const cached = await this.redis.get(`idempotency:${dto.idempotencyKey}`);
    if (cached) return JSON.parse(cached); // Return existing response, no reprocessing
  }
  // ... process order ...
  if (dto.idempotencyKey) {
    await this.redis.setex(`idempotency:${dto.idempotencyKey}`, 86400, JSON.stringify(order));
  }
  return order;
}
```

### Duplicate Transaction Reference Handler

```typescript
// broker.service.ts — catch Prisma P2002 unique constraint violation
try {
  await this.prisma.topUpRequest.create({ data: { ... } });
} catch (error) {
  if (error.code === 'P2002' && error.meta?.target?.includes('transactionRef')) {
    throw new ConflictException({
      code: 'DUPLICATE_TRANSACTION_REFERENCE',
      message: 'This payment reference has already been used. Check your top-up history.'
    });
  }
  throw error; // Re-throw unexpected errors to global filter
}
```

### Admin Top-Up DTO (reason + reference are MANDATORY)

```typescript
export class AdminTopUpDto {
  @IsInt()
  @Min(1)
  amountPaise: number;

  @IsString()
  @MinLength(10, { message: "Reason must be at least 10 characters" })
  reason: string; // WHY this override was granted

  @IsString()
  @MinLength(3)
  reference: string; // Payment or case reference number

  @IsString()
  traderId: string;
}
// Missing reason or reference → 400 VALIDATION_ERROR before service is even called
```

### Broker Application — Always 200, Warning if Email Exists (never block)

```typescript
// broker-application.service.ts
async submitApplication(dto: BrokerApplicationDto) {
  const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });

  await this.prisma.brokerApplication.create({
    data: { ...dto, existingUserId: existingUser?.id ?? null, status: 'PENDING' }
  });

  // Always 200 — existing account is informational, never a rejection reason
  return {
    statusCode: 200,
    message: 'Application submitted successfully',
    ...(existingUser && {
      warning: {
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email already exists. Admin will upgrade your existing account if approved.'
      }
    })
  };
}
```

### Email Rate Limit (apply before sending ANY transactional email)

```typescript
// auth.service.ts
async checkEmailRateLimit(email: string): Promise<void> {
  const key = `ratelimit:email:${email}`;
  const attempts = await this.redis.incr(key);
  if (attempts === 1) await this.redis.expire(key, 3600); // 1 hour window
  if (attempts > 3) {
    throw new TooManyRequestsException({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many email requests. Please wait before trying again.'
    });
  }
}
```

### Weekly Cap — DB Aggregation (NEVER Redis TTL)

```typescript
// shared/utils/topup.ts
export async function getWeeklyTopUpTotal(
  prisma: PrismaService,
  traderId: string,
): Promise<number> {
  const weekStart = getStartOfWeek(new Date(), "Asia/Kathmandu");
  const result = await prisma.topUpRequest.aggregate({
    where: { traderId, status: "COMPLETED", createdAt: { gte: weekStart } },
    _sum: { amountPaise: true },
  });
  return result._sum.amountPaise ?? 0;
  // DB is ALWAYS source of truth. Redis TTL gives rolling window, not calendar week.
}
```

---

## BUILD ORDER (FOLLOW THIS EXACTLY)

```
Phase 1 → Build Nebula server + DB + client with MOCK ENGINE
Phase 2 → Stabilise full system end-to-end (all actors, all flows working)
Phase 3 → Replace mock engine with real GBM engine
Phase 4 → Harden and commercialise engine (B2B API product)
```

**Why:** Server defines the engine's contract. Building engine first = guessing.
When Nebula is done, interface is locked. Engine plugs in. Nebula does not notice the swap.

**Mock engine (~30 lines Node.js):**

- Publishes slightly randomised price to Redis every 3 seconds
- Returns `"filled"` immediately for any order received
- Enough to build and test everything: auth, wallet, top-ups, orders, portfolio, WebSocket, charts

---

## FOLDER STRUCTURE (Reference — evolves as development progresses)

```
server/src/
├── modules/
│   ├── auth/              # JWT, Google OAuth, email verify, onboarding, invitations
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.repository.ts
│   │   └── auth.module.ts
│   ├── users/             # Profile management, avatar upload, broker listing
│   ├── broker/            # Broker dashboard, top-up processing, flagging, activity log
│   ├── wallet/            # Balance, reserved funds, transaction ledger, topup-info
│   ├── trading/           # Order placement, cancellation, order history
│   ├── portfolio/         # Holdings, P&L calculations, diversification
│   ├── market/            # Stock data, price history, market status, watchlist
│   ├── learning/          # Learning resources, categories, content delivery
│   ├── ai-assistant/      # Gemini integration, rate limiting, portfolio analysis
│   └── admin/             # Full admin panel — users, brokers, engine, finance, content
├── core/
│   ├── database/
│   │   ├── prisma.service.ts
│   │   └── redis.client.ts
│   ├── filters/
│   │   └── http-exception.filter.ts   # Global exception filter — catches everything
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts
│   │   ├── broker.guard.ts            # Checks isSuspended for broker routes
│   │   └── onboarding.guard.ts        # Checks isOnboardingComplete
│   └── config/
│       └── config.service.ts          # Validates ALL env vars on startup — fail fast
└── shared/
    ├── utils/
    │   ├── currency.ts
    │   ├── pnl.ts
    │   ├── date.ts                    # getStartOfWeek(Asia/Kathmandu), isMarketOpen()
    │   ├── symbol.ts
    │   ├── topup.ts                   # Weekly cap DB aggregation
    │   ├── paginate.ts                # Cursor + page pagination helpers
    │   └── lock.ts                    # Redis distributed lock
    ├── constants/
    │   ├── errors.ts                  # All error codes: WALLET_INSUFFICIENT_FUNDS etc.
    │   └── market.constants.ts        # WEEKLY_CAP, ORDER_MAX_QUANTITY etc.
    └── middleware/

engine/src/
├── core/
│   ├── price-simulator/   # GBM algorithm, Box-Muller, sector volatility
│   ├── order-book/        # Redis sorted sets, price-time priority matching
│   └── circuit-breaker/   # ±10% halt logic, state management
├── market/
│   ├── market-state.ts    # PRE_OPEN / OPEN / HALTED / CLOSED state machine
│   └── stock-registry.ts
└── api/
    ├── ws-gateway.ts      # WebSocket port 3002 — internal only, never public
    ├── http-api.ts        # REST port 3003 — internal only, never public
    └── health.ts          # GET /health endpoint — polled by server every 5s

client/src/
├── pages/                 # Route-level page components
├── components/            # Reusable UI components
├── hooks/                 # React Query data hooks — one per resource
├── stores/                # Zustand — auth token + deviceId + theme ONLY
├── services/              # axios HTTP request functions
└── types/                 # TypeScript interfaces matching server DTOs
```

---

## LEARNING RESOURCES MODULE

- Articles, glossary, guides — Markdown content, managed by Admin
- All content FREE on launch — PREMIUM tier architecture-ready but NOT built in MVP
- `tier` field (FREE | PREMIUM) exists in schema — do NOT block future monetisation
- Seed: 5–10 starter articles covering NEPSE basics, candlestick charts, order types, P&L
- Admin creates and publishes content from admin panel

---

## PRISMA SCHEMA (Reference — fields may change during development)

> Always `npx prisma migrate dev --name <description>` after any schema change.
> Never manually ALTER the database.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ──────────────────────────────────────────────────────────────────

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
  COLLATERAL_TOP_UP
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
  TOP_UP_CREDITED
  BROKER_APPLICATION_APPROVED
  BROKER_APPLICATION_REJECTED
  BROKER_SETUP_LINK_SENT
  ACCOUNT_UPGRADED_TO_BROKER
  ACCOUNT_FLAGGED
  ACCOUNT_SUSPENDED
  BROKER_REASSIGNED
  SYSTEM
}

enum BrokerApplicationStatus {
  PENDING
  APPROVED
  REJECTED
}

enum TopUpStatus {
  COMPLETED
  BLOCKED_BY_CAP
}

enum FlagStatus {
  OPEN
  RESOLVED
  DISMISSED
}

enum ResourceTier {
  FREE
  PREMIUM
}

// ─── Models ─────────────────────────────────────────────────────────────────

model User {
  id                   String    @id @default(cuid())
  email                String    @unique
  password             String?                          // Nullable — Google OAuth users have no password
  userType             UserType  @default(TRADER)
  displayName          String?
  avatarUrl            String?
  phone                String?                          // Required for brokers
  brokerNumber         String?   @unique                // Brokers only — e.g. "BROKER-001"
  isEmailVerified      Boolean   @default(false)
  emailVerifiedAt      DateTime?                        // Set when email verified or OAuth account created
  isOnboardingComplete Boolean   @default(false)        // Traders: false until broker selected
  isSuspended          Boolean   @default(false)
  suspendedReason      String?
  deletedAt            DateTime?                        // Soft delete — never hard delete users
  isFirstLogin         Boolean   @default(true)         // Legacy field — kept for reference
  assignedBrokerId     String?                          // Traders only — FK to broker User
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  wallet               Wallet?
  portfolio            Portfolio?
  orders               Order[]
  watchlistItems       WatchlistItem[]
  notifications        Notification[]
  auditLogs            AuditLog[]
  assignedTraders      User[]           @relation("BrokerTraders")
  assignedBroker       User?            @relation("BrokerTraders", fields: [assignedBrokerId], references: [id])
  processedTopUps      TopUpRequest[]   @relation("BrokerTopUps")
  receivedTopUps       TopUpRequest[]   @relation("TraderTopUps")
  raisedFlags          SuspiciousFlag[] @relation("BrokerFlags")
  flaggedAs            SuspiciousFlag[] @relation("TraderFlags")
  brokerApplication    BrokerApplication?
  brokerInvitations    BrokerInvitation[]

  @@index([email])
  @@index([userType])
  @@index([assignedBrokerId])
  @@index([brokerNumber])
  @@index([deletedAt])               // Queries always filter WHERE deletedAt IS NULL
}

model BrokerApplication {
  id               String                  @id @default(cuid())
  userId           String?                 @unique         // Set when approved and account linked
  fullName         String
  email            String                                  // Required — setup link sent here on approval
  phone            String                                  // Required — unique per application
  dateOfBirth      DateTime
  documentIdNumber String                                  // ID/citizen card/passport number
  documentUrl      String                                  // Cloudinary URL — private folder
  documentPublicId String                                  // Cloudinary public_id for deletion if needed
  reason           String                                  // Why applicant wants to be a broker
  existingUserId   String?                                 // Set if email matches existing User account
  upgradeExisting  Boolean                 @default(false) // Admin decision: upgrade existing vs new account
  status           BrokerApplicationStatus @default(PENDING)
  adminNote        String?                                 // Rejection reason or approval notes
  reviewedAt       DateTime?
  reviewedBy       String?                                 // Admin userId
  createdAt        DateTime                @default(now())

  user User? @relation(fields: [userId], references: [id])

  @@unique([phone])                  // One application per phone number — prevents duplicate submissions
  @@index([status])
  @@index([email])
}

model BrokerInvitation {
  id          String   @id @default(cuid())
  userId      String                         // Admin userId who created the invitation
  email       String                         // Email address invitation was sent to
  brokerNumber String                        // Pre-assigned broker number
  tokenHash   String   @unique               // Hashed token — plain token stored in Redis only
  expiresAt   DateTime
  usedAt      DateTime?                      // Set when broker completes setup — null = unused
  createdAt   DateTime @default(now())

  createdBy User @relation(fields: [userId], references: [id])

  @@index([email])
  @@index([expiresAt])
}

model TopUpRequest {
  id                String      @id @default(cuid())
  traderId          String
  brokerId          String
  amountPaise       Int                                    // Amount in paise
  paymentMethod     String                                 // "eSewa" | "Khalti" | "Bank Transfer" | "QR"
  transactionRef    String                                 // Mandatory — e.g. eSewa transaction ID
  receiptUrl        String                                 // Cloudinary URL — payment receipt (private)
  receiptPublicId   String                                 // Cloudinary public_id
  note              String?
  status            TopUpStatus
  weeklyTotalBefore Int                                    // Weekly total BEFORE this top-up (paise)
  createdAt         DateTime    @default(now())

  trader User @relation("TraderTopUps", fields: [traderId], references: [id])
  broker User @relation("BrokerTopUps", fields: [brokerId], references: [id])

  @@unique([transactionRef, brokerId])   // Same broker cannot reuse a transaction reference
  @@index([traderId, createdAt])
  @@index([brokerId, createdAt])
}

model Wallet {
  id               String   @id @default(cuid())
  userId           String   @unique
  availableBalance Int      @default(5000000)              // Rs. 50,000 in paise
  reservedBalance  Int      @default(0)                    // Locked by pending orders — never goes negative
  totalDeposited   Int      @default(5000000)              // Tracks all credits ever received
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user         User          @relation(fields: [userId], references: [id])
  transactions Transaction[]

  @@index([userId])
  // PostgreSQL CHECK constraints added via raw migration:
  // CHECK ("availableBalance" >= 0)
  // CHECK ("reservedBalance" >= 0)
}

model Transaction {
  id          String          @id @default(cuid())
  walletId    String
  type        TransactionType
  amount      Int                                          // Paise — positive = credit, negative = debit
  description String
  referenceId String?                                      // orderId, tradeId, or topUpRequestId
  createdAt   DateTime        @default(now())

  wallet Wallet @relation(fields: [walletId], references: [id])

  @@index([walletId, createdAt])
  @@index([type, createdAt])
}

model Stock {
  id            String   @id @default(cuid())
  symbol        String   @unique
  companyName   String
  sector        String
  currentPrice  Int                                        // Paise
  previousClose Int                                        // Paise — updated by cron at 18:01 daily
  volatility    Float    @default(0.02)                    // GBM sigma — sector dependent
  drift         Float    @default(0.0001)                  // GBM drift
  isHalted      Boolean  @default(false)
  haltReason    String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  orders         Order[]
  holdings       Holding[]
  watchlistItems WatchlistItem[]
  priceHistory   PriceHistory[]
  trades         Trade[]

  @@index([symbol])
  @@index([sector])
  @@index([isHalted])
}

model Order {
  id              String      @id @default(cuid())
  userId          String
  stockId         String
  type            OrderType
  orderStyle      OrderStyle
  price           Int?                                     // Paise — null for MARKET orders
  quantity        Int                                      // Min 1, max 100,000 — validated in DTO
  filledQuantity  Int         @default(0)
  status          OrderStatus @default(PENDING)
  rejectionReason String?
  idempotencyKey  String?     @unique                      // Client-provided UUID for duplicate prevention
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  user       User    @relation(fields: [userId], references: [id])
  stock      Stock   @relation(fields: [stockId], references: [id])
  buyTrades  Trade[] @relation("BuyOrder")
  sellTrades Trade[] @relation("SellOrder")

  @@index([userId, createdAt])
  @@index([stockId, status])
  @@index([status, createdAt])
}

model Trade {
  id          String   @id @default(cuid())
  buyOrderId  String
  sellOrderId String
  stockId     String
  quantity    Int
  price       Int                                          // Paise — executed price
  createdAt   DateTime @default(now())

  buyOrder  Order @relation("BuyOrder",  fields: [buyOrderId],  references: [id])
  sellOrder Order @relation("SellOrder", fields: [sellOrderId], references: [id])
  stock     Stock @relation(fields: [stockId], references: [id])

  @@index([stockId, createdAt])
  @@index([buyOrderId])
  @@index([sellOrderId])
}

model Portfolio {
  id              String   @id @default(cuid())
  userId          String   @unique
  totalValue      Int      @default(0)                     // Paise — recalculated on demand
  totalInvested   Int      @default(0)                     // Paise
  totalProfitLoss Int      @default(0)                     // Paise — can be negative
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

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
  averageBuyPrice Int                                      // Paise
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  stock     Stock     @relation(fields: [stockId], references: [id])
  portfolio Portfolio @relation(fields: [portfolioId], references: [id])

  @@unique([userId, stockId])
  @@index([userId])
  @@index([portfolioId])
}

model PriceHistory {
  id        String   @id @default(cuid())
  stockId   String
  open      Int                                            // Paise
  high      Int                                            // Paise
  low       Int                                            // Paise
  close     Int                                            // Paise
  volume    BigInt   @default(0)
  interval  String                                         // "1m" | "5m" | "1h" | "1d"
  timestamp DateTime

  stock Stock @relation(fields: [stockId], references: [id])

  @@index([stockId, timestamp])                            // CRITICAL — most-hit index in system
  @@index([stockId, interval, timestamp])                  // Interval-filtered chart queries
}

model WatchlistItem {
  id               String   @id @default(cuid())
  userId           String
  stockId          String
  priceAlert       Int?                                    // Paise — null if no alert; cleared after trigger
  priceAlertActive Boolean  @default(false)               // true when alert is set and waiting to trigger
  createdAt        DateTime @default(now())

  user  User  @relation(fields: [userId], references: [id])
  stock Stock @relation(fields: [stockId], references: [id])

  @@unique([userId, stockId])
  @@index([userId])
  @@index([stockId, priceAlertActive])                    // Price alert worker queries this index
}

model SuspiciousFlag {
  id         String     @id @default(cuid())
  traderId   String
  brokerId   String
  reason     String
  note       String?
  status     FlagStatus @default(OPEN)
  resolvedBy String?                                       // Admin userId
  resolvedAt DateTime?
  resolution String?                                       // Admin's decision note
  createdAt  DateTime   @default(now())

  trader User @relation("TraderFlags", fields: [traderId], references: [id])
  broker User @relation("BrokerFlags", fields: [brokerId], references: [id])

  @@index([traderId])
  @@index([brokerId])
  @@index([status])
}

model Notification {
  id        String           @id @default(cuid())
  userId    String
  type      NotificationType
  title     String
  message   String
  data      Json?                                          // orderId, symbol, topUpId, flagId etc.
  isRead    Boolean          @default(false)
  createdAt DateTime         @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId, isRead])
  @@index([userId, createdAt])
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String?                                        // Null for system/cron events
  action    String                                         // "TOP_UP_CREDITED" | "BROKER_APPROVED" etc.
  ipAddress String?
  userAgent String?
  metadata  Json?                                          // Full context — amounts, targets, references
  createdAt DateTime @default(now())

  user User? @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
  @@index([action, createdAt])
}

model LearningResource {
  id          String       @id @default(cuid())
  title       String
  slug        String       @unique
  category    String                                       // "basics" | "charts" | "strategy" | "glossary"
  tier        ResourceTier @default(FREE)
  content     String                                       // Markdown text
  summary     String                                       // Short description for listing card
  coverImage  String?                                      // Cloudinary URL
  isPublished Boolean      @default(false)
  order       Int          @default(0)                     // Display order within category
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([category, tier])
  @@index([isPublished, tier])
  @@index([slug])
}
```

---

## SQL INDEXING STRATEGY

| Index                                         | Why                                                 |
| --------------------------------------------- | --------------------------------------------------- |
| `User.email`                                  | Every login request hits this                       |
| `User.userType`                               | Admin user list filters by role                     |
| `User.assignedBrokerId`                       | Broker loads their assigned traders list            |
| `User.brokerNumber`                           | Broker lookup during onboarding selection           |
| `User.deletedAt`                              | Every query filters WHERE deletedAt IS NULL         |
| `Stock.symbol`                                | Every order, price update, chart query hits this    |
| `Stock.sector`                                | Market overview groups by sector                    |
| `Stock.isHalted`                              | Circuit breaker fast lookup                         |
| `Order.[userId, createdAt]`                   | Trader order history — paginated                    |
| `Order.[stockId, status]`                     | Engine looks up PENDING orders per stock constantly |
| `Order.[status, createdAt]`                   | Admin order overview filtered by status             |
| `Trade.[stockId, createdAt]`                  | Trade feed per stock, chart aggregation             |
| `Trade.buyOrderId / sellOrderId`              | Order detail shows related trades                   |
| `PriceHistory.[stockId, timestamp]`           | Most-hit index — every chart load                   |
| `PriceHistory.[stockId, interval, timestamp]` | Interval-filtered chart queries (1m, 5m, 1h, 1d)    |
| `Transaction.[walletId, createdAt]`           | Wallet history pagination                           |
| `Transaction.[type, createdAt]`               | Admin financial overview by type                    |
| `TopUpRequest.[traderId, createdAt]`          | Trader top-up history + weekly cap aggregation      |
| `TopUpRequest.[brokerId, createdAt]`          | Broker processed top-up history                     |
| `Notification.[userId, isRead]`               | Unread badge count                                  |
| `Notification.[userId, createdAt]`            | Notification feed                                   |
| `AuditLog.[action, createdAt]`                | Admin audit filter by action type                   |
| `SuspiciousFlag.status`                       | Flag dashboard — filter OPEN flags                  |
| `WatchlistItem.[stockId, priceAlertActive]`   | Price alert worker per-stock query                  |
| `LearningResource.[category, tier]`           | Learning page filter                                |
| `BrokerApplication.[status]`                  | Admin application queue                             |

**Rule:** Never add indexes speculatively. Use `EXPLAIN ANALYZE` on slow queries first.

---

## ENVIRONMENT VARIABLES (Reference)

```bash
# server/.env.development
DATABASE_URL="postgresql://nebula_user:nebula_pass@localhost:5432/nebula_dev"
REDIS_URL="redis://localhost:6379"
JWT_ACCESS_SECRET="replace-with-64-char-random-string"
JWT_ACCESS_EXPIRY="15m"
JWT_REFRESH_SECRET="different-64-char-random-string"
JWT_REFRESH_EXPIRY="7d"
APP_PORT=3001
NODE_ENV="development"
NEPAL_TIMEZONE="Asia/Kathmandu"             # UTC+5:45 — market hours + weekly cap reset
GEMINI_API_KEY=                             # SERVER-SIDE ONLY — never in client
ENGINE_HTTP_URL="http://localhost:3003"
ENGINE_WS_URL="ws://localhost:3002"
ENGINE_HEALTH_CHECK_INTERVAL_MS=5000        # How often server pings engine health
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL="http://localhost:3001/auth/google/callback"
SMTP_HOST="localhost"                       # Mailhog in dev, real SMTP in prod
SMTP_PORT=1025                              # Mailhog port in dev
SMTP_USER=
SMTP_PASS=
SMTP_FROM="noreply@nebula.com"
WEEKLY_TOPUP_CAP_PAISE=50000000             # Rs. 500,000 in paise
CORS_ORIGIN="http://localhost:5173"         # Vite dev server — never use * with credentials

# engine/.env.development
ENGINE_WS_PORT=3002
ENGINE_HTTP_PORT=3003
REDIS_URL="redis://localhost:6379"
MARKET_OPEN_TIME="09:30"                    # Nepal time — Asia/Kathmandu
MARKET_CLOSE_TIME="18:00"                   # Nepal time — Asia/Kathmandu
PRICE_UPDATE_INTERVAL_MS=3000
NEPAL_TIMEZONE="Asia/Kathmandu"

# client/.env.development
VITE_API_URL="http://localhost:3001"
VITE_WS_URL="ws://localhost:3001"
# ❌ NO engine URL — client NEVER connects to engine directly
```

---

## PRODUCTION & LOCALHOST PARITY

The app must work identically in development and production. These rules prevent the
"works on my machine" failure mode.

**1. Environment configuration validation — fail fast**
`ConfigService` reads all env vars on startup, validates with Joi. If any required var
is missing in production, the server REFUSES to start with a clear error message.
Never allow undefined env vars to cause silent runtime failures.

**2. Absolute timezone handling**
Never use `new Date()` for market logic without converting to Asia/Kathmandu.
Use `date-fns-tz` or `moment-timezone` for all market-related operations.
Store all timestamps as UTC in PostgreSQL (default). Convert to Nepal time only for:

- Display formatting
- Market open/close checks
- Weekly cap reset calculation
  Write unit tests that pass when `TZ=UTC` and `TZ=Asia/Kathmandu` are both set.

**3. Email in development — use Mailhog**
Add Mailhog to `docker-compose.yml`. All emails in development go to Mailhog UI (port 8025).
Never send real emails in development. Same code path — different SMTP config only.

**4. File storage — Cloudinary in both dev and prod**
Never use local filesystem for uploads. Use Cloudinary with separate dev/prod folders.
This prevents path bugs that only appear in production.

**5. Same Docker images everywhere**
`docker-compose.yml` uses pinned image tags: `postgres:15-alpine`, `redis:7-alpine`.
Production uses identical versions. No "I used PostgreSQL 14 in dev, 15 in prod" surprises.

**6. Node version pinned**
`.nvmrc` file: `24`. `Dockerfile`: `FROM node:24-alpine`. Everywhere the same.

**7. No hardcoded localhost**
All service URLs come from env vars. Inside Docker Compose, services talk via service names
(`redis`, `postgres`), not `localhost`. Server's `REDIS_URL` in Docker = `redis://redis:6379`.

**8. CORS locked down**
Development: `CORS_ORIGIN=http://localhost:5173`
Production: `CORS_ORIGIN=https://yourdomain.com`
Never use `*` with credentials. CORS misconfiguration is a security vulnerability.

**9. Redis for all rate limiting**
Never use in-memory store for rate limiting — breaks with multiple server instances.
All rate limiting uses Redis. Works identically in dev and prod.

**10. Database migrations are versioned and automated**
Development: `prisma migrate dev`
Production: `prisma migrate deploy` (run as part of deployment script, never manually)

**11. Graceful shutdown**
Server handles `SIGTERM`: drains active requests, closes DB connections, Redis, BullMQ.
Hosting platforms (Render, Railway) send SIGTERM before container replacement.
Without graceful shutdown, in-flight requests are killed mid-execution.

**12. Health check endpoint**
`GET /health` returns:

```json
{ "status": "ok", "db": "connected", "redis": "connected", "engine": "up" }
```

Render/Railway uses this for zero-downtime deployments and automatic restarts.

**13. Winston log levels**
Development: `debug` — verbose, pretty-printed, coloured
Production: `info` — structured JSON, file + console, no debug noise

**14. Socket.io transports**
Both client and server: `transports: ['websocket', 'polling']`
Polling fallback prevents connection failures behind corporate firewalls or restrictive hosting.

**15. Smoke test after every deployment**
Automated: create test trader → verify login → check WebSocket connection → cleanup.
Catches deployment failures before users do.

---

## COMMUNICATION PROTOCOL

| From   | To           | Protocol             | Notes                                                      |
| ------ | ------------ | -------------------- | ---------------------------------------------------------- |
| Client | Server       | HTTP REST            | All business operations                                    |
| Client | Server       | Socket.io            | Receive live prices + notifications (server pushes only)   |
| Server | Engine       | HTTP REST (internal) | Forward orders, admin controls. Port 3003 never public     |
| Engine | Server       | Redis Pub/Sub        | Price updates, fills, circuit breaker events               |
| Server | Modules      | NestJS EventEmitter  | ORDER_FILLED → wallet, TOP_UP_CREDITED → notification      |
| Server | Gemini       | HTTPS REST           | AI queries. API key server-side only                       |
| Server | Cloudinary   | HTTPS REST           | Document + receipt uploads. Signed URLs for private assets |
| Server | Mailhog/SMTP | SMTP                 | Transactional email (verify, invitations, notifications)   |
| Client | Engine       | ❌ BLOCKED           | Frontend NEVER connects to engine directly                 |

---

## API ENDPOINTS (Reference — may evolve during development)

### Auth

| Method | Endpoint                       | Auth   | Description                                              |
| ------ | ------------------------------ | ------ | -------------------------------------------------------- |
| POST   | /auth/register                 | Public | Trader registration — creates user + wallet atomically   |
| POST   | /auth/login                    | Public | All user types — returns JWT pair + deviceId             |
| POST   | /auth/refresh                  | Cookie | Rotate device's refresh token                            |
| POST   | /auth/logout                   | JWT    | Blacklist JWT, clear this device's session               |
| POST   | /auth/verify-email             | Public | Verify email from link token                             |
| POST   | /auth/resend-verification      | Public | Resend verification email (rate limited: 3/hour)         |
| POST   | /auth/forgot-password          | Public | Send password reset email (rate limited: 3/hour)         |
| POST   | /auth/reset-password           | Public | Reset password via token (Redis key, 1h TTL, single-use) |
| PATCH  | /auth/change-password          | JWT    | Change own password (all users)                          |
| GET    | /auth/google                   | Public | Initiate Google OAuth                                    |
| GET    | /auth/google/callback          | Public | Google OAuth callback                                    |
| POST   | /auth/onboarding/select-broker | JWT    | Set assignedBrokerId, isOnboardingComplete = true        |
| POST   | /broker/setup                  | Public | Complete broker account setup via invitation token       |

### Users

| Method | Endpoint       | Auth | Description                                  |
| ------ | -------------- | ---- | -------------------------------------------- |
| GET    | /users/me      | JWT  | Own profile                                  |
| PATCH  | /users/me      | JWT  | Update display name, avatar                  |
| GET    | /users/brokers | JWT  | Active brokers list for onboarding selection |

### Wallet

| Method | Endpoint             | Auth   | Description                                                |
| ------ | -------------------- | ------ | ---------------------------------------------------------- |
| GET    | /wallet/me           | JWT    | Balance, reserved, buying power                            |
| GET    | /wallet/transactions | JWT    | Paginated transaction history (cursor-based)               |
| GET    | /wallet/topup-info   | TRADER | Assigned broker contact + suspension warning if applicable |

### Trading

| Method | Endpoint           | Auth   | Description                                     |
| ------ | ------------------ | ------ | ----------------------------------------------- |
| POST   | /orders            | TRADER | Place order — X-Idempotency-Key header required |
| GET    | /orders            | JWT    | Paginated order history (cursor-based)          |
| PATCH  | /orders/:id/cancel | TRADER | Cancel pending order, release reserved funds    |

### Portfolio

| Method | Endpoint            | Auth   | Description                                 |
| ------ | ------------------- | ------ | ------------------------------------------- |
| GET    | /portfolio/me       | TRADER | Full portfolio with P&L                     |
| GET    | /portfolio/holdings | TRADER | Holdings with quantities and unrealised P&L |

### Market

| Method | Endpoint                       | Auth   | Description                              |
| ------ | ------------------------------ | ------ | ---------------------------------------- |
| GET    | /market/stocks                 | JWT    | All stocks with current prices           |
| GET    | /market/stocks/:symbol         | JWT    | Stock detail, circuit breaker status     |
| GET    | /market/stocks/:symbol/history | JWT    | Price history (?interval=1m\|5m\|1h\|1d) |
| GET    | /market/status                 | Public | OPEN / CLOSED / HALTED                   |

### Watchlist

| Method | Endpoint                  | Auth   | Description                                 |
| ------ | ------------------------- | ------ | ------------------------------------------- |
| POST   | /watchlist                | TRADER | Add stock to watchlist                      |
| DELETE | /watchlist/:stockId       | TRADER | Remove from watchlist                       |
| PATCH  | /watchlist/:stockId/alert | TRADER | Set or clear price alert (one-time trigger) |

### Broker Application (public)

| Method | Endpoint                    | Auth   | Description                           |
| ------ | --------------------------- | ------ | ------------------------------------- |
| POST   | /broker-applications        | Public | Submit application + document upload  |
| GET    | /broker-applications/status | Public | Check own application status by email |

### Broker Dashboard (BROKER only — suspended brokers get 403 on all these)

| Method | Endpoint            | Auth   | Description                                     |
| ------ | ------------------- | ------ | ----------------------------------------------- |
| GET    | /broker/traders     | BROKER | Assigned traders list                           |
| GET    | /broker/traders/:id | BROKER | Full assigned trader profile, portfolio, orders |
| POST   | /broker/topups      | BROKER | Process top-up — receipt upload required        |
| GET    | /broker/topups      | BROKER | Top-up history (cursor-based pagination)        |
| POST   | /broker/flags       | BROKER | Flag assigned trader as suspicious              |
| GET    | /broker/flags       | BROKER | Own flags with resolution status                |
| GET    | /broker/activity    | BROKER | Full broker activity log (cursor-based)         |

### Learning Resources

| Method | Endpoint             | Auth | Description              |
| ------ | -------------------- | ---- | ------------------------ |
| GET    | /learning            | JWT  | Published FREE resources |
| GET    | /learning/:slug      | JWT  | Read single resource     |
| GET    | /learning/categories | JWT  | Category list            |

### AI Assistant

| Method | Endpoint              | Auth   | Description                            |
| ------ | --------------------- | ------ | -------------------------------------- |
| POST   | /ai/ask               | TRADER | Gemini question (2/day, Redis counter) |
| POST   | /ai/analyse-portfolio | TRADER | AI portfolio risk analysis             |

### Admin (ADMIN only)

| Method | Endpoint                               | Auth   | Description                                                    |
| ------ | -------------------------------------- | ------ | -------------------------------------------------------------- |
| GET    | /admin/users                           | ADMIN  | All users with filters (page-based)                            |
| PATCH  | /admin/users/:id/suspend               | ADMIN  | Suspend — cancels pending orders automatically                 |
| PATCH  | /admin/users/:id/unsuspend             | ADMIN  | Unsuspend user                                                 |
| PATCH  | /admin/users/:id/reassign-broker       | ADMIN  | Reassign trader to different broker                            |
| GET    | /admin/broker-applications             | ADMIN  | All applications with status filter                            |
| PATCH  | /admin/broker-applications/:id/approve | ADMIN  | Approve — sends invitation link, creates account               |
| PATCH  | /admin/broker-applications/:id/reject  | ADMIN  | Reject with mandatory reason                                   |
| POST   | /admin/topups                          | ADMIN  | Override cap — credit any amount, reason required              |
| GET    | /admin/topups                          | ADMIN  | Full top-up oversight log                                      |
| GET    | /admin/flags                           | ADMIN  | All suspicious flags with status filter                        |
| PATCH  | /admin/flags/:id/resolve               | ADMIN  | Resolve or dismiss with decision note                          |
| GET    | /admin/transactions                    | ADMIN  | Full transaction log with filters                              |
| GET    | /admin/audit-logs                      | ADMIN  | Full audit log with filters                                    |
| POST   | /admin/engine/start                    | ADMIN  | Start market simulation                                        |
| POST   | /admin/engine/stop                     | ADMIN  | Stop market simulation                                         |
| GET    | /admin/engine/status                   | ADMIN  | Engine health + queue stats                                    |
| GET    | /admin/stocks                          | ADMIN  | All stocks                                                     |
| POST   | /admin/stocks                          | ADMIN  | Add new stock                                                  |
| PATCH  | /admin/stocks/:id                      | ADMIN  | Edit stock details                                             |
| PATCH  | /admin/stocks/:symbol/halt             | ADMIN  | Manually halt stock                                            |
| PATCH  | /admin/stocks/:symbol/unhalt           | ADMIN  | Manually unhalt stock                                          |
| POST   | /admin/learning                        | ADMIN  | Create learning resource                                       |
| PATCH  | /admin/learning/:id                    | ADMIN  | Update resource                                                |
| DELETE | /admin/learning/:id                    | ADMIN  | Delete resource                                                |
| GET    | /admin/overview                        | ADMIN  | Financial overview: top-up volumes, active users, trade counts |
| GET    | /health                                | Public | Server + DB + Redis + engine status                            |

---

## WEBSOCKET EVENTS (Reference)

| Event             | Direction     | Scope               | Payload                                                     |
| ----------------- | ------------- | ------------------- | ----------------------------------------------------------- |
| price:update      | Server→Client | stock:{symbol} room | { symbol, price, changePercent, volume, timestamp }         |
| order:filled      | Server→Client | user:{userId} room  | { orderId, status, executedPrice, quantity, stockSymbol }   |
| order:partial     | Server→Client | user:{userId} room  | { orderId, filledQty, remainingQty }                        |
| portfolio:update  | Server→Client | user:{userId} room  | { totalValue, totalProfitLoss }                             |
| circuit:triggered | Server→Client | broadcast           | { symbol, direction, haltReason, educationalNote }          |
| market:status     | Server→Client | broadcast           | { status: OPEN\|CLOSED\|HALTED, note }                      |
| market:closed     | Server→Client | broadcast           | { note: "Pending LIMIT orders carry over to next session" } |
| notification:new  | Server→Client | user:{userId} room  | { type, title, message, data }                              |
| topup:credited    | Server→Client | user:{userId} room  | { amountPaise, newBalance, brokerId }                       |
| subscribe:stock   | Client→Server | —                   | { symbol } — join price room                                |
| unsubscribe:stock | Client→Server | —                   | { symbol } — leave price room                               |

---

## STANDARD ERROR RESPONSE

```typescript
// Every error in the entire system returns this exact shape — no exceptions
{
  statusCode: 400,
  error:      "BAD_REQUEST",
  message:    "Insufficient wallet balance",    // Human-readable, shown to user
  code:       "WALLET_INSUFFICIENT_FUNDS",      // Machine-readable, used by frontend
  timestamp:  "2025-01-01T09:30:00.000Z"
  // NEVER include: passwords, JWT tokens, stack traces, SQL queries, internal paths
}
```

---

## REDIS KEY STRUCTURE (Reference)

| Key Pattern                        | Purpose                                    | TTL                 |
| ---------------------------------- | ------------------------------------------ | ------------------- |
| `session:{userId}`                 | JWT session data                           | 7 days              |
| `token:blacklist:{jti}`            | Revoked access token                       | 15 min              |
| `refreshtoken:{userId}:{deviceId}` | Device-specific refresh token (hashed)     | 7 days              |
| `email:verify:{token}`             | Email verification token                   | 24 hours            |
| `password:reset:{token}`           | Password reset token (single-use)          | 1 hour              |
| `broker:invite:{token}`            | Broker setup invitation (single-use)       | 48 hours            |
| `ratelimit:email:{email}`          | Email send rate limit                      | 1 hour              |
| `stock:price:{symbol}`             | Latest price cache (paise)                 | 10 seconds          |
| `orderbook:buy:{symbol}`           | Buy order sorted set (price-time priority) | No TTL — persistent |
| `orderbook:sell:{symbol}`          | Sell order sorted set                      | No TTL — persistent |
| `circuit:{symbol}`                 | Circuit breaker active state               | 1 hour              |
| `market:status`                    | OPEN / CLOSED / HALTED                     | No TTL              |
| `lock:wallet:{userId}`             | Distributed lock for wallet mutations      | 5 seconds max       |
| `idempotency:{key}`                | Order idempotency key → orderId            | 24 hours            |
| `ratelimit:auth:{ip}`              | Auth endpoint rate limit                   | 1 min               |
| `ratelimit:orders:{userId}`        | Order rate limit                           | 1 min               |
| `ratelimit:ai:{userId}`            | AI query rate limit                        | 1 day               |
| `ratelimit:public:{ip}`            | Public endpoint rate limit                 | 1 min               |
| `2fa:pending:{userId}`             | (Reserved — 2FA removed from MVP scope)    | —                   |
| `pubsub:prices`                    | Engine → server price broadcast            | N/A                 |
| `pubsub:trades`                    | Engine → server trade fill broadcast       | N/A                 |
| `queue:orders`                     | BullMQ order processing queue              | N/A                 |
| `queue:orders:failed`              | BullMQ dead letter queue                   | N/A                 |
| `queue:price-alerts`               | BullMQ price alert processing queue        | N/A                 |

---

## SECURITY RULES

- JWT access tokens: 15 min expiry, stored in memory only — NOT localStorage
- JWT refresh tokens: 7 days, HTTP-only Secure SameSite=Strict cookie per device
- Token rotation: every `/auth/refresh` invalidates that device's old token
- Blacklisted tokens stored in Redis by `jti` for remaining 15 min window
- Helmet.js on all server responses (14 security headers)
- `ValidationPipe` globally: `whitelist: true` + `forbidNonWhitelisted: true`
- Gemini API key server-side only — never in client code or client `.env`
- Cloudinary uploads: images only (MIME type check), max 5MB, validated server-side before upload
- Broker documents and receipts: private Cloudinary folder, fresh signed URL generated per request — never stored as permanent URL
- Email tokens (verify, reset, invite): stored as hashes in Redis, single-use, deleted after use
- CORS_ORIGIN env var — never `*` with credentials

### Rate Limits

| Endpoint Group              | Limit  | Window     |
| --------------------------- | ------ | ---------- |
| Auth (login/register/reset) | 5 req  | per minute |
| Order placement             | 10 req | per minute |
| AI queries (free tier)      | 2 req  | per day    |
| Public endpoints            | 10 req | per minute |
| Admin endpoints             | 5 req  | per minute |
| Broker top-up processing    | 5 req  | per minute |

---

## MARKET SIMULATION ENGINE RULES

### GBM Formula

```
Next Price = Current Price × exp( (drift - 0.5σ²) × dt + σ × √dt × Z )

drift  = 0.0001
sigma  = IT: 0.03 | Banking: 0.02 | Hydro: 0.015
dt     = PRICE_UPDATE_INTERVAL_MS / trading_day_ms
Z      = Box-Muller transform N(0,1)

Safety clamp: never below Rs.1 (100 paise), never above Rs.10,00,000 (1,000,000,000 paise)
All times in Asia/Kathmandu timezone — NEVER default to server UTC
```

### Circuit Breaker

```typescript
const UPPER_LIMIT = 0.1; // +10% from previousClose
const LOWER_LIMIT = -0.1; // -10% from previousClose
// ALWAYS compare against previousClose — NEVER currentPrice
// previousClose updated by server cron at 18:01 Nepal time daily
const change = (currentPrice - previousClose) / previousClose;
```

### Market State Machine

| State    | Entry                   | Orders                                | Prices       |
| -------- | ----------------------- | ------------------------------------- | ------------ |
| PRE_OPEN | Before 09:30 Nepal time | Accepted, NOT matched                 | None         |
| OPEN     | 09:30 Nepal time        | Matched, circuit breakers active      | GBM every 3s |
| HALTED   | ±10% from previousClose | Paused, no matching                   | Frozen       |
| CLOSED   | 18:00 Nepal time        | MARKET rejected, LIMIT orders persist | None         |

**LIMIT orders when market closes:** Persist in order book (Redis sorted sets survive restart).
Carry over to next trading day. No automatic expiry in MVP.
Server broadcasts `market:closed` WebSocket event with note about pending orders.

### Engine Independence — CRITICAL

Engine ONLY knows: stocks, orders, prices, market state, circuit breakers, order book.
Engine NEVER knows: users, wallets, portfolios, auth, JWT, Prisma, NestJS, brokers, top-ups.

### Zod Validation (Required)

All Redis data MUST be parsed through Zod schemas. Wrap in try-catch.
Reject malformed data and log — never halt the engine process on bad data.

---

## ORDER MATCHING — UNIT TEST ALL SCENARIOS BEFORE ENGINE INTEGRATION

| Scenario                     | Expected Behaviour                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| Full market fill             | Both COMPLETED, Trade record created, quantities match exactly                           |
| Partial fill                 | PARTIALLY_FILLED, remainder PENDING, reservedBalance adjusted                            |
| Multiple matches             | Multiple Trade records, filledQuantity incremented after each                            |
| No counterpart (MARKET)      | REJECTED immediately, wallet NOT reserved                                                |
| Self-trade prevention        | Engine skips own orders, finds next counterparty                                         |
| Cancel PARTIALLY_FILLED      | Unfilled portion released from reservedBalance                                           |
| Circuit breaker block        | REJECTED: MARKET_STOCK_HALTED                                                            |
| Market closed (MARKET order) | REJECTED: MARKET_CLOSED                                                                  |
| Price-time priority          | Same price → earlier createdAt wins                                                      |
| Integer paise math           | 132050 × 7 = 924350 — no floating point error                                            |
| Trader suspended mid-order   | All PENDING/PARTIALLY_FILLED orders cancelled, reservedBalance released, engine notified |
| Engine restart               | Order book reloaded from Redis sorted sets — no order loss                               |

---

## SPRINT ROADMAP (High-Level Reference — do not follow blindly)

> Backend always before frontend. Never build UI for an endpoint that hasn't passed Postman tests.
> Scope may shift. Core 5 MVP (auth, wallet, orders, portfolio, market) is non-negotiable.

### PHASE 1 — Nebula Core with Mock Engine (Sprints 0–6)

| Sprint | Weeks | Deliverable                                                                                                                                                                                                                                                                                                    |
| ------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0**  | 1–2   | **Scaffold** — Monorepo, Docker (PostgreSQL + Redis + Mailhog), NestJS boots, first migration, seed (Admin + 10 NEPSE stocks), ConfigService validates all env vars on startup, mock engine scaffolded (empty entry point only — logic added in Sprint 3)                                                      |
| **1**  | 3–4   | **Trader Auth Backend** — register (user+wallet atomic), email verify, login, JWT + device sessions, refresh rotation, logout, forgot/reset password, Google OAuth (isEmailVerified=true on OAuth), onboarding broker-select endpoint, global exception filter, Helmet, rate limiting                          |
| **2**  | 5–6   | **Auth Frontend + Broker Application Backend** — register/login/verify/onboarding pages, route guards (email + onboarding checks), broker application form + document upload (Cloudinary), duplicate email detection + existingUserId flagging, application status check, Admin notified                       |
| **3**  | 7–8   | **Wallet Backend + Frontend** — balance, transaction history (cursor pagination), topup-info, wallet created atomically on registration, raw SQL migration for CHECK constraints (availableBalance >= 0, reservedBalance >= 0) immediately after Wallet model is created, all mutations in Prisma transactions |
| **4**  | 9–10  | **Market Data + WebSocket** — Socket.io gateway, price:update from Redis pub/sub, stocks list/detail/history, market status, candlestick charts (TradingView), watchlist with price alert input, room cleanup on disconnect                                                                                    |
| **5**  | 11–12 | **Orders Backend + Frontend** — place/cancel, balance reservation, Redis wallet lock, idempotency key, order validation DTO, EventEmitter ORDER_FILLED → wallet, real-time fill notifications, order history (cursor pagination)                                                                               |
| **6**  | 13–14 | **Portfolio Backend + Frontend** — holdings, P&L, portfolio:update WebSocket, previousClose cron at 18:01, price alert BullMQ worker                                                                                                                                                                           |

### PHASE 2 — Broker System (Sprints 7–8)

| Sprint | Weeks | Deliverable                                                                                                                                                                                                                                                                                         |
| ------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **7**  | 15–16 | **Broker Dashboard Backend** — assigned traders, trader detail, top-up processing (DB aggregation weekly cap, Redis lock, receipt upload, transactionRef uniqueness), AuditLog on every action, Admin notified, trader WebSocket notification, flags, activity log, BrokerGuard (isSuspended check) |
| **8**  | 17–18 | **Broker Dashboard Frontend + Broker Application Frontend + Admin Broker Approval** — public broker-apply page (new form fields), existing account detection warning in Admin UI, broker invitation flow (one-time setup link), account upgrade option, broker dashboard all sections               |

### PHASE 3 — Real Engine (Sprints 9–10)

| Sprint | Weeks | Deliverable                                                                                                                                                                                                    |
| ------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **9**  | 19–20 | **Engine Core** — GBM pricing (Nepal timezone), market state machine, order book (Redis sorted sets), basic matching, circuit breaker, health endpoint, Zod validation, all unit tests passing                 |
| **10** | 21–22 | **Engine Advanced + Integration** — partial fills, multiple matches, self-trade prevention, BullMQ priority queue, dead letter queue, engine down → 503 on orders, mock swapped for real engine, full E2E test |

### PHASE 4 — Intelligence & Content (Sprints 11–12)

| Sprint | Weeks | Deliverable                                                                                      |
| ------ | ----- | ------------------------------------------------------------------------------------------------ |
| **11** | 23–24 | **AI Assistant** — Gemini /ai/ask (2/day Redis counter), portfolio analysis, frontend chat panel |
| **12** | 25–26 | **Learning Resources** — Admin CRUD, public list/read, /learn frontend, 5–10 seeded articles     |

### PHASE 5 — Admin Panel (Sprint 13)

| Sprint | Weeks | Deliverable                                                                                                                                                                                                                                                                                                                 |
| ------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **13** | 27–28 | **Full Admin Panel** — broker application review (invitation flow, upgrade option), user management (suspend auto-cancels orders), flag management, top-up override, broker reassignment, stock management, engine controls, financial overview (no "income" — volumes only), audit log viewer, learning content management |

### PHASE 6 — Hardening & Deployment (Sprints 14–15)

| Sprint | Weeks | Deliverable                                                                                                                                                       |
| ------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **14** | 29–30 | **Security Hardening** — OWASP audit, auth pen test, file upload validation, rate limit tuning, Cloudinary access audit, `npm audit` all packages                 |
| **15** | 31–32 | **Production Deployment** — Render/Railway + Vercel + Supabase + Upstash, production migration + seed, CORS production config, smoke test, health checks verified |

### PHASE 7 — Growth Features (Post-MVP, Sprints 16–20)

> Only after Phases 1–6 are live and stable.

| Sprint | Feature                                                                         |
| ------ | ------------------------------------------------------------------------------- |
| 16     | Gamification — leaderboard, badges, trading streaks                             |
| 17     | Engine API product — multi-tenant isolation, API key auth, usage metering (B2B) |
| 18     | Subscription tier — PREMIUM learning content, AI quiz, advanced analytics       |
| 19–20  | Buffer — polish, performance, unexpected scope, post-launch feedback            |

---

## KEY DEVELOPMENT RULES (THESE NEVER CHANGE)

1. **Quality over quantity** — one clean, tested, secure feature beats ten broken ones. This is a real product.
2. **Core 5 MVP first** — auth, wallet, orders, portfolio, market data before anything else
3. **Build Nebula first, engine second** — server defines the engine's contract, not the reverse
4. **Controllers route, services decide, repositories query** — never cross layer boundaries
5. **No try/catch in controllers or services** — throw typed HttpExceptions, global filter catches all
6. **Shared logic in `shared/utils/` only** — never duplicated across modules
7. **All money = integer paise everywhere** — display conversion only at the UI rendering layer
8. **Unit test ALL order matching edge cases** before integrating engine with server
9. **Security from Day 1** — Helmet, rate limiting, JWT rotation, no secrets in frontend, CORS locked
10. **Frontend is UI only** — financial logic in React = stop and move it to the server
11. **Engine knows nothing about Nebula** — no users, wallets, auth, Prisma, NestJS
12. **Every broker action writes to AuditLog** — no silent credits, no untracked mutations
13. **Broker documents = fresh Cloudinary signed URLs per request** — never store permanent URLs
14. **Commit after every completed goal** — small, frequent, descriptive. Never lose a session of work
15. **Nepal timezone for all time-sensitive logic** — market hours + weekly cap reset use Asia/Kathmandu
16. **Never hard delete users** — suspend only. Soft delete (`deletedAt`) if removal is truly needed
17. **Wallet mutations always inside Redis lock + Prisma transaction** — no exceptions, no shortcuts
18. **ConfigService validates all env vars on startup** — server refuses to start with missing config
19. **Email tokens are single-use** — deleted from Redis immediately after use (verify, reset, invite)
20. **Pagination is consistent everywhere** — cursor-based for time-ordered, page-based for admin lists
