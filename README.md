<div align="center">

<img src="https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white"/>
<img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white"/>
<img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black"/>
<img src="https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white"/>
<img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white"/>
<img src="https://img.shields.io/badge/Prisma-5-2D3748?style=for-the-badge&logo=prisma&logoColor=white"/>
<img src="https://img.shields.io/badge/Socket.IO-4-010101?style=for-the-badge&logo=socketdotio&logoColor=white"/>
<img src="https://img.shields.io/badge/Node.js-24-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"/>

<br/><br/>

# Nebula — Virtual Stock Trading & Learning Platform

**A virtual stock trading and market-education platform built on NestJS and React — combining a custom real-time market simulation engine, broker-mediated collateral management, and full administrative oversight, all under strict layered architecture.**

</div>

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Setup Guide](#setup-guide)
- [Default Credentials](#default-credentials)
- [Developer Notes](#developer-notes)

---

## Tech Stack

| Layer                  | Technology                                                 |
| ---------------------- | ---------------------------------------------------------- |
| **Runtime**            | Node.js 24                                                 |
| **Backend Framework**  | NestJS 10, TypeScript 5                                    |
| **Database**           | PostgreSQL 15 via Prisma ORM                               |
| **Cache / Queue**      | Redis 7, BullMQ                                            |
| **Real-Time**          | Socket.IO (NestJS Gateway)                                 |
| **Frontend**           | React 18, Vite, TypeScript                                 |
| **Styling**            | Tailwind CSS                                               |
| **Charts**             | TradingView Lightweight Charts, Recharts                   |
| **Client State**       | Zustand (UI state), React Query (server state)             |
| **Authentication**     | Passport.js — JWT + Google OAuth 2.0                       |
| **Validation**         | class-validator / class-transformer (server), Zod (engine) |
| **AI Integration**     | Google Gemini API                                          |
| **File Storage**       | Cloudinary                                                 |
| **Email**              | Nodemailer (SMTP), Mailhog in development                  |
| **Logging**            | Winston                                                    |
| **Password Hashing**   | bcrypt                                                     |
| **Testing**            | Jest, Supertest, custom HTTP/Redis integration scripts     |
| **Package Management** | npm workspaces (monorepo)                                  |
| **CI**                 | GitHub Actions                                             |

---

## Features

<details>
<summary><b>Authentication &amp; Authorization</b></summary>

- Email and password registration with atomic user and wallet creation
- Google OAuth 2.0 registration and login, with implicit email verification
- Email verification and password reset via single-use, Redis-backed tokens
- Short-lived JWT access tokens (15 minutes) held in memory only, never in local storage
- Long-lived refresh tokens (7 days) delivered as HTTP-only cookies, rotated on every use
- Refresh token reuse detection — a token presented after it has already been rotated invalidates every active session for that account, on the assumption of theft
- Multi-device session management — each device holds an independent refresh token that can be revoked without affecting other sessions
- Access token blacklisting on logout, checked before any database lookup
- Onboarding flow requiring traders to select an assigned broker before the platform becomes accessible
- Role-based route guards for Trader, Broker, and Admin account types
- CSRF protection on the token-refresh endpoint via a required custom header, in addition to the Bearer-token model used everywhere else
- Redis-backed rate limiting on every authentication endpoint, tuned independently per route

</details>

<details>
<summary><b>Trader Portal</b></summary>

- Wallet automatically created at registration with a virtual starting balance
- Market and Limit order placement, with idempotency-key support to prevent duplicate submissions from network retries
- Live order book depth ladder showing aggregated bid and ask volume by price level
- Order history with cancellation of pending orders and automatic release of reserved funds
- Portfolio view with holdings, average cost basis, and unrealized profit and loss
- Watchlist with one-time price alerts that clear automatically once triggered
- Wallet transaction ledger with cursor-based pagination
- Collateral top-up requests routed through the trader's assigned broker
- Learning resource access for platform-provided educational content

</details>

<details>
<summary><b>Broker Dashboard</b></summary>

- List of assigned traders with wallet balances and order activity summaries
- Individual trader detail view — portfolio, holdings, and recent order history
- Collateral top-up processing with a weekly cap enforced through database aggregation, not a cache-based counter
- Mandatory transaction reference and receipt upload per top-up, with duplicate-reference prevention per broker
- Suspicious activity flagging on assigned traders, with reason and resolution tracking
- Complete activity log of every action the broker has taken

</details>

<details>
<summary><b>Admin Panel</b></summary>

- Platform-wide dashboard — statistics, a composite market index chart, and a recent activity feed
- User management with search, filtering, and suspend or unsuspend actions (soft state changes only, no hard deletion)
- Suspending a user automatically cancels their pending orders and releases any reserved balance
- Broker application review — approval issues an invitation-based account setup link, or upgrades an existing trader account; rejection requires a recorded reason
- Reassignment of a trader to a different broker at any time
- Top-up oversight across every broker and trader, with the ability to override the weekly cap directly, subject to a mandatory reason and reference
- Suspicious flag review, resolution, and dismissal with a recorded decision note
- Learning resource content management — create, edit, publish, unpublish, and delete
- System-wide audit log with action-based filtering
- Read-only market engine status — health, database and cache connectivity, and last-checked timestamp

</details>

<details>
<summary><b>Market Simulation Engine</b></summary>

- Price simulation using Geometric Brownian Motion with sector-specific volatility and drift
- Box-Muller transform for normally distributed random price movement
- Circuit breaker halting a stock's trading when price moves beyond ten percent of the previous close in either direction
- Order book maintained in Redis sorted sets with price-time priority
- Matching engine with self-trade prevention and partial-fill handling
- Explicit market state machine — pre-open, open, halted, and closed
- HTTP health endpoint polled continuously by the server, gating order placement when unreachable
- Complete independence from the rest of the platform — no Prisma, no NestJS, no PostgreSQL, and no knowledge of users, wallets, or authentication; all communication with the server passes through Redis

</details>

<details>
<summary><b>Learning Resources</b></summary>

- Markdown-authored articles rendered on the client
- Category-based organization with independent published and unpublished states
- Free and Premium tier classification, with Premium reserved for future use
- Full content lifecycle managed from the Admin Panel

</details>

_The list above covers primary functionality. Additional operational detail exists within each module beyond what is itemized here._

---

## Architecture

Nebula is split into three independently deployable processes, each with a single, non-overlapping responsibility.

```
Client (React SPA)
    |
    |  HTTPS (REST) + WSS (Socket.IO)
    v
Server (NestJS)  <---- Prisma ---->  PostgreSQL
    |             <---- ioredis --->  Redis
    |
    |  HTTP (health checks) + Redis Pub/Sub (orders, fills, prices)
    v
Engine (standalone Node.js process)
```

The client never communicates with the engine directly. Every trading action, price update, and notification passes through the server, which is the sole authority on business rules, financial state, and access control.

### Layer Separation

The server enforces a strict four-layer separation within every module:

| Layer          | Owns                                                        | Never Owns                                    |
| -------------- | ----------------------------------------------------------- | --------------------------------------------- |
| **Controller** | HTTP routing, request and response shape                    | Business logic, database access, calculations |
| **Service**    | All business logic, rule enforcement, orchestration         | Raw Prisma queries, raw Redis operations      |
| **Repository** | Prisma queries and Redis reads/writes, returning plain data | Business logic, response formatting           |
| **DTO**        | Request shape validation via class-validator                | Domain logic, database queries                |

A single global exception filter is the only place in the server that formats an error response. Services throw typed exceptions; nothing else constructs an error payload by hand.

### Communication

| From   | To     | Protocol      | Purpose                                                     |
| ------ | ------ | ------------- | ----------------------------------------------------------- |
| Client | Server | HTTP REST     | All business operations                                     |
| Client | Server | Socket.IO     | Live price updates and notifications, server-initiated only |
| Server | Engine | HTTP          | Health checks                                               |
| Engine | Server | Redis Pub/Sub | Price ticks, order fills, circuit breaker events            |
| Server | Engine | Redis Pub/Sub | New order submissions, cancellations                        |
| Client | Engine | —             | No direct connection under any circumstance                 |

### Data Model

The schema is organized around four concerns:

- **Identity and access** — `User`, `BrokerApplication`, `BrokerInvitation`
- **Financial** — `Wallet`, `Transaction`, `TopUpRequest`
- **Trading** — `Stock`, `Order`, `Trade`, `Portfolio`, `Holding`, `PriceHistory`, `WatchlistItem`
- **Oversight and content** — `SuspiciousFlag`, `Notification`, `AuditLog`, `LearningResource`

All monetary columns are stored as integer paise. The full schema, including indexes and constraints, is defined in `server/prisma/schema.prisma`.

---

## Project Structure

```
Nebula/
│
├── client/                          # React (Vite + TypeScript) frontend
│   └── src/
│       ├── pages/                   # Route-level pages (admin/, broker/, trader/, market/)
│       ├── components/              # Reusable UI (layout/, ui/, market/)
│       ├── hooks/                   # React Query data hooks
│       ├── stores/                  # Zustand stores — auth token, device ID, theme only
│       ├── services/                # Axios HTTP client and interceptors
│       ├── router/                  # Route definitions and role-based guards
│       ├── lib/                     # Client-side helpers (formatting, socket connection)
│       └── types/                   # TypeScript interfaces matching server DTOs
│
├── server/                          # NestJS backend — all business logic
│   └── src/
│       ├── modules/
│       │   ├── auth/                # JWT, Google OAuth, onboarding, sessions
│       │   ├── broker/              # Applications, dashboard, top-ups, flags
│       │   ├── wallet/              # Balance, reserved funds, transaction ledger
│       │   ├── trading/             # Order placement, cancellation, engine integration
│       │   ├── portfolio/           # Holdings and profit/loss calculation
│       │   ├── market/              # Stock data, price history, watchlist, order book reads
│       │   ├── learning/            # Learning resource content delivery and management
│       │   └── admin/               # Administrative panel — composes the modules above
│       ├── core/
│       │   ├── database/            # PrismaService, RedisClient
│       │   ├── filters/             # Global exception filter
│       │   ├── guards/              # Rate-limiting guard
│       │   └── config/              # Environment validation, rate limit definitions
│       └── shared/
│           ├── utils/               # Currency, pagination, locking, tokens, cookies
│           ├── constants/           # Error codes, market constants
│           └── services/            # Email, Cloudinary
│
├── engine/                          # Market Simulation Engine — fully independent
│   └── src/
│       ├── order-book.ts            # Redis-backed order book, price-time priority
│       ├── matching-engine.ts       # Order matching, self-trade prevention
│       └── index.ts                 # Price simulation loop, Redis pub/sub wiring
│
├── docker-compose.yml                # PostgreSQL, Redis, Mailhog
└── package.json                      # npm workspace root
```

Each module under `server/src/modules/` follows the same internal shape: a controller, a service, a repository, a module definition, and a `dto/` directory. `server/scripts/` and `engine/scripts/` contain integration test scripts, described under Developer Notes.

---

## Setup Guide

### Prerequisites

| Tool    | Version | Purpose                                                      |
| ------- | ------- | ------------------------------------------------------------ |
| Node.js | 24.x    | Runtime for the server, client, and engine                   |
| npm     | 11.x    | Workspace-aware dependency management (bundled with Node 24) |
| Docker  | Latest  | PostgreSQL, Redis, and Mailhog containers                    |
| Git     | Latest  | Version control                                              |

Any editor with TypeScript support is sufficient — the project has no IDE-specific configuration.

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/SabinPant/Nebula.git
cd Nebula
```

---

### Step 2 — Install Dependencies

```bash
npm install
```

This is an npm workspace — a single install at the repository root resolves dependencies for `server/`, `client/`, and `engine/` together.

---

### Step 3 — Start Infrastructure Services

```bash
docker compose up -d
```

Starts PostgreSQL 15, Redis 7, and Mailhog (local SMTP capture, viewable at `http://localhost:8025`) as defined in `docker-compose.yml`.

---

### Step 4 — Configure Environment Variables

Each package has its own environment file. Copy the example file for each:

```bash
cp server/.env.example server/.env.development
cp client/.env.example client/.env.development
cp engine/.env.example engine/.env.development
```

`server/.env.development` requires, at minimum: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (each at least 64 characters), `CORS_ORIGIN`, and `FRONTEND_URL`. Environment variables are validated on server startup — the server refuses to boot if a required value is missing.

---

### Step 5 — Run Database Migrations

```bash
cd server
npx prisma migrate dev
```

---

### Step 6 — Seed the Database

```bash
npx prisma db seed
```

Creates the default administrator account and the initial set of tradable stocks.

---

### Step 7 — Start the Server

From the repository root:

```bash
npm run dev:server
```

The API becomes available at `http://localhost:3001/api/v1`.

---

### Step 8 — Start the Client

```bash
npm run dev:client
```

The application becomes available at `http://localhost:5173`.

---

### Step 9 — Start the Engine

```bash
npm run dev:engine
```

The engine begins publishing simulated price ticks and processing the order book. Its HTTP health endpoint listens on port 3003 and its WebSocket interface on port 3002 — neither is intended to be reachable from outside the server.

> All three processes must be running for full functionality. The server and client operate independently of the engine, but order placement returns a 503 (Engine Unavailable) response until the engine is reachable.

---

## Default Credentials

| Role       | Email                     | Password       | Notes                                                                                                       |
| ---------- | ------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| **Admin**  | `admin@nebula.com`        | `ChangeMe123!` | Seeded automatically. There is no administrator registration endpoint — this is the only admin account.     |
| **Trader** | Register via `/register`  | —              | Requires email verification and broker selection before the dashboard becomes accessible.                   |
| **Broker** | Apply via `/broker-apply` | —              | Requires administrator approval. Account setup completes through an emailed invitation link after approval. |

All three roles authenticate through the same `/login` form. The application redirects to the appropriate dashboard — `/dashboard`, `/broker`, or `/admin` — based on account type after authentication.

> Change the default administrator password in any environment beyond local development.
>
> Broker accounts require administrator approval before login is possible. Check the Admin Panel's Broker Applications section after a new application is submitted.

---

## Developer Notes

**Layer Discipline**
Controllers handle HTTP routing exclusively — no business logic, no direct database calls. All business logic and rule enforcement live in the service layer. All Prisma queries and Redis operations live in the repository layer. Services never call Prisma directly; repositories never contain business logic. These boundaries are enforced consistently across every module.

**Money Handling**
Every monetary value is stored and calculated as an integer number of paise (one Rupee equals one hundred paise). Floating-point arithmetic is never used for financial data. Conversion to Rupees for display happens exclusively at the presentation layer.

**Wallet Concurrency**
Any operation that reads a wallet balance and then writes to it acquires a Redis distributed lock before the read, and the mutation itself runs inside a Prisma transaction. This prevents two concurrent order placements, or a top-up and an order landing simultaneously, from both evaluating a stale balance. A PostgreSQL CHECK constraint on the wallet table is a last-resort backstop against negative balances, independent of application logic.

**Idempotency**
Order placement requires a client-supplied `X-Idempotency-Key` header. The server stores the resulting response in Redis, keyed by that value, for twenty-four hours — a repeated request with the same key returns the original response without reprocessing.

**Rate Limiting**
Every endpoint group has an explicit limit backed by Redis, never in-memory storage, so limits hold consistently across multiple server instances. Limits are tuned per route rather than applied uniformly — authentication and financial endpoints are the most restrictive, while token-refresh traffic is deliberately given a wide allowance so it does not interfere with legitimate multi-device or multi-tab usage.

**Engine Independence**
The market simulation engine has no dependency on Prisma, NestJS, or PostgreSQL, and no knowledge of users, wallets, authentication, or brokers. Its only shared infrastructure with the server is Redis, used exclusively as a publish/subscribe message bus and as the order book's backing store. This separation allows the engine to be deployed, scaled, or replaced independently of the rest of the platform.

**Error Handling**
Every error response follows one fixed shape — `statusCode`, `error`, `message`, and a machine-readable `code` field. The client branches on `code`, never on HTTP status alone, since distinct error conditions can share the same status. A single global exception filter is the only place in the server that constructs an error response.

**Testing**
Scripts under `server/scripts/` and `engine/scripts/` are integration tests, not unit tests — they drive the real running server or engine through its actual HTTP, WebSocket, or Redis interface, using real signed tokens and real database writes, then clean up their own fixtures on both entry and exit so they can be re-run safely. This is used alongside standard Jest coverage.

**WebSocket Events**
Real-time updates are delivered through room-scoped Socket.IO events — price updates to stock-specific rooms, order fills and portfolio changes to user-specific rooms, circuit breaker and market status events broadcast platform-wide. Room membership is tracked server-side and cleared explicitly on disconnect.

**Authentication**
Access tokens are short-lived and held in memory only. Refresh tokens live in an HTTP-only cookie, rotate on every use, and are tracked per device so a single device's session can be revoked independently. A refresh token presented after it has already been rotated is treated as a signal of possible theft and invalidates every session on the account.

**File Storage**
Broker verification documents and top-up receipts are stored in Cloudinary under a private folder — never on local disk, never with a permanently public URL. Access is granted through a freshly signed URL generated per request.

---

<div align="center">

Built for accessible market education by Sabin Pant

</div>
