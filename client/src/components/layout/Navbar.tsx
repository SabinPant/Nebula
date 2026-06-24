/**
 * Navbar Component
 *
 * Reusable public navbar for Landing, About, Contact, and future public pages.
 * Clean light design with mobile hamburger menu.
 */

import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { clsx } from "clsx";
import { Button } from "../ui/Button";

interface NavbarProps {
  transparent?: boolean;
}

const navLinks = [
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
  { label: "Learn", to: "/learn" },
];

const secondaryLinks = [
  { label: "Blog", to: "/blog" },
  { label: "Become a Broker", to: "/broker-apply" },
];

function MenuIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

export function Navbar({ transparent = false }: NavbarProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav
        className={clsx(
          "sticky top-0 z-30 border-b border-gray-200",
          transparent ? "bg-transparent" : "bg-white",
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img
              src="/Nebula_logo.png"
              alt="Nebula"
              className="w-10 h-10 rounded-md"
            />
          </Link>

          {/* Desktop nav links — all together */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={clsx(
                  "text-sm font-medium transition-colors",
                  location.pathname === link.to
                    ? "text-primary-700"
                    : "text-gray-500 hover:text-gray-700",
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="w-px h-4 bg-gray-200" />
            {secondaryLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={clsx(
                  "text-sm font-medium transition-colors",
                  location.pathname === link.to
                    ? "text-primary-700"
                    : "text-gray-500 hover:text-gray-700",
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA buttons */}
          <div className="hidden md:flex items-center space-x-3">
            <Link to="/login">
              <Button variant="secondary" size="sm">
                Log in
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Sign up free</Button>
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="md:hidden text-gray-500 hover:text-gray-700"
          >
            <MenuIcon />
          </button>
        </div>
      </nav>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-gray-900/30"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={clsx(
          "md:hidden fixed inset-y-0 right-0 z-50 w-64 bg-white border-l border-gray-200 flex flex-col transition-transform duration-200 ease-in-out",
          mobileOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-200 shrink-0">
          <Link
            to="/"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2"
          >
            <img
              src="/Nebula_logo.png"
              alt="Nebula"
              className="w-10 h-10 rounded-md"
            />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="text-gray-400 hover:text-gray-600"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={clsx(
                "block px-3 py-2 rounded-md text-sm font-medium transition-colors",
                location.pathname === link.to
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              )}
            >
              {link.label}
            </Link>
          ))}
          <div className="border-t border-gray-100 my-2" />
          {secondaryLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-4 space-y-3">
          <Link
            to="/login"
            onClick={() => setMobileOpen(false)}
            className="block"
          >
            <Button variant="secondary" size="sm" className="w-full">
              Log in
            </Button>
          </Link>
          <Link
            to="/register"
            onClick={() => setMobileOpen(false)}
            className="block"
          >
            <Button size="sm" className="w-full">
              Sign up free
            </Button>
          </Link>
        </div>
      </aside>
    </>
  );
}
