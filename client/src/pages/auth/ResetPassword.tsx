/**
 * Reset Password Page
 *
 * Reads a reset token from the URL query string and allows the user
 * to set a new password. The token is single-use — this page only
 * works once per link.
 */

import { useState, FormEvent, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(
        "No reset token found. Please check your email link and try again.",
      );
    }
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;

    setError("");
    setLoading(true);

    try {
      await api.post("/auth/reset-password", { token, password });
      setSuccess(true);
    } catch (err: any) {
      const code = err.response?.data?.code;
      switch (code) {
        case "INVALID_RESET_TOKEN":
          setError(
            "This reset link is invalid or has expired. Please request a new one.",
          );
          break;
        case "VALIDATION_ERROR":
          setError(
            "Password must be at least 8 characters with uppercase, lowercase, number, and special character.",
          );
          break;
        default:
          setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthLayout
        title="Password reset"
        subtitle="Your password has been updated"
      >
        <Alert variant="success">
          Your password has been reset successfully. You can now log in with
          your new password.
        </Alert>
        <div className="mt-6 text-center">
          <Link to="/login">
            <Button>Go to login</Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (!token) {
    return (
      <AuthLayout
        title="Invalid link"
        subtitle="This reset link is missing a token"
      >
        <Alert variant="error">{error}</Alert>
        <div className="mt-6 text-center">
          <Link to="/forgot-password">
            <Button variant="secondary">Request new link</Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Set new password"
      subtitle="Choose a strong password you haven't used before"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min. 8 characters"
          required
          autoComplete="new-password"
        />

        <p className="text-xs text-gray-400">
          Must be at least 8 characters with uppercase, lowercase, number, and
          special character (@#$%!&*?).
        </p>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Resetting..." : "Reset password"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link
          to="/login"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          Back to login
        </Link>
      </p>
    </AuthLayout>
  );
}
