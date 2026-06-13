/**
 * Button Component
 *
 * Reusable button with variant and size props.
 * Uses Tailwind classes for styling — no external library.
 *
 * Variants: primary (blue), secondary (outline), danger (red)
 * Sizes: sm, md, lg
 */

import { ButtonHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const variantStyles = {
  primary:
    "bg-primary-700 text-white hover:bg-primary-800 focus:ring-primary-500",
  secondary:
    "border border-primary-300 text-primary-700 hover:bg-primary-50 focus:ring-primary-500",
  danger: "bg-danger-500 text-white hover:bg-danger-600 focus:ring-danger-500",
};

const sizeStyles = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-base",
  lg: "px-7 py-3 text-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
        variantStyles[variant],
        sizeStyles[size],
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
