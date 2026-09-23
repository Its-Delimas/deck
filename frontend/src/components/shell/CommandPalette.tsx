import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { useApp, type ViewId } from "../../lib/app";
import * as api from "../../../wailsjs/go/main/App";
import type { netinfo, proc, services as svc } from "../../../wailsjs/go/models";
import { basename, bytes, pct } from "../../lib/format";
import { Kbd } from "../ui";
import {
  IconDashboard, IconExternal, IconGit, IconInfo, IconLogs, IconNetwork, IconProcesses, IconProject,
  IconRestart, IconSearch, IconServices, IconSettings, IconStorage, IconTerminal, IconTrash,
} from "../ui/icons";

type Action = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: JSX.Element;
  keywords?: string;
  run: () => void | Promise<void>;
};

/** Subsequence match with a bias towards prefix and word-boundary hits. */
function score(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 1000 - t.length;
  const direct = t.indexOf(q);
  if (direct >= 0) return 700 - direct - t.length * 0.1;
  let qi = 0;
  let points = 0;
  let prev = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      points += prev === i - 1 ? 6 : 2;
      if (i === 0 || t[i - 1] === " " || t[i - 1] === "/" || t[i - 1] === "-") points += 4;
      prev = i;
      qi++;
    }
  }
  return qi === q.length ? points : -1;
}

