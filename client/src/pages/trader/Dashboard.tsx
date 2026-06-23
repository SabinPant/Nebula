import { useState, useEffect } from "react";
import { useAuthStore } from "../../stores/authStore";
import { NebulaIndexChart } from "../../components/market/NebulaIndexChart";
import { Card } from "../../components/ui/Card";
import api from "../../services/api";
import { formatPaise } from "../../lib/utils";

interface WalletSummary {
  availableBalance: number;
  reservedBalance: number;
  displayBalance: string;
}

export function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWallet() {
      try {
        const { data } = await api.get("/wallet");
        setWallet(data);
      } catch {
        // Silently fail — show fallback values
      } finally {
        setLoading(false);
      }
    }
    fetchWallet();
  }, []);

  const balance = wallet?.availableBalance ?? 5_000_000;
  const reserved = wallet?.reservedBalance ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <h1 className="text-2xl font-bold text-gray-900">
        Welcome{user?.displayName ? `, ${user.displayName}` : ""}!
      </h1>
      <p className="mt-2 text-gray-500">Your virtual trading dashboard</p>

      {/* Balance Cards */}
      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <p className="text-sm text-gray-500">Available Balance</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {loading ? (
              <span className="text-gray-300">—</span>
            ) : (
              formatPaise(balance)
            )}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Reserved</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {loading ? (
              <span className="text-gray-300">—</span>
            ) : (
              formatPaise(reserved)
            )}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Portfolio Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">—</p>
          <p className="text-xs text-gray-400 mt-1">Coming in Sprint 6</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Profit / Loss</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">—</p>
          <p className="text-xs text-gray-400 mt-1">Coming in Sprint 6</p>
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
