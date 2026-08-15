import { useEffect, useState, useRef } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { useAuthStore } from "./stores/authStore";
import { connectSocket } from "./lib/socket";

function App() {
  const { isAuthenticated, login, deviceId } = useAuthStore();
  const [restoring, setRestoring] = useState(true);
  const hasRestoredRef = useRef(false); // ← prevents StrictMode double-fire

  useEffect(() => {
    // StrictMode fires effects twice in development.
    // The second invocation hits this guard and exits immediately.
    if (hasRestoredRef.current) return;

    async function restoreSession() {
      if (isAuthenticated) {
        connectSocket();
        setRestoring(false);
        return;
      }

      try {
        const API_BASE =
          import.meta.env.VITE_API_URL || "http://localhost:3001/api/v1";

        // Step 1: Refresh token via native fetch (bypasses Axios interceptor)
        // X-Requested-With is required by the server as a CSRF guard on
        // this endpoint — see server's auth.controller.ts refresh() docstring.
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({}),
        });

        if (!refreshRes.ok) throw new Error("Refresh failed");

        const refreshData = await refreshRes.json();

        // Step 2: Get user profile with the new access token
        const meRes = await fetch(`${API_BASE}/auth/me`, {
          credentials: "include",
          headers: { Authorization: `Bearer ${refreshData.accessToken}` },
        });

        if (!meRes.ok) throw new Error("Me failed");

        const userData = await meRes.json();

        // Step 3: Store the session
        login(refreshData.accessToken, deviceId || "", userData);
        connectSocket();
      } catch {
        // No valid session — stay logged out
      } finally {
        setRestoring(false);
      }
    }
    restoreSession();
  }, []);

  if (restoring) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
      </div>
    );
  }

  // v7_startTransition is a RouterProvider prop, not part of
  // createBrowserRouter's own future config (unlike v7_relativeSplatPath,
  // which IS router-level and lives in router/index.tsx) — it governs how
  // this Provider instance wraps its own internal state updates.
  return (
    <RouterProvider router={router} future={{ v7_startTransition: true }} />
  );
}

export default App;
