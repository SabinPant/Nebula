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

function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `Rs. ${rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface-50 p-6">
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <Link
              to="/dashboard"
              className="text-xl font-bold text-primary-900"
            >
              Nebula
            </Link>
            <Link
              to="/dashboard"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Dashboard
            </Link>
            <Link
              to="/wallet"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Wallet
            </Link>
            <span className="text-sm text-primary-700 font-medium">
              Broker Info
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Broker Information</h1>

        {/* Warning states */}
        {data.message && !data.broker && (
          <Alert variant="info">{data.message}</Alert>
        )}

        {data.message && data.broker && (
          <Alert variant="warning">{data.message}</Alert>
        )}

        {/* Broker contact card */}
        {data.broker && (
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
                  <p className="text-gray-900">{data.broker.phone}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Weekly cap status */}
        <Card title="Weekly Top-Up Status">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Weekly Cap</span>
              <span className="text-sm font-medium text-gray-900">
                {formatPaise(data.weeklyCapPaise)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Used This Week</span>
              <span className="text-sm font-medium text-gray-900">
                {formatPaise(data.weeklyUsedPaise)}
              </span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2">
              <span className="text-sm font-medium text-gray-700">
                Remaining
              </span>
              <span className="text-sm font-bold text-primary-700">
                {formatPaise(data.weeklyRemainingPaise)}
              </span>
            </div>
          </div>
        </Card>

        {/* Instructions */}
        <Card>
          <div className="text-sm text-gray-600 space-y-2">
            <p>
              <strong>How to add collateral:</strong>
            </p>
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
                Your broker will verify the payment and credit your Nebula
                wallet within 24 hours.
              </li>
            </ol>
          </div>
        </Card>

        <div className="text-center">
          <Link to="/wallet">
            <span className="text-sm text-primary-600 hover:text-primary-700">
              Back to Wallet
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
