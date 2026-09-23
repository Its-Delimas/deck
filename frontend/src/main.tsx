import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/chart.css";
import "./styles/shell.css";
import "./styles/views.css";
import App from "./App";
import { ErrorBoundary, report } from "./components/shell/ErrorBoundary";

// Anything thrown outside React's tree would otherwise leave a blank window.
window.addEventListener("error", (e) => report(`${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) => report(`unhandled rejection: ${String(e.reason)}`));

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
