import { useEffect, useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Card } from "../../components/ui/Card";
import { useAuthStore } from "../../stores/authStore";
import api from "../../services/api";

interface BrokerStats {
  assignedTraders: number;
  topUpsThisWeek: number | null;
  activeFlags: number;
}

export function BrokerDashboard() {
  const user = useAuthStore((state) => state.user);
  const [stats, setStats] = useState<BrokerStats>({
    assignedTraders: 0,
    topUpsThisWeek: null,
    activeFlags: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [tradersRes, topUpsRes, flagsRes] = await Promise.all([
          api.get("/broker/traders"),
          api.get("/broker/topups?page=1&limit=1"),
          api.get("/broker/flags?page=1&limit=1"),
        ]);

        setStats({
          assignedTraders: Array.isArray(tradersRes.data)
            ? tradersRes.data.length
            : (tradersRes.data?.data?.length ?? 0),
          topUpsThisWeek: topUpsRes.data?.pagination?.totalCount ?? null,
          activeFlags: flagsRes.data?.pagination?.totalCount ?? 0,
        });
      } catch {
        setError("Failed to load broker overview. Please try again.");
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
      <p className="mt-2 text-gray-500">Your broker dashboard overview</p>

      {error && (
        <div className="mt-6">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {loading ? (
        <div className="mt-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white py-16">
          <div className="flex items-center gap-3 text-gray-600">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
            <span className="text-sm font-medium">Loading broker stats...</span>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <p className="text-sm text-gray-500">Assigned Traders</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">
              {stats.assignedTraders}
            </p>
          </Card>

          <Card>
            <p className="text-sm text-gray-500">Top-Ups This Week</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">—</p>
            <p className="mt-2 text-sm text-gray-500">
              Weekly top-up endpoint will be added in a later sprint.
            </p>
          </Card>

          <Card>
            <p className="text-sm text-gray-500">Active Flags</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">
              {stats.activeFlags}
            </p>
          </Card>
        </div>
      )}

      {!loading && !error && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <Card title="Overview">
            <div className="space-y-3 text-sm text-gray-600">
              <p>
                Use My Traders to review assigned accounts and open detail
                views.
              </p>
              <p>Use Top-Ups to process collateral credits and audit them.</p>
              <p>Use Flags to track suspicious trader activity.</p>
            </div>
          </Card>

          <Card title="Recent Activity">
            <p className="text-sm text-gray-600">
              Activity summary will expand when the activity table is built.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
