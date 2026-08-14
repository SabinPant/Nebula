/**
 * AdminLayout
 *
 * Shared sidebar layout for admin panel pages.
 * Mirrors BrokerLayout structure but uses admin-specific navigation.
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

function OverviewIcon({ active }: { active: boolean }) {
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

function UsersIcon({ active }: { active: boolean }) {
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
        d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975M15 9.75a3 3 0 11-6 0 3 3 0 016 0zm6 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-15 0a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zm1.5 8.25A2.25 2.25 0 016.75 15.75h10.5A2.25 2.25 0 0119.5 18v.75H4.5V18z"
      />
    </svg>
  );
}

function ApplicationsIcon({ active }: { active: boolean }) {
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
        d="M9 12h3.75M9 15h3.75M9 18h3.75M3.75 5.25h16.5a1.5 1.5 0 011.5 1.5v10.5a1.5 1.5 0 01-1.5 1.5H3.75a1.5 1.5 0 01-1.5-1.5V6.75a1.5 1.5 0 011.5-1.5zM6 9h.008v.008H6V9z"
      />
    </svg>
  );
}

function TopupsIcon({ active }: { active: boolean }) {
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
        d="M12 6v12m-3-3l3 3 3-3m-8.25 3.75h10.5A2.25 2.25 0 0016.5 16.5V7.5A2.25 2.25 0 0014.25 5.25h-4.5A2.25 2.25 0 007.5 7.5v9A2.25 2.25 0 009.75 18.75z"
      />
    </svg>
  );
}

function AuditIcon({ active }: { active: boolean }) {
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
        d="M3.75 12h3l2.25-6 4.5 12 2.25-6h4.5"
      />
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
    label: "Overview",
    to: "/admin",
    icon: (active) => <OverviewIcon active={active} />,
  },
  {
    label: "Users",
    to: "/admin/users",
    icon: (active) => <UsersIcon active={active} />,
  },
  {
    label: "Broker Applications",
    to: "/admin/brokers",
    icon: (active) => <ApplicationsIcon active={active} />,
  },
  {
    label: "Top-Ups",
    to: "/admin/topups",
    icon: (active) => <TopupsIcon active={active} />,
  },
  {
    label: "Audit Log",
    to: "/admin/audit",
    icon: (active) => <AuditIcon active={active} />,
  },
];

export function AdminLayout() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(to: string) {
    if (to === "/admin") return location.pathname === "/admin";
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

      {/* Sidebar */}
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
            <span className="inline-block mt-1 text-xs font-medium text-primary-700 bg-primary-50 rounded-full px-2 py-0.5">
              Admin
            </span>
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
