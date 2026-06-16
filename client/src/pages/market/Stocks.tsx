/**
 * Market — Stocks Page
 *
 * Displays all available stocks with live prices, change percentages,
 * and halt status. Prices update in real-time via WebSocket.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";
import { socket, connectSocket } from "../../lib/socket";
import { formatPaise } from "../../lib/utils";

interface Stock {
  id: string;
  symbol: string;
  companyName: string;
  sector: string;
  currentPrice: number;
  previousClose: number;
  isHalted: boolean;
  haltReason: string | null;
}

interface PriceUpdate {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  isHalted: boolean;
  timestamp: string;
}

export function Stocks() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let symbols: string[] = [];

    async function fetchStocks() {
      try {
        const { data } = await api.get("/market/stocks");
        setStocks(data);
        symbols = data.map((s: Stock) => s.symbol);

        // Subscribe to each stock room individually
        connectSocket();
        symbols.forEach((symbol) => {
          socket.emit("subscribe:stock", { symbol });
        });
      } catch {
        setError("Failed to load stocks.");
      } finally {
        setLoading(false);
      }
    }

    fetchStocks();

    // Listen for price updates
    socket.on("price:update", (update: PriceUpdate) => {
      setStocks((prev) =>
        prev.map((stock) =>
          stock.symbol === update.symbol
            ? {
                ...stock,
                currentPrice: update.price,
                isHalted: update.isHalted,
              }
            : stock,
        ),
      );
    });

    return () => {
      socket.off("price:update");
      symbols.forEach((symbol) => {
        socket.emit("unsubscribe:stock", { symbol });
      });
    };
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

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
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
            <span className="text-sm text-primary-700 font-medium">Market</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Market</h1>

        <div className="grid gap-4">
          {stocks.map((stock) => {
            const change = stock.currentPrice - stock.previousClose;
            const changePercent = (
              (change / stock.previousClose) *
              100
            ).toFixed(2);
            const isUp = change >= 0;

            return (
              <Link
                key={stock.id}
                to={`/market/${stock.symbol}`}
                className="block"
              >
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {stock.symbol}
                        </h3>
                        {stock.isHalted && (
                          <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                            HALTED
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {stock.companyName}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {stock.sector}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">
                        {formatPaise(stock.currentPrice)}
                      </p>
                      <p
                        className={`text-sm font-medium ${
                          isUp ? "text-green-600" : "text-red-500"
                        }`}
                      >
                        {isUp ? "+" : ""}
                        {changePercent}%
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
