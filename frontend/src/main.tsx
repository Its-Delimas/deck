import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter/latin-wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/chart.css";
import "./styles/shell.css";
import "./styles/views.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
