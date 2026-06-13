/**
 * Verify Email Page
 *
 * Reads a verification token from the URL query string and sends it
 * to the server. Shows success or error based on the response.
 * The token is consumed immediately — this page only works once per link.
 */

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import api from "../../services/api";

export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage(
        "No verification token found. Please check your email link and try again.",
      );
      return;
    }

    async function verify() {
      try {
        await api.post("/auth/verify-email", { token });
        setStatus("success");
        setMessage(
          "Your email has been verified successfully. You can now log in.",
        );
      } catch (err: any) {
        setStatus("error");
        const code = err.response?.data?.code;
        if (code === "INVALID_VERIFICATION_TOKEN") {
          setMessage(
            "This verification link is invalid or has expired. Please request a new one.",
          );
        } else {
          setMessage("Something went wrong. Please try again.");
        }
      }
    }

    verify();
  }, [token]);

  return (
    <AuthLayout
      title="Email Verification"
      subtitle={
        status === "loading"
          ? "Verifying your email..."
          : status === "success"
            ? "You're all set!"
            : "Verification failed"
      }
    >
      {status === "loading" && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
        </div>
      )}

      {status === "success" && (
        <>
          <Alert variant="success">{message}</Alert>
          <div className="mt-6 text-center">
            <Link to="/login">
              <Button>Go to login</Button>
            </Link>
          </div>
        </>
      )}

      {status === "error" && (
        <>
          <Alert variant="error">{message}</Alert>
          <div className="mt-6 text-center">
            <Link to="/login">
              <Button variant="secondary">Back to login</Button>
            </Link>
          </div>
        </>
      )}
    </AuthLayout>
  );
}
