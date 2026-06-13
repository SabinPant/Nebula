/**
 * Auth Layout Component
 *
 * Shared layout for all authentication pages.
 * Centers a card vertically and horizontally with the Nebula logo
 * and a background that matches the institutional blue theme.
 */

import { ReactNode } from "react";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary-900 tracking-tight">
          Nebula
        </h1>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>

      {/* Footer text */}
      <p className="mt-6 text-sm text-gray-400">
        &copy; {new Date().getFullYear()} Nebula. All rights reserved.
      </p>
    </div>
  );
}
