/**
 * Auth Store (Zustand)
 *
 * UI state only — access token, device ID, and user info.
 * Never contains business logic or server state (that's React Query).
 *
 * The access token is stored in memory, not localStorage.
 * On page refresh, the token is lost — the refresh interceptor
 * in api.ts silently fetches a new one via the HTTP-only cookie.
 */

import { create } from 'zustand';
import { disconnectSocket } from '../lib/socket';

interface User {
  id: string;
  email: string;
  displayName: string;
  userType: 'TRADER' | 'BROKER' | 'ADMIN';
  isOnboardingComplete: boolean;
}

interface AuthState {
  accessToken: string | null;
  deviceId: string | null;
  user: User | null;
  isAuthenticated: boolean;

  setAccessToken: (token: string) => void;
  setDeviceId: (id: string) => void;
  setUser: (user: User) => void;
  login: (accessToken: string, deviceId: string, user: User) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  deviceId: localStorage.getItem('nebula_deviceId'),
  user: null,
  isAuthenticated: false,

  setAccessToken: (token) =>
    set({ accessToken: token, isAuthenticated: true }),

  setDeviceId: (id) => {
    localStorage.setItem('nebula_deviceId', id);
    set({ deviceId: id });
  },

  setUser: (user) => set({ user }),

 login: (accessToken, deviceId, user) => {
  const id = deviceId || crypto.randomUUID();
  localStorage.setItem('nebula_deviceId', id);
  set({ accessToken, deviceId: id, user, isAuthenticated: true });
},

    clearAuth: () => {
      disconnectSocket();
    localStorage.removeItem('nebula_deviceId');
    set({
      accessToken: null,
      deviceId: null,
      user: null,
      isAuthenticated: false,
    });
  },
}));