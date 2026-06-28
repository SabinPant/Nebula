import { useState, useEffect } from "react";
import { useAuthStore } from "../../stores/authStore";
import { NebulaIndexChart } from "../../components/market/NebulaIndexChart";
import { Card } from "../../components/ui/Card";
import api from "../../services/api";

interface UserStats {
  holdingsCount: number;
  ordersCount: number;
}

export function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [portfolioRes, ordersRes] = await Promise.all([
          api.get("/portfolio/me"),
          api.get("/orders?page=1&limit=1"),
        ]);
        setStats({
          holdingsCount: portfolioRes.data.summary?.holdingsCount ?? 0,
          ordersCount: ordersRes.data.pagination?.totalCount ?? 0,
        });
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <h1 className="text-2xl font-bold text-gray-900">
        Welcome{user?.displayName ? `, ${user.displayName}` : ""}!
      </h1>
      <p className="mt-2 text-gray-500">Your virtual trading dashboard</p>

      {/* User Info Cards */}
      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <p className="text-sm text-gray-500">Email</p>
          <p className="text-base font-medium text-gray-900 mt-1 truncate">
            {user?.email ?? "—"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Account Type</p>
          <p className="text-base font-medium text-gray-900 mt-1">
            {user?.userType === "TRADER" ? "Trader" : (user?.userType ?? "—")}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Holdings</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {loading ? "—" : (stats?.holdingsCount ?? "—")}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Total Orders</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {loading ? "—" : (stats?.ordersCount ?? "—")}
          </p>
        </Card>
      </div>

      {/* Nebula Index Chart */}
      <div className="mt-6">
        <Card title="Nebula Index">
          <NebulaIndexChart height={250} showDetails />
        </Card>
      </div>
    </div>
  );
}
