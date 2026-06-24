/**
 * Footer Component
 *
 * Reusable public footer for Landing, About, Contact, and future public pages.
 * Dark background with multi-column links and copyright.
 */

import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="bg-primary-950 pt-14 pb-7">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          <div className="col-span-2 md:col-span-1">
            <span className="text-xl font-bold text-white">Nebula</span>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">
              Virtual trading and learning platform. Built for education.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-4">
              Platform
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link
                  to="/about"
                  className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  to="/market"
                  className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Market
                </Link>
              </li>
              <li>
                <span className="text-sm text-gray-400 hover:text-gray-200 transition-colors cursor-pointer">
                  AI coaching
                </span>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-4">
              Support
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link
                  to="/contact"
                  className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Contact us
                </Link>
              </li>
              <li>
                <span className="text-sm text-gray-400 hover:text-gray-200 transition-colors cursor-pointer">
                  Learning resources
                </span>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-4">
              Account
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link
                  to="/register"
                  className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Sign up
                </Link>
              </li>
              <li>
                <Link
                  to="/login"
                  className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Log in
                </Link>
              </li>
              <li>
                <Link
                  to="/broker-apply"
                  className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Broker application
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-primary-800 pt-6 flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Nebula. Built for education.
          </span>
          <div className="flex gap-2.5">
            {["BSc FYP", "Virtual only", "No real trades"].map((b) => (
              <span
                key={b}
                className="text-xs font-medium text-gray-500 border border-primary-800 rounded-md px-2.5 py-1"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
