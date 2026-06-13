/**
 * Alert Component
 *
 * Reusable alert banner for success, error, warning, and info messages.
 * Used across auth pages and dashboard notifications.
 */

import { ReactNode } from "react";
import { clsx } from "clsx";

interface AlertProps {
  variant: "success" | "error" | "warning" | "info";
  children: ReactNode;
  className?: string;
}

const variantStyles = {
  success: "bg-green-50 border-green-400 text-green-800",
  error: "bg-red-50 border-red-400 text-red-800",
  warning: "bg-yellow-50 border-yellow-400 text-yellow-800",
  info: "bg-blue-50 border-blue-400 text-blue-800",
};

export function Alert({ variant, children, className }: AlertProps) {
  return (
    <div
      className={clsx(
        "border-l-4 p-4 rounded-r-md text-sm",
        variantStyles[variant],
        className,
      )}
      role="alert"
    >
      {children}
    </div>
  );
}