export function CommandPalette() {
  const { palette, setPalette, go, openProject, project, recent, jump, update, settings } = useApp();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [procs, setProcs] = useState<proc.Info[]>([]);
  const [ports, setPorts] = useState<netinfo.Conn[]>([]);
  const [servicesList, setServices] = useState<svc.Service[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Data is fetched once per opening, not on every keystroke.
  useEffect(() => {
    if (!palette) return;
    setQuery("");
    setIndex(0);
    inputRef.current?.focus();
    api.ListProcesses().then((p) => setProcs(p.slice(0, 250))).catch(() => {});
    api.ListPorts().then(setPorts).catch(() => {});
    api.ListServices().then(setServices).catch(() => {});
    api.DiscoverProjects().then((list) => setProjects(list.map((p) => p.path))).catch(() => {});
  }, [palette]);

  const actions = useMemo<Action[]>(() => {
    const nav: [ViewId, string, JSX.Element][] = [
      ["dashboard", "Go to Dashboard", <IconDashboard size={14} key="d" />],
      ["processes", "Go to Processes", <IconProcesses size={14} key="p" />],
      ["network", "Go to Network", <IconNetwork size={14} key="n" />],
      ["storage", "Go to Storage", <IconStorage size={14} key="s" />],
      ["services", "Go to Services", <IconServices size={14} key="v" />],
      ["terminal", "Go to Terminal", <IconTerminal size={14} key="t" />],
      ["logs", "Go to Logs", <IconLogs size={14} key="l" />],
      ["project", "Go to Project", <IconProject size={14} key="j" />],
      ["about", "Go to This machine", <IconInfo size={14} key="a" />],
      ["settings", "Go to Settings", <IconSettings size={14} key="g" />],
    ];

    const out: Action[] = nav.map(([id, label, icon], i) => ({
      id: `nav:${id}`, group: "Navigation", label, icon,
      hint: i < 7 ? `Ctrl ${i + 1}` : undefined,
      run: () => go(id),
    }));

    const seen = new Set<string>();
    for (const path of [...recent, ...projects]) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({
        id: `proj:${path}`, group: "Projects", label: basename(path), hint: path,
        icon: <IconGit size={14} />, keywords: path,
        run: () => openProject(path),
      });
    }
    out.push({
      id: "proj:pick", group: "Projects", label: "Open project folder…", icon: <IconProject size={14} />,
      run: async () => {
        const dir = await api.PickProject();
        if (dir) await openProject(dir);
      },
    });

    for (const p of ports) {
      out.push({
        id: `port:${p.proto}:${p.port}`, group: "Ports",
        label: `Port ${p.port} → ${p.label || p.process || "unknown"}`,
        hint: p.pid ? `pid ${p.pid}` : p.proto, icon: <IconNetwork size={14} />,
        keywords: `${p.process} ${p.cmd} ${p.label}`,
        run: () => jump("network", String(p.port)),
      });
      if (p.port > 1024 && p.state === "LISTEN") {
        out.push({
          id: `open:${p.port}`, group: "Ports", label: `Open http://localhost:${p.port}`,
          icon: <IconExternal size={14} />, keywords: "browser open url",
          run: () => api.OpenURL(`http://localhost:${p.port}`),
        });
      }
    }

    for (const s of servicesList) {
      const verb = s.status === "running" ? "Restart" : "Start";
      out.push({
        id: `svc:${s.id}`, group: "Services", label: `${verb} ${s.name}`,
        hint: s.source, icon: <IconRestart size={14} />, keywords: `${s.kind} ${s.detail}`,
        run: () => api.ServiceAction(s.id, s.source, s.status === "running" ? "restart" : "start"),
      });
    }

    for (const p of procs.slice(0, 120)) {
      out.push({
        id: `proc:${p.pid}`, group: "Processes",
        label: `${p.name}`, hint: `${p.pid} · ${pct(p.cpu)} · ${bytes(p.memRss)}`,
        icon: <IconProcesses size={14} />, keywords: p.cmdline,
        run: () => jump("processes", String(p.pid)),
      });
    }
    for (const p of procs.slice(0, 40)) {
      out.push({
        id: `kill:${p.pid}`, group: "Processes", label: `Kill ${p.name} (${p.pid})`,
        icon: <IconTrash size={14} />, keywords: `terminate ${p.cmdline}`,
        run: () => api.KillProcess(p.pid, "term"),
      });
    }

    out.push({
      id: "about:health", group: "Machine", label: "Run hardware health check",
      icon: <IconInfo size={14} />, keywords: "battery cpu disk memory test benchmark",
      run: () => jump("about", "run"),
    });
    out.push({
      id: "set:density", group: "Settings",
      label: `Switch to ${settings.density === "compact" ? "comfortable" : "compact"} density`,
      icon: <IconSettings size={14} />,
      run: () => update({ density: settings.density === "compact" ? "comfortable" : "compact" }),
    });
    if (project) {
      out.push({
        id: "proj:close", group: "Projects", label: `Close ${project.name}`,
        icon: <IconProject size={14} />, run: () => update({ activeProject: "" }),
      });
    }
    return out;
  }, [go, jump, openProject, ports, procs, projects, project, recent, servicesList, settings.density, update]);

  const results = useMemo(() => {
    const scored = actions
      .map((a) => ({ a, s: Math.max(score(query, a.label), score(query, a.keywords ?? "") * 0.7) }))
      .filter((r) => r.s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, 60);
    return scored.map((r) => r.a);
  }, [actions, query]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [index, results]);

  if (!palette) return null;

  const close = () => setPalette(false);
  const runAt = (i: number) => {
    const action = results[i];
    if (!action) return;
    close();
    void action.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(index);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  let lastGroup = "";
  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette__input">
          <IconSearch size={15} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search processes, ports, services, projects…"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <div className="palette__list" ref={listRef}>
          {results.length === 0 && (
            <div style={{ padding: "18px 12px", color: "var(--fg-4)", fontSize: "var(--fs-sm)" }}>
              No matches for “{query}”.
            </div>
          )}
          {results.map((a, i) => {
            const header = a.group !== lastGroup ? a.group : null;
            lastGroup = a.group;
            return (
              <div key={a.id}>
                {header && <div className="palette__group">{header}</div>}
                <button
                  className="palette__item"
                  data-active={i === index}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => runAt(i)}
                >
                  {a.icon}
                  <span className="truncate">{a.label}</span>
                  {a.hint && <span className="palette__desc truncate">{a.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette__foot">
          <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate</span>
          <span><Kbd>↵</Kbd> run</span>
          <span><Kbd>esc</Kbd> dismiss</span>
          <span className="spacer" />
          <span>{results.length} results</span>
        </div>
      </div>
    </>
  );
}
