// Application-wide state: the current view, the active project, persisted
// settings and host facts. Kept deliberately small — everything else is local
// to a screen.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "../../wailsjs/go/main/App";
import type { main, project as proj, system } from "../../wailsjs/go/models";
import { seed, startMetrics } from "./store";

export type ViewId =
  | "dashboard" | "project" | "processes" | "network" | "storage" | "services" | "terminal" | "logs" | "settings";

type Ctx = {
  view: ViewId;
  go: (v: ViewId) => void;
  host: system.HostInfo | null;
  settings: main.Settings;
  update: (patch: Partial<main.Settings>) => void;
  project: proj.Project | null;
  openProject: (path: string) => Promise<void>;
  closeProject: () => void;
  recent: string[];
  palette: boolean;
  setPalette: (v: boolean) => void;
  /** Screens can publish a "focus this thing" intent, e.g. jump to a PID. */
  focus: { view: ViewId; value: string } | null;
  jump: (view: ViewId, value: string) => void;
};

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
};

const DEFAULTS = {
  pollInterval: 1000, accent: "indigo", density: "comfortable", cpuMode: "total",
  tempUnit: "c", recentProjects: [], activeProject: "", confirmKill: true,
  showSystemProcs: true, startPage: "dashboard",
} as unknown as main.Settings;

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewId>("dashboard");
  const [host, setHost] = useState<system.HostInfo | null>(null);
  const [settings, setSettings] = useState<main.Settings>(DEFAULTS);
  const [project, setProject] = useState<proj.Project | null>(null);
  const [palette, setPalette] = useState(false);
  const [focus, setFocus] = useState<{ view: ViewId; value: string } | null>(null);

  useEffect(() => {
    startMetrics();
    api.GetSnapshot().then(seed).catch(() => {});
    api.GetHost().then(setHost).catch(() => {});
    api.GetSettings().then((s) => {
      setSettings(s);
      if (s.activeProject) api.OpenProject(s.activeProject).then(setProject).catch(() => {});
    }).catch(() => {});
  }, []);

  // Theme-ish preferences live on the root element so CSS can react to them.
  useEffect(() => {
    document.documentElement.dataset.accent = settings.accent;
    document.documentElement.dataset.density = settings.density;
  }, [settings.accent, settings.density]);

  const update = useCallback((patch: Partial<main.Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch } as main.Settings;
      api.SaveSettings(next).catch(() => {});
      return next;
    });
  }, []);

  const openProject = useCallback(async (path: string) => {
    const p = await api.OpenProject(path);
    setProject(p);
    setSettings((prev) => ({
      ...prev,
      activeProject: path,
      recentProjects: [path, ...(prev.recentProjects || []).filter((r) => r !== path)].slice(0, 10),
    } as main.Settings));
    setView("project");
  }, []);

  const closeProject = useCallback(() => {
    setProject(null);
    update({ activeProject: "" });
    setView("dashboard");
  }, [update]);

  const jump = useCallback((v: ViewId, value: string) => {
    setFocus({ view: v, value });
    setView(v);
  }, []);

  const value = useMemo<Ctx>(() => ({
    view, go: setView, host, settings, update, project, openProject, closeProject,
    recent: settings.recentProjects || [], palette, setPalette, focus, jump,
  }), [view, host, settings, update, project, openProject, closeProject, palette, focus, jump]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
