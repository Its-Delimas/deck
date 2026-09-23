import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../wailsjs/go/main/App";
import type { proc } from "../../wailsjs/go/models";
import { useApp } from "../lib/app";
import { useDebounced, usePoll } from "../lib/hooks";
import { ago, bytes, pct, shortCmd } from "../lib/format";
import {
  Badge, Button, Dialog, Empty, Meter, SearchInput, Segmented, Tooltip, useContextMenu, useToast,
} from "../components/ui";
import {
  IconChevronDown, IconChevronRight, IconCopy, IconProcesses, IconRefresh, IconTrash,
} from "../components/ui/icons";

type SortKey = "cpu" | "memRss" | "name" | "pid" | "user" | "threads";
type Filter = "all" | "dev" | "user" | "active";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "dev", label: "Developer" },
  { value: "user", label: "Mine" },
  { value: "active", label: "Active" },
];

const DEV_KINDS = new Set(["node", "python", "go", "database", "container", "editor"]);

export function Processes() {
  const { host, focus, settings, update } = useApp();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 120);
  const [sort, setSort] = useState<SortKey>("cpu");
  const [desc, setDesc] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [tree, setTree] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<proc.Detail | null>(null);
  const [confirm, setConfirm] = useState<{ pid: number; name: string; mode: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menu = useContextMenu();

  const { data: procs, refresh } = usePoll(() => api.ListProcesses(), 1500, []);

  // A command-palette jump pre-selects a PID.
  useEffect(() => {
    if (focus?.view === "processes" && focus.value) {
      setSelected(Number(focus.value));
      setQuery("");
    }
  }, [focus]);

  useEffect(() => {
    if (selected == null) {
      setDetail(null);
      return;
    }
    let alive = true;
    const load = () => api.ProcessDetail(selected).then((d) => alive && setDetail(d)).catch(() => alive && setDetail(null));
    load();
    const id = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [selected]);

  const rows = useMemo(() => {
    let list = procs ?? [];
    if (filter === "dev") list = list.filter((p) => DEV_KINDS.has(p.kind));
    else if (filter === "user") list = list.filter((p) => p.user === host?.user);
    else if (filter === "active") list = list.filter((p) => p.cpu > 0.5 || p.memRss > 200 * 1024 * 1024);
    if (!settings.showSystemProcs) list = list.filter((p) => p.user !== "root" || p.cpu > 1);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.cmdline.toLowerCase().includes(q) || String(p.pid) === q);
    }
    const dir = desc ? -1 : 1;
    return [...list].sort((a, b) => {
      const x = a[sort];
      const y = b[sort];
      if (typeof x === "string" && typeof y === "string") return x.localeCompare(y) * dir;
      return ((x as number) - (y as number)) * dir;
    });
  }, [procs, filter, search, sort, desc, host?.user, settings.showSystemProcs]);

  // Tree mode nests children under the parents present in the current result set.
  const treeRows = useMemo(() => {
    if (!tree) return rows;
    const byPid = new Map(rows.map((p) => [p.pid, p]));
    const children = new Map<number, proc.Info[]>();
    const roots: proc.Info[] = [];
    for (const p of rows) {
      if (byPid.has(p.ppid) && p.ppid !== p.pid) {
        const list = children.get(p.ppid) ?? [];
        list.push(p);
        children.set(p.ppid, list);
      } else roots.push(p);
    }
    const out: (proc.Info & { depth?: number; kids?: number })[] = [];
    const walk = (list: proc.Info[], depth: number) => {
      for (const p of list) {
        const kids = children.get(p.pid) ?? [];
        out.push(Object.assign(Object.create(Object.getPrototypeOf(p)), p, { depth, kids: kids.length }));
        if (kids.length && expanded.has(p.pid)) walk(kids, depth + 1);
      }
    };
    walk(roots, 0);
    return out;
  }, [rows, tree, expanded]);

  const kill = useCallback(async (pid: number, name: string, mode: string) => {
    try {
      await api.KillProcess(pid, mode);
      toast(`Sent SIG${mode.toUpperCase()} to ${name} (${pid})`, "ok");
      setTimeout(refresh, 250);
    } catch (e) {
      toast(`Could not signal ${name}: ${String(e)}`, "danger");
    }
  }, [refresh, toast]);

  const requestKill = useCallback((pid: number, name: string, mode: string) => {
    if (settings.confirmKill && mode !== "cont" && mode !== "stop") setConfirm({ pid, name, mode });
    else void kill(pid, name, mode);
  }, [kill, settings.confirmKill]);

  // Keyboard: type to search, arrows to move, Delete to terminate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT") return;
      if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key === "f")) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = treeRows.findIndex((p) => p.pid === selected);
        const next = Math.max(0, Math.min(treeRows.length - 1, (idx < 0 ? -1 : idx) + (e.key === "ArrowDown" ? 1 : -1)));
        setSelected(treeRows[next]?.pid ?? null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected != null) {
        const p = treeRows.find((r) => r.pid === selected);
        if (p) requestKill(p.pid, p.name, e.shiftKey ? "kill" : "term");
      }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [treeRows, selected, requestKill]);

  const header = (key: SortKey, label: string, extra?: React.CSSProperties, right?: boolean) => (
    <th
      data-sortable="true"
      data-active={sort === key}
      className={right ? "right" : undefined}
      style={extra}
      onClick={() => {
        if (sort === key) setDesc((d) => !d);
        else {
          setSort(key);
          setDesc(key !== "name" && key !== "user");
        }
      }}
    >
      {label}
      {sort === key && <span className="sort-arrow">{desc ? "↓" : "↑"}</span>}
    </th>
  );

  return (
    <div className="view">
      <header className="view__head">
        <h1 className="view__title">Processes</h1>
        <span className="view__meta num">{rows.length} of {procs?.length ?? 0}</span>
        <div className="view__tools">
          <Segmented value={filter} options={FILTERS} onChange={setFilter} />
          <Segmented
            value={tree ? "tree" : "flat"}
            options={[{ value: "flat", label: "Flat" }, { value: "tree", label: "Tree" }]}
            onChange={(v) => setTree(v === "tree")}
          />
          <SearchInput inputRef={searchRef} value={query} onValue={setQuery} placeholder="Filter processes" shortcut="/" />
          <Tooltip content="Refresh now">
            <Button size="sm" variant="ghost" icon={<IconRefresh size={13} />} onClick={refresh} aria-label="Refresh" />
          </Tooltip>
        </div>
      </header>

      <div className={`split ${selected != null ? "" : "split--none"}`} style={selected == null ? { gridTemplateColumns: "1fr" } : undefined}>
        <div style={{ overflow: "auto", minHeight: 0 }}>
          <table className="table">
            <thead>
              <tr>
                {header("name", "Process", { width: "34%" })}
                {header("pid", "PID", { width: 66 })}
                {header("cpu", "CPU", { width: 92 }, true)}
                {header("memRss", "Memory", { width: 96 }, true)}
                {header("threads", "Thr", { width: 52 }, true)}
                <th style={{ width: 78 }}>Status</th>
                {header("user", "User", { width: 92 })}
                <th>Command</th>
              </tr>
            </thead>
            <tbody>
              {treeRows.slice(0, 600).map((p) => {
                const row = p as proc.Info & { depth?: number; kids?: number };
                return (
                  <tr
                    key={p.pid}
                    data-selected={selected === p.pid}
                    onClick={() => setSelected(p.pid)}
                    onContextMenu={(e) =>
                      menu.open(e, [
                        { type: "label", label: `${p.name} · ${p.pid}` },
                        { type: "item", label: "Copy PID", icon: <IconCopy size={13} />, onSelect: () => navigator.clipboard.writeText(String(p.pid)) },
                        { type: "item", label: "Copy command", icon: <IconCopy size={13} />, onSelect: () => navigator.clipboard.writeText(p.cmdline || p.name) },
                        { type: "separator" },
                        { type: "item", label: "Suspend (SIGSTOP)", onSelect: () => requestKill(p.pid, p.name, "stop") },
                        { type: "item", label: "Resume (SIGCONT)", onSelect: () => requestKill(p.pid, p.name, "cont") },
                        { type: "item", label: "Interrupt (SIGINT)", onSelect: () => requestKill(p.pid, p.name, "int") },
                        { type: "separator" },
                        { type: "item", label: "Terminate", danger: true, hint: "Del", icon: <IconTrash size={13} />, onSelect: () => requestKill(p.pid, p.name, "term") },
                        { type: "item", label: "Force kill", danger: true, hint: "⇧Del", onSelect: () => requestKill(p.pid, p.name, "kill") },
                      ])
                    }
                  >
                    <td className="truncate" style={{ color: "var(--fg)", paddingLeft: tree ? 12 + (row.depth ?? 0) * 14 : undefined }}>
                      {tree && (row.kids ? (
                        <button
                          className="tree-toggle"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              next.has(p.pid) ? next.delete(p.pid) : next.add(p.pid);
                              return next;
                            });
                          }}
                        >
                          {expanded.has(p.pid) ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />}
                        </button>
                      ) : <span className="tree-spacer" />)}
                      {p.name}
                      {p.kind && <span className="tag">{p.kind}</span>}
                    </td>
                    <td className="num dim">{p.pid}</td>
                    <td className="right">
                      <div className="bar-cell" style={{ justifyContent: "flex-end" }}>
                        <span className="num" style={{ color: p.cpu > 70 ? "var(--danger)" : p.cpu > 30 ? "var(--warn)" : undefined }}>
                          {pct(p.cpu, 1)}
                        </span>
                      </div>
                    </td>
                    <td className="right num">{bytes(p.memRss)}</td>
                    <td className="right num dim">{p.threads}</td>
                    <td>
                      <span className={p.state === "running" ? "lvl-info" : p.state === "zombie" ? "lvl-error" : "dim"} style={{ fontSize: "var(--fs-xs)" }}>
                        {p.state}
                      </span>
                    </td>
                    <td className="dim truncate">{p.user}</td>
                    <td className="dim mono truncate" style={{ fontSize: "var(--fs-xs)" }}>{shortCmd(p.cmdline)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <Empty
              icon={<IconProcesses size={15} />}
              title={search ? `No process matches “${search}”` : "Nothing to show"}
              text={search ? "Try part of the binary name, a PID, or a fragment of the command line." : "Adjust the filter to widen the selection."}
              action={search ? <Button size="sm" onClick={() => setQuery("")}>Clear filter</Button> : undefined}
            />
          )}
        </div>

        {selected != null && (
          <aside className="detail">
            {detail ? (
              <>
                <div className="detail__head">
                  <div className="detail__title">{detail.name}</div>
                  <div className="detail__sub">{detail.cmdline || detail.exe}</div>
                  <div className="row" style={{ marginTop: 8, gap: 5 }}>
                    <Badge mono>pid {detail.pid}</Badge>
                    {detail.kind && <Badge tone="accent">{detail.kind}</Badge>}
                    <Badge tone={detail.state === "running" ? "ok" : detail.state === "zombie" ? "danger" : "default"}>{detail.state}</Badge>
                  </div>
                </div>

                <div className="detail__section">
                  <div className="detail__label">Resources</div>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                    <span className="dim">CPU</span><span className="num">{pct(detail.cpu, 1)}</span>
                  </div>
                  <Meter value={detail.cpu} tone={detail.cpu > 70 ? "danger" : detail.cpu > 30 ? "warn" : "ok"} />
                  <div className="row" style={{ justifyContent: "space-between", margin: "8px 0 4px" }}>
                    <span className="dim">Memory</span><span className="num">{bytes(detail.memRss)} · {pct(detail.memPercent, 1)}</span>
                  </div>
                  <Meter value={detail.memPercent} />
                </div>

                <div className="detail__section">
                  <div className="detail__label">Details</div>
                  <dl className="kv">
                    <dt>Parent</dt><dd className="num">{detail.ppid}</dd>
                    <dt>User</dt><dd>{detail.user}</dd>
                    <dt>Threads</dt><dd className="num">{detail.threads}</dd>
                    <dt>Open files</dt><dd className="num">{detail.openFds}</dd>
                    <dt>Started</dt><dd>{ago(detail.startTime)}</dd>
                    <dt>Disk read</dt><dd className="num">{bytes(detail.readBytes)}</dd>
                    <dt>Disk write</dt><dd className="num">{bytes(detail.writeBytes)}</dd>
                    <dt>Working dir</dt><dd className="mono truncate" title={detail.cwd}>{detail.cwd || "—"}</dd>
                    <dt>Executable</dt><dd className="mono truncate" title={detail.exe}>{detail.exe || "—"}</dd>
                  </dl>
                </div>

                {detail.children?.length > 0 && (
                  <div className="detail__section">
                    <div className="detail__label">Children · {detail.children.length}</div>
                    {detail.children.slice(0, 8).map((c) => (
                      <button
                        key={c.pid}
                        className="env__row"
                        style={{ width: "100%", border: 0, background: "none", cursor: "pointer" }}
                        onClick={() => setSelected(c.pid)}
                      >
                        <span className="num dim" style={{ minWidth: 42 }}>{c.pid}</span>
                        <span className="truncate">{c.name}</span>
                        <span className="spacer" />
                        <span className="num dim">{pct(c.cpu, 1)}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="detail__actions">
                  <Button size="sm" onClick={() => requestKill(detail.pid, detail.name, "int")}>Interrupt</Button>
                  <Button size="sm" onClick={() => requestKill(detail.pid, detail.name, "stop")}>Suspend</Button>
                  <Button size="sm" variant="danger" icon={<IconTrash size={12} />} onClick={() => requestKill(detail.pid, detail.name, "term")}>
                    Terminate
                  </Button>
                </div>
              </>
            ) : (
              <Empty title="Process ended" text="It is no longer in the process table." />
            )}
          </aside>
        )}
      </div>

      {menu.node}

      <Dialog
        open={!!confirm}
        title={confirm?.mode === "kill" ? "Force kill process" : "Terminate process"}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <Button size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (confirm) void kill(confirm.pid, confirm.name, confirm.mode);
                setConfirm(null);
              }}
            >
              {confirm?.mode === "kill" ? "Force kill" : "Terminate"}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {confirm?.mode === "kill"
            ? <>SIGKILL cannot be caught. <strong>{confirm?.name}</strong> (pid {confirm?.pid}) will stop immediately and unsaved work will be lost.</>
            : <>Send SIGTERM to <strong>{confirm?.name}</strong> (pid {confirm?.pid})? It will be asked to shut down cleanly.</>}
        </p>
        <label className="row" style={{ marginTop: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!settings.confirmKill}
            onChange={(e) => update({ confirmKill: !e.target.checked })}
          />
          <span className="dim">Don’t ask again</span>
        </label>
      </Dialog>
    </div>
  );
}
