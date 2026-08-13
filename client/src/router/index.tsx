/**
 * Application Router
 *
 * Defines all routes with guards for authentication, email verification,
 * and onboarding status. Matches the server's guard logic:
 * - JwtAuthGuard → check isAuthenticated
 * - OnboardingGuard → check isEmailVerified + isOnboardingComplete
 *
 * Public routes: landing, login, register, verify-email, forgot/reset password
 * Protected routes: onboarding, dashboard
 *
 * Fully onboarded routes are additionally nested under AuthenticatedLayout,
 * which renders the sidebar shell once and an <Outlet /> for page content —
 * pages never render their own header/nav.
 */

import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { Landing } from "../pages/Landing";
import { Login } from "../pages/auth/Login";
import { Register } from "../pages/auth/Register";
import { VerifyEmail } from "../pages/auth/VerifyEmail";
import { ForgotPassword } from "../pages/auth/ForgotPassword";
import { ResetPassword } from "../pages/auth/ResetPassword";
import { Onboarding } from "../pages/auth/Onboarding";
import { Dashboard } from "../pages/trader/Dashboard";
import { BrokerApply } from "../pages/broker-apply/Apply";
import { Wallet } from "../pages/trader/Wallet";
import { TopupInfo } from "../pages/trader/TopupInfo";
import { Market } from "../pages/market/Market";
import { AuthenticatedLayout } from "../components/layout/AuthenticatedLayout";
import { useParams } from "react-router-dom";
import { Trade } from "../pages/trader/Trade";
import { Orders } from "../pages/trader/Orders";
import { About } from "../pages/About";
import { Contact } from "../pages/Contact";
import { Blog } from "../pages/Blog";
import { PublicLayout } from "../components/layout/PublicLayout";
import { Learn } from "../pages/Learn";
import { LearnArticle } from "../pages/LearnArticle";
import { Portfolio } from "../pages/trader/Portfolio";
import { BrokerLayout } from "../components/layout/BrokerLayout";
import { BrokerDashboard } from "../pages/broker/Dashboard";
import { MyTraders } from "../pages/broker/MyTraders";
import { TraderDetail } from "../pages/broker/TraderDetail";
import { TopUpManagement } from "../pages/broker/TopUpManagement";
import { FlagManagement } from "../pages/broker/FlagManagement";
import { ActivityLog } from "../pages/broker/ActivityLog";

// ─── Guard Components ────────────────────────────────────────────────────

function AuthGuard() {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function getDashboardPath(userType?: string | null) {
  switch (userType) {
    case "BROKER":
      return "/broker";
    case "ADMIN":
      return "/admin";
    case "TRADER":
    default:
      return "/dashboard";
  }
}

function OnboardingGuard() {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user || !user.isOnboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

function GuestGuard() {
  const { isAuthenticated, user } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to={getDashboardPath(user?.userType)} replace />;
  }

  return <Outlet />;
}

function BrokerGuard() {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.userType !== "BROKER") {
    return <Navigate to={getDashboardPath(user?.userType)} replace />;
  }

  return <Outlet />;
}

function AdminPlaceholder() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 px-6">
      <div className="max-w-lg text-center space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-600">
          Admin
        </p>
        <h1 className="text-3xl font-bold text-gray-900">
          Admin dashboard coming soon
        </h1>
        <p className="text-gray-600">
          This route is reserved for Sprint 13. Broker and trader dashboards are
          available now.
        </p>
      </div>
    </div>
  );
}

function OldMarketRedirect() {
  const { symbol } = useParams<{ symbol: string }>();
  return <Navigate to={`/market?symbol=${symbol}`} replace />;
}

// ─── Router ──────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  // Public — no guard
  {
    path: "/",
    element: <Landing />,
  },

  // Guest only — redirect to dashboard if already logged in
  {
    element: <GuestGuard />,
    children: [
      { path: "/login", element: <Login /> },
      { path: "/register", element: <Register /> },
      { path: "/broker-apply", element: <BrokerApply /> },
      { path: "/verify-email", element: <VerifyEmail /> },
      { path: "/forgot-password", element: <ForgotPassword /> },
      { path: "/reset-password", element: <ResetPassword /> },
    ],
  },

  // Public pages with Navbar & Footer
  {
    element: <PublicLayout />,
    children: [
      { path: "/about", element: <About /> },
      { path: "/contact", element: <Contact /> },
      { path: "/blog", element: <Blog /> },
    ],
  },

  // Auth required — any authenticated user
  {
    element: <AuthGuard />,
    children: [{ path: "/onboarding", element: <Onboarding /> }],
  },

  // Broker dashboard routes
  {
    element: <BrokerGuard />,
    children: [
      {
        element: <BrokerLayout />,
        children: [
          { path: "/broker", element: <BrokerDashboard /> },
          { path: "/broker/traders", element: <MyTraders /> },
          { path: "/broker/traders/:traderId", element: <TraderDetail /> },
          { path: "/broker/topups", element: <TopUpManagement /> },
          { path: "/broker/flags", element: <FlagManagement /> },
          { path: "/broker/activity", element: <ActivityLog /> },
          { path: "/broker/market", element: <Market /> },
        ],
      },
    ],
  },

  // Admin placeholder — reserved for Sprint 13
  {
    path: "/admin",
    element: <AdminPlaceholder />,
  },

  // Fully onboarded only — wrapped in the sidebar layout
  {
    element: <OnboardingGuard />,
    children: [
      {
        element: <AuthenticatedLayout />,
        children: [
          { path: "/dashboard", element: <Dashboard /> },
          { path: "/wallet", element: <Wallet /> },
          { path: "/wallet/topup-info", element: <TopupInfo /> },
          { path: "/market", element: <Market /> },
          { path: "/market/:symbol", element: <OldMarketRedirect /> },
          { path: "/trade", element: <Trade /> },
          { path: "/orders", element: <Orders /> },
          { path: "/portfolio", element: <Portfolio /> },
          { path: "/learn", element: <Learn /> },
          { path: "/learn/:slug", element: <LearnArticle /> },
        ],
      },
    ],
  },
]);
