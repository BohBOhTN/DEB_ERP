import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppErrorBoundary } from "./app/errorBoundary";
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/base.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

// The component gallery replaces the application on /_kit in development
// only (R7 Sprint 18); the branch is removed from production builds.
if (import.meta.env.DEV && window.location.pathname === "/_kit") {
  void import("./components/kit/mountKit").then(({ mountKit }) =>
    mountKit(root),
  );
} else {
  createRoot(root).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  );
}
