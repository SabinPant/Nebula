/**
 * Portfolio WebSocket Gateway
 *
 * Pushes portfolio updates to the authenticated user's room
 * when their portfolio changes (trade settlement, cancellation).
 *
 * Clients must emit subscribe:portfolio to join their user room.
 * The gateway then listens for portfolio.changed events via EventEmitter
 * and emits portfolio:update to the user's room.
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
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
   * Client requests to receive portfolio updates.
   * Joins the socket to their user room so portfolio:update events reach them.
   */
  @SubscribeMessage('subscribe:portfolio')
  handleSubscribePortfolio(client: Socket): void {
    const userId = client.handshake.auth?.userId;
    if (userId) {
      client.join(`user:${userId}`);
    }
  }

  /**
   * Client requests to stop receiving portfolio updates.
   * Leaves the user room.
   */
  @SubscribeMessage('unsubscribe:portfolio')
  handleUnsubscribePortfolio(client: Socket): void {
    const userId = client.handshake.auth?.userId;
    if (userId) {
      client.leave(`user:${userId}`);
    }
  }

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