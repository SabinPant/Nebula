/**
 * Login Page
 *
 * Email/password authentication with a link to Google OAuth.
 * On success, stores the access token and user in the auth store
 * and redirects based on onboarding status.
 */

import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { useAuthStore } from "../../stores/authStore";
import api from "../../services/api";
import { connectSocket } from "../../lib/socket";

export function Login() {
  const navigate = useNavigate();
  const { login, deviceId: existingDeviceId } = useAuthStore();
  const deviceId = existingDeviceId || crypto.randomUUID();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", {
        email,
        password,
        deviceId,
      });

      login(data.accessToken, deviceId, data.user);
      connectSocket();

      if (data.user.isOnboardingComplete) {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/onboarding", { replace: true });
      }
    } catch (err: any) {
      const code = err.response?.data?.code;
      switch (code) {
        case "INVALID_CREDENTIALS":
          setError("Invalid email or password.");
          break;
        case "ACCOUNT_SUSPENDED":
          setError("Your account has been suspended. Contact support.");
          break;
        case "EMAIL_NOT_VERIFIED":
          setError("Please verify your email before logging in.");
          break;
        case "RATE_LIMIT_EXCEEDED":
          setError("Too many attempts. Please wait and try again.");
          break;
        default:
          setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to your Nebula account">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />

        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
          autoComplete="current-password"
        />

        <div className="flex items-center justify-end">
          <Link
            to="/forgot-password"
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Logging in..." : "Log in"}
        </Button>
      </form>

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-4 text-gray-400">or</span>
          </div>
        </div>

        <div className="mt-4">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              window.location.href = `${import.meta.env.VITE_API_URL || "http://localhost:3001/api/v1"}/auth/google`;
            }}
          >
            Sign in with Google
          </Button>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-gray-500">
        Don't have an account?{" "}
        <Link
          to="/register"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
