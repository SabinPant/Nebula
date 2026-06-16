/**
 * Socket.IO Client Singleton
 *
 * Single WebSocket connection shared across all components.
 * Auto-connects after authentication. Components join/leave
 * rooms via subscribe:stock / unsubscribe:stock events.
 *
 * Reconnection: On reconnect, the component re-joins rooms
 * based on the stocks it's currently viewing.
 */

import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

export const socket: Socket = io(WS_URL, {
  withCredentials: true,
  autoConnect: false,
  transports: ['websocket', 'polling'],
});

/**
 * Connects the socket. Call after authentication is established.
 */
export function connectSocket(): void {
  if (!socket.connected) {
    socket.connect();
  }
}

/**
 * Disconnects the socket. Call on logout.
 */
export function disconnectSocket(): void {
  if (socket.connected) {
    socket.disconnect();
  }
}