# Nebula

**Virtual Stock Trading & Learning Platform**

Nebula simulates Nepal's stock market with real price dynamics, giving users a risk-free environment to learn trading. Start with Rs. 50,000 in virtual funds, trade stocks powered by a custom market simulation engine, and receive AI coaching — all without risking a single rupee.

---

## Features

- **Virtual Trading** — Buy and sell stocks with Rs. 50,000 virtual starting balance
- **Real-Time Market Simulation** — Custom Geometric Brownian Motion engine generates realistic price movements every 3 seconds
- **Live Charts** — TradingView-powered candlestick and line charts with real-time WebSocket updates
- **AI Coaching** — Gemini-powered assistant for portfolio analysis and trading guidance
- **Broker System** — Verified brokers monitor traders, process collateral top-ups
- **Multi-Device Sessions** — Login on multiple devices with independent refresh token rotation
- **Google OAuth** — Sign in with your Google account
- **Watchlist** — Track stocks with one-time price alerts

---

## Tech Stack

| Layer             | Technology                               |
| ----------------- | ---------------------------------------- |
| **Backend**       | NestJS, TypeScript, Prisma ORM           |
| **Database**      | PostgreSQL                               |
| **Cache & Queue** | Redis, BullMQ                            |
| **Real-Time**     | Socket.IO                                |
| **Frontend**      | React 18, Vite, Tailwind CSS             |
| **Charts**        | TradingView Lightweight Charts, Recharts |
| **Auth**          | Passport.js — JWT + Google OAuth 2.0     |
| **Email**         | Nodemailer + Mailhog (dev)               |
| **File Storage**  | Cloudinary                               |
| **AI**            | Google Gemini API                        |
| **Logging**       | Winston                                  |
| **CI/CD**         | GitHub Actions                           |

---

## Architecture

```
Nebula/
├── client/   # React (Vite + TypeScript) — UI only, zero business logic
├── server/   # NestJS + Prisma + PostgreSQL + Redis — all business logic
└── engine/   # Market Simulation Engine — fully independent, GBM pricing
```

The engine is a standalone Node.js process. It knows nothing about users, wallets, or auth — only stocks, prices, and Redis pub/sub.

```
Engine → Redis pub/sub → Server Gateway → Socket.IO → Client
```

---

## Getting Started

### Prerequisites

- Node.js v24+
- Docker & Docker Compose
- npm v11+

### Setup

```bash
# Clone the repository
git clone https://github.com/Sabinpabt23/Nebula.git
cd Nebula

# Start PostgreSQL, Redis, and Mailhog
docker compose up -d

# Install dependencies
npm install

# Set up environment variables
cp server/.env.example server/.env.development
cp client/.env.example client/.env.development
cp engine/.env.example engine/.env.development

# Run database migrations and seed
cd server
npx prisma migrate dev
npx prisma db seed
cd ..

# Start the server, engine, and client
npm run dev:server   # http://localhost:3001
npm run dev:engine   # Background simulation
npm run dev:client   # http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Actors

| Actor      | Description                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| **Trader** | Registered user with Rs. 50,000 virtual balance. Can buy/sell stocks, view portfolio, use AI coaching. |
| **Broker** | Verified professional approved by Admin. Monitors assigned traders and processes collateral top-ups.   |
| **Admin**  | Platform owner. Manages users, brokers, stocks, engine controls, and audit logs.                       |

---

## Project Status

Nebula is under active development. Core features are functional — auth, trading, market data, live charts, wallet, broker applications, and the simulation engine are all operational.

---
