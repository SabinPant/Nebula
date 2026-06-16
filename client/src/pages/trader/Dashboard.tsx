import { useAuthStore } from "../../stores/authStore";
import { Link } from "react-router-dom";
import { disconnectSocket } from "../../lib/socket";
import api from "../../services/api";

export function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  async function handleLogout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    } finally {
      clearAuth();
    }
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <span className="text-xl font-bold text-primary-900">Nebula</span>
            <Link
              to="/dashboard"
              className="text-sm text-primary-700 font-medium"
            >
              Dashboard
            </Link>
            <Link
              to="/market"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Market
            </Link>
            <Link
              to="/wallet"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Wallet
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">
              {user?.displayName || user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome{user?.displayName ? `, ${user.displayName}` : ""}!
        </h1>
        <p className="mt-2 text-gray-500">
          Your dashboard will be built in upcoming sprints.
        </p>

        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <p className="text-sm text-gray-400">Virtual Balance</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              Rs. 50,000.00
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <p className="text-sm text-gray-400">Portfolio Value</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">—</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <p className="text-sm text-gray-400">Profit / Loss</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">—</p>
          </div>
        </div>
      </main>
    </div>
  );
}
