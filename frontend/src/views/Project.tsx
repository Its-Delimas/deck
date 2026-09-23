import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../wailsjs/go/main/App";
import type { main } from "../../wailsjs/go/models";
import type { LogLine } from "../lib/types";
import { EventsOff, EventsOn } from "../../wailsjs/runtime/runtime";
import { useApp } from "../lib/app";
import { usePoll } from "../lib/hooks";
import { ago, basename, bytes, pct, tildePath, timeWithMs } from "../lib/format";
import { Badge, Button, Dot, Empty, Panel, Tooltip, useToast } from "../components/ui";
import {
  IconExternal, IconGit, IconPlay, IconProject, IconRefresh, IconStop, IconTerminal, IconTrash,
} from "../components/ui/icons";

const ROLE_LABEL: Record<string, string> = {
  frontend: "Frontend", backend: "Backend", database: "Database", worker: "Worker", other: "Process",
};

/** Guesses what a process is doing for the project from its port and binary. */
function roleOf(port: number, name: string, label: string): string {
  const l = `${label} ${name}`.toLowerCase();
  if (/postgres|mysql|mongo|redis|clickhouse/.test(l)) return "database";
  if (/vite|next|nuxt|webpack|angular|svelte|5173|3000/.test(l) || port === 5173 || port === 3000) return "frontend";
  if (/api|server|uvicorn|gunicorn|go|rails|php/.test(l)) return "backend";
  return "other";
}

