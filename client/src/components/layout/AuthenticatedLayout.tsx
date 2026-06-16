/**
 * AuthenticatedLayout
 *
 * Shared sidebar layout for all authenticated, onboarded pages
 * (Dashboard, Market, Wallet, StockDetail, TopupInfo). Renders the
 * Nebula brand, primary navigation, and user/logout controls once,
 * via an <Outlet />, so individual pages only render their own
 * content and never lose navigation — even while loading or erroring.
 *
 * Responsive behavior:
 * - md and up (tablet/desktop): fixed 240px sidebar, always visible.
 * - below md (phone): sidebar becomes a slide-in drawer, toggled by
 *   a top bar with a hamburger button.
 */

import { ReactNode, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { clsx } from "clsx";
import { useAuthStore } from "../../stores/authStore";
import { Button } from "../ui/Button";
import api from "../../services/api";

interface NavItem {
  label: string;
  to: string;
  icon: (active: boolean) => ReactNode;
}

function iconClass(active: boolean) {
  return clsx("w-5 h-5", active ? "text-primary-700" : "text-gray-400");
}

function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={iconClass(active)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 9.75L12 3.75l8.25 6v9.75a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-4.5h-4.5v4.5a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75V9.75z"
      />
    </svg>
  );
}

function MarketIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={iconClass(active)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 17l5-5 4 4 7-8M21 8h-4M21 8v4"
      />
    </svg>
  );
}

function WalletIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={iconClass(active)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 8.25A2.25 2.25 0 014.5 6h13.5a2.25 2.25 0 012.25 2.25v8.25A2.25 2.25 0 0118 18.75H4.5a2.25 2.25 0 01-2.25-2.25V8.25z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12h2.25" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: (active) => <DashboardIcon active={active} />,
  },
  {
    label: "Market",
    to: "/market",
    icon: (active) => <MarketIcon active={active} />,
  },
  {
    label: "Wallet",
    to: "/wallet",
    icon: (active) => <WalletIcon active={active} />,
  },
];

const USER_TYPE_LABELS: Record<string, string> = {
  TRADER: "Trader",
  BROKER: "Broker",
  ADMIN: "Admin",
};

export function AuthenticatedLayout() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(to: string) {
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  }

  async function handleLogout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore — clear local auth state regardless
    } finally {
      clearAuth();
    }
  }

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          className="text-gray-500 hover:text-gray-700"
        >
          <MenuIcon />
        </button>
        <span className="text-lg font-bold text-primary-900">Nebula</span>
        <div className="w-6" aria-hidden="true" />
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-gray-900/30"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — fixed on tablet/desktop, slide-in drawer on phone */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200 ease-in-out",
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-md bg-primary-700 text-white text-sm font-bold">
              N
            </span>
            <span className="text-xl font-bold text-primary-900">Nebula</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="md:hidden text-gray-400 hover:text-gray-600"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-primary-50 text-primary-700"
                    : "text-gray-500 hover:bg-surface-100 hover:text-gray-700",
                )}
              >
                {item.icon(active)}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User info + logout */}
        <div className="border-t border-gray-200 p-4 shrink-0 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.displayName || user?.email}
            </p>
            {user?.userType && (
              <span className="inline-block mt-1 text-xs font-medium text-primary-700 bg-primary-50 rounded-full px-2 py-0.5">
                {USER_TYPE_LABELS[user.userType] ?? user.userType}
              </span>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={handleLogout}
          >
            Log out
          </Button>
        </div>
      </aside>

      {/* Content area */}
      <div className="md:pl-60">
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
