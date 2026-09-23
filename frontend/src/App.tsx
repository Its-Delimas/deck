import { Suspense, lazy, useEffect, useState } from "react";
import { AppProvider, useApp } from "./lib/app";
import { usePoll, useHotkey } from "./lib/hooks";
import * as api from "../wailsjs/go/main/App";
import { TitleBar } from "./components/shell/TitleBar";
import { Sidebar } from "./components/shell/Sidebar";
import { StatusBar } from "./components/shell/StatusBar";
import { CommandPalette } from "./components/shell/CommandPalette";
import { Grips } from "./components/shell/Grips";
import { ToastHost } from "./components/ui";
import { Dashboard } from "./views/Dashboard";
import { Processes } from "./views/Processes";

// Screens that pull in heavier dependencies (xterm, deep scans) are split out
// so the first paint stays fast.
const Network = lazy(() => import("./views/Network").then((m) => ({ default: m.Network })));
const Storage = lazy(() => import("./views/Storage").then((m) => ({ default: m.Storage })));
const Services = lazy(() => import("./views/Services").then((m) => ({ default: m.Services })));
const Terminal = lazy(() => import("./views/Terminal").then((m) => ({ default: m.Terminal })));
const Logs = lazy(() => import("./views/Logs").then((m) => ({ default: m.Logs })));
const Settings = lazy(() => import("./views/Settings").then((m) => ({ default: m.Settings })));
const Project = lazy(() => import("./views/Project").then((m) => ({ default: m.Project })));

const ORDER = ["dashboard", "processes", "network", "storage", "services", "terminal", "logs"] as const;

function Shell() {
  const { view, go, setPalette } = useApp();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1080);
  // Terminal sessions outlive navigation: once opened, the view stays mounted
  // and is only hidden, so shells and scrollback survive a trip to Dashboard.
  const [termMounted, setTermMounted] = useState(false);
  useEffect(() => {
    if (view === "terminal") setTermMounted(true);
  }, [view]);

  useEffect(() => {
    const onResize = () => setCollapsed(window.innerWidth < 1080);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useHotkey("mod+k", () => setPalette(true), true);
  useHotkey("mod+,", () => go("settings"));
  useHotkey("mod+b", () => setCollapsed((c) => !c));
  ORDER.forEach((id, i) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkey(`mod+${i + 1}`, () => go(id));
  });

  // Counts shown in the sidebar; polled slowly since they are ambient.
  const { data: ports } = usePoll(() => api.ListPorts(), 5000, []);
  const { data: services } = usePoll(() => api.ListServices(), 6000, []);
  const running = (services ?? []).filter((s) => s.status === "running").length;

  return (
    <div className="shell">
      <TitleBar />
      <div className="body" data-collapsed={collapsed}>
        <Sidebar collapsed={collapsed} portCount={ports?.length ?? 0} serviceCount={running} />
        <Suspense fallback={<div className="view"><div className="view__body" /></div>}>
          {view === "dashboard" && <Dashboard />}
          {view === "processes" && <Processes />}
          {view === "network" && <Network />}
          {view === "storage" && <Storage />}
          {view === "services" && <Services />}
          {termMounted && (
            <div style={{ display: view === "terminal" ? "contents" : "none" }}>
              <Terminal />
            </div>
          )}
          {view === "logs" && <Logs />}
          {view === "settings" && <Settings />}
          {view === "project" && <Project />}
        </Suspense>
      </div>
      <StatusBar />
      <CommandPalette />
      <Grips />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ToastHost>
        <Shell />
      </ToastHost>
    </AppProvider>
  );
}