export function Project() {
  const { project, openProject, recent, host, go, closeProject } = useApp();
  const toast = useToast();
  const [output, setOutput] = useState<LogLine[]>([]);
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const outRef = useRef<HTMLDivElement>(null);

  const { data: state, refresh } = usePoll<main.ProjectState | null>(
    () => (project ? api.GetProjectState(project.path) : Promise.resolve(null)),
    2000,
    [project?.path],
  );

  useEffect(() => {
    if (!project) api.DiscoverProjects().then((p) => setDiscovered(p.map((x) => x.path))).catch(() => {});
  }, [project]);

  useEffect(() => {
    EventsOn("logs:lines", (id: string, batch: LogLine[]) => {
      if (!id.startsWith("script:")) return;
      setOutput((prev) => prev.concat(batch).slice(-800));
    });
    EventsOn("logs:closed", (id: string) => {
      if (id.startsWith("script:")) setRunningScript(null);
    });
    return () => {
      EventsOff("logs:lines");
      EventsOff("logs:closed");
    };
  }, []);

  useEffect(() => {
    const el = outRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output]);

  const run = useCallback(async (command: string) => {
    if (!project) return;
    const id = `script:${project.name}`;
    await api.LogStop(id);
    setOutput([]);
    setRunningScript(command);
    try {
      await api.RunScript(project.path, command, id);
      toast(`Running ${command}`, "ok");
    } catch (e) {
      setRunningScript(null);
      toast(String(e), "danger");
    }
  }, [project, toast]);

  const stop = useCallback(async () => {
    if (!project) return;
    await api.LogStop(`script:${project.name}`);
    setRunningScript(null);
  }, [project]);

  const grouped = useMemo(() => {
    const ports = state?.ports ?? [];
    const map = new Map<string, typeof ports>();
    for (const p of ports) {
      const role = roleOf(p.port, p.process, p.label);
      map.set(role, [...(map.get(role) ?? []), p]);
    }
    return [...map.entries()].sort((a, b) =>
      ["frontend", "backend", "database", "other"].indexOf(a[0]) -
      ["frontend", "backend", "database", "other"].indexOf(b[0]));
  }, [state?.ports]);

  if (!project) {
    return (
      <div className="view">
        <header className="view__head">
          <h1 className="view__title">Project</h1>
          <div className="view__tools">
            <Button size="sm" variant="primary" icon={<IconProject size={12} />} onClick={async () => {
              const dir = await api.PickProject();
              if (dir) await openProject(dir);
            }}>
              Open project
            </Button>
          </div>
        </header>
        <div className="view__body">
          {recent.length === 0 && discovered.length === 0 ? (
            <Empty
              icon={<IconProject size={15} />}
              title="No project open"
              text="Open a project directory and deck will track the processes it starts, the ports they bind, its services and its git state in one place."
            />
          ) : (
            <div className="grid grid--half" style={{ alignItems: "start" }}>
              {recent.length > 0 && (
                <Panel title="Recent">
                  <div className="env">
                    {recent.map((p) => (
                      <button key={p} className="env__row" style={{ width: "100%", border: 0, background: "none", cursor: "pointer" }} onClick={() => openProject(p)}>
                        <IconGit size={12} style={{ color: "var(--fg-4)" }} />
                        <span style={{ color: "var(--fg)" }}>{basename(p)}</span>
                        <span className="env__proc truncate mono">{tildePath(p, host?.home ?? "")}</span>
                      </button>
                    ))}
                  </div>
                </Panel>
              )}
              <Panel title="Discovered repositories" subtitle={`${discovered.length}`}>
                <div className="env">
                  {discovered.slice(0, 20).map((p) => (
                    <button key={p} className="env__row" style={{ width: "100%", border: 0, background: "none", cursor: "pointer" }} onClick={() => openProject(p)}>
                      <IconGit size={12} style={{ color: "var(--fg-4)" }} />
                      <span style={{ color: "var(--fg)" }}>{basename(p)}</span>
                      <span className="env__proc truncate mono">{tildePath(p, host?.home ?? "")}</span>
                    </button>
                  ))}
                  {discovered.length === 0 && <Empty title="Nothing found" text="No git repositories were found in your home directory." />}
                </div>
              </Panel>
            </div>
          )}
        </div>
      </div>
    );
  }

  const git = project.git;

  return (
    <div className="view">
      <div className="proj-head">
        <div style={{ minWidth: 0 }}>
          <div className="proj-name">{project.name}</div>
          <div className="proj-path truncate">{tildePath(project.path, host?.home ?? "")}</div>
          <div className="stack">
            {project.stack?.map((s) => <Badge key={s}>{s}</Badge>)}
            {git && (
              <>
                <Badge tone="accent"><IconGit size={10} /> {git.branch}</Badge>
                {git.clean
                  ? <Badge tone="ok">clean</Badge>
                  : <Badge tone="warn">{[git.modified && `${git.modified} modified`, git.staged && `${git.staged} staged`, git.untracked && `${git.untracked} new`].filter(Boolean).join(" · ")}</Badge>}
                {git.ahead > 0 && <Badge tone="info">↑{git.ahead}</Badge>}
                {git.behind > 0 && <Badge tone="info">↓{git.behind}</Badge>}
              </>
            )}
          </div>
        </div>

        <div className="proj-stats">
          <div className="proj-stat">
            <div className="proj-stat__label">CPU</div>
            <div className="proj-stat__value num">{pct(state?.cpu ?? 0, 1)}</div>
          </div>
          <div className="proj-stat">
            <div className="proj-stat__label">Memory</div>
            <div className="proj-stat__value num">{bytes(state?.memory ?? 0)}</div>
          </div>
          <div className="proj-stat">
            <div className="proj-stat__label">Processes</div>
            <div className="proj-stat__value num">{state?.processes?.length ?? 0}</div>
          </div>
          <div className="proj-stat">
            <div className="proj-stat__label">Ports</div>
            <div className="proj-stat__value num">{state?.ports?.length ?? 0}</div>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <Tooltip content="Open a shell in this project">
          <Button size="sm" icon={<IconTerminal size={12} />} onClick={() => go("terminal")}>Terminal</Button>
        </Tooltip>
        <Button size="sm" variant="ghost" icon={<IconRefresh size={12} />} onClick={refresh}>Refresh</Button>
        <span className="spacer" />
        {git?.commit && (
          <span className="toolbar__count truncate" title={git.message}>
            {git.commit} · {git.message} · {git.author} · {ago(git.when)}
          </span>
        )}
        <Button size="sm" variant="ghost" onClick={closeProject}>Close</Button>
      </div>

      <div className="view__body">
        <div className="grid grid--main" style={{ alignItems: "start" }}>
          <Panel title="Running" subtitle={`${state?.processes?.length ?? 0} processes attached to this project`}>
            {grouped.length === 0 && (state?.processes?.length ?? 0) === 0 ? (
              <Empty
                icon={<IconPlay size={15} />}
                title="Nothing is running"
                text="Start a script below and deck will attribute its processes, ports and resource usage to this project."
              />
            ) : (
              <>
                {grouped.map(([role, ports]) => (
                  <div key={role}>
                    <div className="group-title">{ROLE_LABEL[role] ?? role}</div>
                    {ports.map((p) => (
                      <div className="env__row" key={`${p.proto}-${p.port}`} style={{ margin: "0 4px" }}>
                        <Dot tone="ok" pulse />
                        <span style={{ color: "var(--fg)", marginLeft: 3 }}>{p.label || p.process}</span>
                        <span className="mono dim" style={{ fontSize: "var(--fs-xs)" }}>{p.process}</span>
                        <span className="spacer" />
                        <span className="env__port num">{p.port}</span>
                        <Tooltip content={`Open http://localhost:${p.port}`}>
                          <button className="iconbtn" onClick={() => api.OpenURL(`http://localhost:${p.port}`)} aria-label="Open">
                            <IconExternal size={12} />
                          </button>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                ))}
                {(state?.processes?.length ?? 0) > 0 && (
                  <>
                    <div className="group-title">Processes</div>
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: "40%" }}>Process</th>
                          <th style={{ width: 66 }}>PID</th>
                          <th className="right" style={{ width: 70 }}>CPU</th>
                          <th className="right" style={{ width: 82 }}>Memory</th>
                          <th style={{ width: 40 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {state!.processes.slice(0, 12).map((p) => (
                          <tr key={p.pid}>
                            <td className="truncate" style={{ color: "var(--fg)" }}>{p.name}{p.kind && <span className="tag">{p.kind}</span>}</td>
                            <td className="num dim">{p.pid}</td>
                            <td className="right num">{pct(p.cpu, 1)}</td>
                            <td className="right num">{bytes(p.memRss)}</td>
                            <td className="right">
                              <Tooltip content="Terminate">
                                <button className="iconbtn" onClick={() => api.KillProcess(p.pid, "term").then(refresh)} aria-label="Terminate">
                                  <IconTrash size={12} />
                                </button>
                              </Tooltip>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}
          </Panel>

          <Panel title="Scripts" subtitle={`${project.scripts?.length ?? 0}`}>
            {project.scripts?.length ? (
              <div className="env">
                {project.scripts.map((s) => (
                  <div className="env__row" key={`${s.source}-${s.name}`}>
                    <Badge>{s.source}</Badge>
                    <span style={{ color: "var(--fg)" }}>{s.name}</span>
                    <span className="env__proc truncate mono">{s.command}</span>
                    <Tooltip content={`Run ${s.command}`}>
                      <button className="iconbtn" onClick={() => run(s.command)} aria-label={`Run ${s.name}`}>
                        <IconPlay size={11} />
                      </button>
                    </Tooltip>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="No scripts found" text="deck reads package.json scripts, Makefile targets and docker compose files." />
            )}
          </Panel>
        </div>

        <Panel
          title="Output"
          subtitle={runningScript ?? undefined}
          actions={
            <>
              {runningScript && <Button size="sm" variant="danger" icon={<IconStop size={11} />} onClick={stop}>Stop</Button>}
              <Button size="sm" variant="ghost" icon={<IconTrash size={12} />} onClick={() => setOutput([])} aria-label="Clear" />
            </>
          }
        >
          {output.length === 0 ? (
            <Empty title="No script output" text="Run a script and its stdout and stderr will stream here." />
          ) : (
            <div className="log-list" ref={outRef} style={{ maxHeight: 280 }}>
              {output.map((l, i) => (
                <div className="log-line" data-level={l.level} key={i} style={{ gridTemplateColumns: "82px minmax(0,1fr)" }}>
                  <span className="log-line__time">{timeWithMs(l.time)}</span>
                  <span className="log-line__msg">{l.message}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
