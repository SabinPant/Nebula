/**
 * Application Entry Point
 *
 * Bootstraps the React application.
 * Sets up React 18's createRoot API, mounts the App component
 * into the DOM, and imports global Tailwind styles.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
