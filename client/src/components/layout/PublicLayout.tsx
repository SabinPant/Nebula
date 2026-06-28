/**
 * PublicLayout
 *
 * Shared layout for public pages — Navbar + content + Footer.
 * Used by About, Contact, and other public pages.
 * Landing page uses Navbar and Footer directly (custom layout).
 */

import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
