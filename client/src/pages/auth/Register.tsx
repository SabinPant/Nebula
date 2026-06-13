/**
 * Register Page
 *
 * Creates a new trader account with email, password, and display name.
 * On success, shows a verification notice — the user must verify their
 * email before logging in.
 */

import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";

export function Register() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.post("/auth/register", {
        email,
        password,
        displayName,
      });
      setSuccess(true);
    } catch (err: any) {
      const data = err.response?.data;
      const code = data?.code;
      const message = data?.message;

      if (Array.isArray(message) && message.length > 0) {
        const firstError = message[0] as string;
        if (firstError.toLowerCase().includes("password")) {
          setError(
            "Your password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character (@#$%!&*?).",
          );
        } else {
          setError(firstError);
        }
      } else {
        switch (code) {
          case "EMAIL_ALREADY_EXISTS":
            setError("An account with this email already exists.");
            break;
          case "RATE_LIMIT_EXCEEDED":
            setError(
              "Too many registration attempts. Please wait and try again.",
            );
            break;
          default:
            setError(message || "Something went wrong. Please try again.");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="We sent a verification link to your inbox"
      >
        <Alert variant="success">
          Account created! Please check your email and click the verification
          link to activate your account. The link expires in 24 hours.
        </Alert>
        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Back to login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start trading with virtual Rs. 50,000"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <Input
          label="Full name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your full name"
          required
          autoComplete="name"
        />

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
          placeholder="Min. 8 characters"
          required
          autoComplete="new-password"
        />

        <p className="text-xs text-gray-400">
          Must be at least 8 characters with uppercase, lowercase, number, and
          special character (@#$%!&*?).
        </p>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
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
              window.location.href = `${
                import.meta.env.VITE_API_URL || "http://localhost:3001/api/v1"
              }/auth/google`;
            }}
          >
            Sign up with Google
          </Button>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link
          to="/login"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
