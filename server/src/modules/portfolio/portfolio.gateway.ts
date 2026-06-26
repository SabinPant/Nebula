/**
 * Portfolio WebSocket Gateway
 *
 * Pushes portfolio updates to the authenticated user's room
 * when their portfolio changes (trade settlement, cancellation).
 *
 * Listens for portfolio.changed event via NestJS EventEmitter.
 * Does NOT recalculate on every price tick — only on trade events.
 */

import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';

interface PortfolioChangedPayload {
  userId: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class PortfolioGateway {
  @WebSocketServer()
  server!: Server;

  /**
   * When a trade settles or is cancelled, push a portfolio:update
   * event to the user's room so the frontend can refresh.
   */
  @OnEvent('portfolio.changed')
  handlePortfolioChanged(payload: PortfolioChangedPayload): void {
    this.server.to(`user:${payload.userId}`).emit('portfolio:update', {
      timestamp: new Date().toISOString(),
    });
  }
}