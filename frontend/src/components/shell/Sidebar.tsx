import type { JSX } from "react";
import { useApp, type ViewId } from "../../lib/app";
import { useMetrics } from "../../lib/store";
import { Tooltip } from "../ui";
import {
  IconDashboard, IconLogs, IconNetwork, IconProcesses, IconProject, IconServices,
  IconSettings, IconStorage, IconTerminal,
} from "../ui/icons";

type Item = { id: ViewId; label: string; icon: JSX.Element; meta?: string; key: string };

export function Sidebar({ collapsed, portCount, serviceCount }: {
  collapsed: boolean; portCount: number; serviceCount: number;
}) {
  const { view, go, project, settings } = useApp();
  const m = useMetrics();

  const main: Item[] = [
    { id: "dashboard", label: "Dashboard", icon: <IconDashboard size={14} />, key: "1" },
    { id: "processes", label: "Processes", icon: <IconProcesses size={14} />, meta: m?.cpu.procs ? String(m.cpu.procs) : undefined, key: "2" },
    { id: "network", label: "Network", icon: <IconNetwork size={14} />, meta: portCount ? String(portCount) : undefined, key: "3" },
    { id: "storage", label: "Storage", icon: <IconStorage size={14} />, key: "4" },
    { id: "services", label: "Services", icon: <IconServices size={14} />, meta: serviceCount ? String(serviceCount) : undefined, key: "5" },
  ];
  const tools: Item[] = [
    { id: "terminal", label: "Terminal", icon: <IconTerminal size={14} />, key: "6" },
    { id: "logs", label: "Logs", icon: <IconLogs size={14} />, key: "7" },
  ];

  const render = (item: Item) => {
    const node = (
      <button
        key={item.id}
        className="navitem"
        data-active={view === item.id}
        onClick={() => go(item.id)}
        aria-current={view === item.id ? "page" : undefined}
      >
        {item.icon}
        <span className="navitem__label">{item.label}</span>
        {item.meta && <span className="navitem__meta">{item.meta}</span>}
      </button>
    );
    return collapsed ? (
      <Tooltip key={item.id} content={`${item.label} · Ctrl ${item.key}`} delay={120}>{node}</Tooltip>
    ) : node;
  };

  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="sidebar__group">Machine</div>
      {main.map(render)}

      <div className="sidebar__group">Workspace</div>
      {render({
        id: "project", label: project ? project.name : "Project", icon: <IconProject size={14} />,
        meta: project?.git?.branch ? undefined : "—", key: "`",
      })}
      {tools.map(render)}

      <div className="spacer" />
      {render({ id: "settings", label: "Settings", icon: <IconSettings size={14} />, key: "," })}
      {!collapsed && (
        <div style={{ padding: "8px 8px 2px", color: "var(--fg-4)", fontSize: "var(--fs-xs)" }}>
          {settings.pollInterval ? `${(1000 / settings.pollInterval).toFixed(settings.pollInterval < 1000 ? 1 : 0)} Hz` : ""}
        </div>
      )}
    </nav>
  );
}
