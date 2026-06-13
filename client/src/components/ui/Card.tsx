/**
 * Card Component
 *
 * Reusable card container with optional title.
 * Used for auth forms, dashboard sections, and content panels.
 */

import { ReactNode } from "react";
import { clsx } from "clsx";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className }: CardProps) {
  return (
    <div
      className={clsx(
        "bg-white rounded-lg border border-gray-200 shadow-sm",
        className,
      )}
    >
      {title && (
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>
      )}
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}
