/**
 * Trader Dashboard (Placeholder)
 *
 * Minimal welcome page shown after login and onboarding.
 * Real dashboard content — portfolio summary, watchlist, market overview —
 * will be built in Sprints 3–6 as each backend module is completed.
 */

import { useAuthStore } from "../../stores/authStore";

export function Dashboard() {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-primary-900">Nebula</span>
          <span className="text-sm text-gray-500">
            {user?.displayName || user?.email}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome{user?.displayName ? `, ${user.displayName}` : ""}!
        </h1>
        <p className="mt-2 text-gray-500">
          Your dashboard will be built in upcoming sprints. For now, you're all
          set up and ready to trade.
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
