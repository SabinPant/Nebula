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
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
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

  return <RouterProvider router={router} />;
}

export default App;
