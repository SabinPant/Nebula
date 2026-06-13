/**
 * Root Application Component
 *
 * Renders the React Router provider with all routes.
 * No layout, no business logic — pure routing.
 */

import { RouterProvider } from "react-router-dom";
import { router } from "./router";

function App() {
  return <RouterProvider router={router} />;
}

export default App;
