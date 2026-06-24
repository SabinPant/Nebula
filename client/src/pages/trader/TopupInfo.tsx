/**
 * Topup Info Page
 *
 * Displays the assigned broker's contact information for manual
 * collateral top-ups. If the broker is suspended, shows a warning
 * message with admin contact. If no broker is assigned, shows
 * instructions to complete onboarding.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";
import { formatPaise } from "../../lib/utils";
import { Button } from "../../components/ui/Button";

interface BrokerInfo {
  displayName: string;
  brokerNumber: string;
  email: string;
  phone: string | null;
}

interface TopupData {
  broker: BrokerInfo | null;
  message?: string;
  weeklyCapPaise: number;
  weeklyUsedPaise: number;
  weeklyRemainingPaise: number;
}

export function TopupInfo() {
  const [data, setData] = useState<TopupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const { data } = await api.get("/wallet/topup-info");
        setData(data);
      } catch {
        setError("Failed to load broker information.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Broker Information</h1>

      {/* Warning states */}
      {data.message && !data.broker && (
        <Alert variant="info">{data.message}</Alert>
      )}

      {data.message && data.broker && (
        <Alert variant="warning">{data.message}</Alert>
      )}

      {/* Broker contact card */}
      {data.broker ? (
        <Card title="Your Broker">
          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-500">Name</p>
              <p className="text-gray-900 font-medium">
                {data.broker.displayName}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Broker Number</p>
              <p className="text-gray-900">{data.broker.brokerNumber}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <a
                href={`mailto:${data.broker.email}`}
                className="text-primary-600 hover:text-primary-700"
              >
                {data.broker.email}
              </a>
            </div>
            {data.broker.phone && (
              <div>
                <p className="text-sm text-gray-500">Phone</p>
                <a
                  href={`tel:${data.broker.phone.replace(/[^+\d]/g, "")}`}
                  className="text-primary-600 hover:text-primary-700"
                >
                  {data.broker.phone}
                </a>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="text-center py-6">
            <p className="text-gray-500">No broker assigned.</p>
            <p className="text-sm text-gray-400 mt-1">
              Complete onboarding to select a broker and enable top-ups.
            </p>
            <Link to="/onboarding" className="inline-block mt-3">
              <Button variant="primary" size="sm">
                Go to Onboarding
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Weekly cap status */}
      <Card title="Weekly Top-Up Status">
        <div className="space-y-3">
          {/* Progress bar */}
          {data.weeklyCapPaise > 0 && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Used</span>
                <span className="font-medium text-gray-900">
                  {formatPaise(data.weeklyUsedPaise)} /{" "}
                  {formatPaise(data.weeklyCapPaise)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    data.weeklyRemainingPaise === 0
                      ? "bg-red-500"
                      : data.weeklyRemainingPaise < data.weeklyCapPaise * 0.2
                        ? "bg-yellow-500"
                        : "bg-primary-600"
                  }`}
                  style={{
                    width: `${Math.min(
                      (data.weeklyUsedPaise / data.weeklyCapPaise) * 100,
                      100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Remaining</span>
            <span
              className={`text-sm font-bold ${
                data.weeklyRemainingPaise === 0
                  ? "text-red-600"
                  : "text-primary-700"
              }`}
            >
              {formatPaise(data.weeklyRemainingPaise)}
            </span>
          </div>
        </div>

        {/* Zero remaining warning */}
        {data.weeklyRemainingPaise === 0 && (
          <div className="mt-3">
            <Alert variant="warning">
              Weekly top-up cap reached. Top-ups will be blocked until next
              Monday. Contact your broker or admin@nebula.com for an override.
            </Alert>
          </div>
        )}

        {/* Low remaining warning */}
        {data.weeklyRemainingPaise > 0 &&
          data.weeklyRemainingPaise < data.weeklyCapPaise * 0.1 && (
            <div className="mt-3">
              <Alert variant="info">
                Only {formatPaise(data.weeklyRemainingPaise)} remaining this
                week.
              </Alert>
            </div>
          )}
      </Card>

      {/* Instructions */}
      <Card title="How to Add Collateral">
        <div className="text-sm text-gray-600 space-y-2">
          <ol className="list-decimal list-inside space-y-1">
            <li>Contact your broker using the details above.</li>
            <li>
              Send the desired amount via eSewa, Khalti, bank transfer, or QR.
            </li>
            <li>
              Share your payment receipt with your broker outside Nebula
              (WhatsApp, email, or phone).
            </li>
            <li>
              Your broker will verify the payment and credit your Nebula wallet
              within 24 hours.
            </li>
          </ol>
        </div>
      </Card>

      <div className="text-center">
        <Link to="/wallet">
          <Button variant="secondary" size="sm">
            Back to Wallet
          </Button>
        </Link>
      </div>
    </div>
  );
}
