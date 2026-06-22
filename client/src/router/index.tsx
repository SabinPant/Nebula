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

// ─── Guard Components ────────────────────────────────────────────────────

function AuthGuard() {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
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
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
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

  // Auth required — any authenticated user
  {
    element: <AuthGuard />,
    children: [{ path: "/onboarding", element: <Onboarding /> }],
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
        ],
      },
    ],
  },
]);
