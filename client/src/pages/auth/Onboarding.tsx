/**
 * Onboarding Page
 *
 * Displays the list of active brokers for the trader to choose from.
 * After selecting a broker, onboarding is marked complete and the user
 * is redirected to the dashboard.
 *
 * If no brokers are available, shows a message instructing the user
 * to contact support.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { useAuthStore } from "../../stores/authStore";
import api from "../../services/api";

interface Broker {
  id: string;
  displayName: string;
  brokerNumber: string;
  email: string;
  _count: { assignedTraders: number };
}

export function Onboarding() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    async function fetchBrokers() {
      try {
        const { data } = await api.get("/auth/onboarding/brokers");
        setBrokers(data);
      } catch {
        setError("Failed to load brokers. Please try again.");
      } finally {
        setFetching(false);
      }
    }
    fetchBrokers();
  }, []);

  async function handleSelect() {
    if (!selectedId) return;
    setLoading(true);
    setError("");

    try {
      await api.post("/auth/onboarding/select-broker", {
        brokerId: selectedId,
      });

      if (user) {
        setUser({ ...user, isOnboardingComplete: true });
      }

      navigate("/dashboard", { replace: true });
    } catch {
      setError("Failed to select broker. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // No brokers available — show message
  if (!fetching && brokers.length === 0) {
    return (
      <AuthLayout
        title="No Brokers Available"
        subtitle="Please check back later"
      >
        <Alert variant="warning">
          No brokers are currently available. Please check back soon or contact{" "}
          <a href="mailto:admin@nebula.com" className="underline">
            admin@nebula.com
          </a>
          .
        </Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose Your Broker"
      subtitle="Select a broker to complete your account setup"
    >
      {error && <Alert variant="error">{error}</Alert>}

      {fetching ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {brokers.map((broker) => (
              <label
                key={broker.id}
                className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  selectedId === broker.id
                    ? "border-primary-500 bg-primary-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="broker"
                  value={broker.id}
                  checked={selectedId === broker.id}
                  onChange={() => setSelectedId(broker.id)}
                  className="mt-1"
                />
                <div>
                  <p className="font-semibold text-gray-900">
                    {broker.displayName}
                  </p>
                  <p className="text-sm text-gray-500">
                    {broker.brokerNumber} &middot; {broker.email}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {broker._count.assignedTraders} trader
                    {broker._count.assignedTraders !== 1 ? "s" : ""} assigned
                  </p>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-6">
            <Button
              className="w-full"
              disabled={!selectedId || loading}
              onClick={handleSelect}
            >
              {loading ? "Confirming..." : "Confirm Selection"}
            </Button>
          </div>

          <p className="mt-4 text-xs text-gray-400 text-center">
            You cannot change your broker after selection. Contact support if
            you need to switch later.
          </p>
        </>
      )}
    </AuthLayout>
  );
}
