import { useEffect, useMemo, useState } from "react";
import * as api from "../../wailsjs/go/main/App";
import { useApp } from "../lib/app";
import { useDebounced, usePoll } from "../lib/hooks";
import { history, useMetrics } from "../lib/store";
import { bits, bytes, tildePath } from "../lib/format";
import { Chart } from "../components/chart/Chart";
import { Badge, Button, Empty, Panel, SearchInput, Segmented, Tabs, Tooltip, useContextMenu, useToast } from "../components/ui";
import { IconArrowDown, IconArrowUp, IconCopy, IconExternal, IconNetwork, IconTrash } from "../components/ui/icons";

type Tab = "ports" | "connections" | "interfaces";

const HTTP_HINTS = ["Vite", "Next.js", "Nuxt", "Dev server", "HTTP", "Webpack", "Angular", "Python API", "Node"];

export function Network() {
  const m = useMetrics();
  const { host, focus, jump } = useApp();
  const toast = useToast();
  const menu = useContextMenu();
  const [tab, setTab] = useState<Tab>("ports");
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 120);
  const [scope, setScope] = useState<"dev" | "all">("dev");

  const { data: conns, refresh } = usePoll(() => api.ListConnections(), 2500, []);

  useEffect(() => {
    if (focus?.view === "network" && focus.value) setQuery(focus.value);
  }, [focus]);

  const listening = useMemo(() => {
    const seen = new Set<string>();
    return (conns ?? [])
      .filter((c) => c.state === "LISTEN")
      .filter((c) => {
        const key = `${c.proto.replace("6", "")}:${c.port}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .filter((c) => (scope === "all" ? true : c.port >= 1024 && c.pid > 0))
      .filter((c) => matches(c, search))
      .sort((a, b) => a.port - b.port);
  }, [conns, scope, search]);

  const established = useMemo(
    () => (conns ?? []).filter((c) => c.state === "ESTABLISHED").filter((c) => matches(c, search)).slice(0, 500),
    [conns, search],
  );

  const kill = async (pid: number, name: string) => {
    try {
      await api.KillProcess(pid, "term");
      toast(`Sent SIGTERM to ${name} (${pid})`, "ok");
      setTimeout(refresh, 300);
    } catch (e) {
      toast(String(e), "danger");
    }
  };

  return (
    <div className="view">
      <header className="view__head">
        <h1 className="view__title">Network</h1>
        <span className="view__meta num">
          {listening.length} listening · {established.length} established
        </span>
        <div className="view__tools">
          {tab === "ports" && (
            <Segmented
              value={scope}
              options={[{ value: "dev", label: "Developer" }, { value: "all", label: "All" }]}
              onChange={setScope}
            />
          )}
          <SearchInput value={query} onValue={setQuery} placeholder="Port, process or address" />
        </div>
      </header>

      <div className="view__body" style={{ flex: "none", paddingBottom: 0 }}>
        <Panel
          title="Throughput"
          subtitle={m ? `${bytes(m.network.rxTotal)} in · ${bytes(m.network.txTotal)} out since boot` : undefined}
          actions={
            <span className="row" style={{ gap: 10, fontSize: "var(--fs-xs)" }}>
              <span className="row" style={{ gap: 3, color: "var(--c5)" }}>
                <IconArrowDown size={11} /><span className="num">{bits(m?.network.rxRate)}</span>
              </span>
              <span className="row" style={{ gap: 3, color: "var(--c6)" }}>
                <IconArrowUp size={11} /><span className="num">{bits(m?.network.txRate)}</span>
              </span>
            </span>
          }
        >
          <div style={{ padding: "12px 12px 8px" }}>
            <Chart
              series={[
                { data: history.netRx, color: "var(--c5)", label: "in" },
                { data: history.netTx, color: "var(--c6)", label: "out" },
              ]}
              height={92}
              times={history.time}
              format={(v) => bits(v)}
            />
            <div className="axis"><span>3 min ago</span><span className="spacer" /><span>now</span></div>
          </div>
        </Panel>
      </div>

      <Tabs
        value={tab}
        options={[
          { value: "ports", label: "Ports", badge: listening.length },
          { value: "connections", label: "Connections", badge: established.length },
          { value: "interfaces", label: "Interfaces", badge: m?.network.interfaces?.length ?? 0 },
        ]}
        onChange={setTab}
      />

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {tab === "ports" && (
          listening.length === 0 ? (
            <Empty
              icon={<IconNetwork size={15} />}
              title={search ? "No matching ports" : "No developer ports are open"}
              text={search
                ? "Nothing is listening on a port matching that search."
                : "Start a dev server, API or database and the port, its process and its project will be listed here."}
              action={scope === "dev" ? <Button size="sm" onClick={() => setScope("all")}>Show system ports</Button> : undefined}
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 82 }}>Port</th>
                  <th style={{ width: 130 }}>Service</th>
                  <th style={{ width: 150 }}>Process</th>
                  <th style={{ width: 70 }}>PID</th>
                  <th style={{ width: 84 }}>Bind</th>
                  <th>Project</th>
                  <th style={{ width: 92 }} />
                </tr>
              </thead>
              <tbody>
                {listening.map((c) => {
                  const openable = HTTP_HINTS.includes(c.label) || (c.port >= 3000 && c.port <= 9999);
                  return (
                    <tr
                      key={`${c.proto}-${c.port}`}
                      onContextMenu={(e) =>
                        menu.open(e, [
                          { type: "label", label: `Port ${c.port}` },
                          { type: "item", label: "Copy URL", icon: <IconCopy size={13} />, onSelect: () => navigator.clipboard.writeText(`http://localhost:${c.port}`) },
                          { type: "item", label: "Open in browser", icon: <IconExternal size={13} />, onSelect: () => api.OpenURL(`http://localhost:${c.port}`) },
                          { type: "separator" },
                          { type: "item", label: `Inspect ${c.process}`, onSelect: () => jump("processes", String(c.pid)), disabled: !c.pid },
                          { type: "item", label: `Terminate ${c.process}`, danger: true, icon: <IconTrash size={13} />, onSelect: () => kill(c.pid, c.process), disabled: !c.pid },
                        ])
                      }
                    >
                      <td>
                        <span className="num" style={{ color: "var(--accent)", fontWeight: 500 }}>{c.port}</span>
                        <span className="tag">{c.proto}</span>
                      </td>
                      <td style={{ color: "var(--fg)" }}>{c.label || "—"}</td>
                      <td className="truncate">{c.process || <span className="dim">unknown</span>}</td>
                      <td className="num dim">{c.pid || "—"}</td>
                      <td className="mono dim" style={{ fontSize: "var(--fs-xs)" }}>{c.local}</td>
                      <td className="mono dim truncate" style={{ fontSize: "var(--fs-xs)" }} title={c.cwd}>
                        {c.cwd && c.cwd !== host?.home ? tildePath(c.cwd, host?.home ?? "") : "—"}
                      </td>
                      <td className="right">
                        <div className="row" style={{ justifyContent: "flex-end", gap: 2 }}>
                          {openable && (
                            <Tooltip content={`Open http://localhost:${c.port}`}>
                              <button className="iconbtn" onClick={() => api.OpenURL(`http://localhost:${c.port}`)} aria-label="Open">
                                <IconExternal size={12} />
                              </button>
                            </Tooltip>
                          )}
                          {c.pid > 0 && (
                            <Tooltip content={`Terminate ${c.process}`}>
                              <button className="iconbtn" onClick={() => kill(c.pid, c.process)} aria-label="Terminate">
                                <IconTrash size={12} />
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {tab === "connections" && (
          established.length === 0 ? (
            <Empty icon={<IconNetwork size={15} />} title="No established connections" text="Outbound and inbound sockets will appear here as they are opened." />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Local</th>
                  <th style={{ width: 200 }}>Remote</th>
                  <th style={{ width: 70 }}>Proto</th>
                  <th style={{ width: 150 }}>Process</th>
                  <th style={{ width: 70 }}>PID</th>
                  <th>Command</th>
                </tr>
              </thead>
              <tbody>
                {established.map((c, i) => (
                  <tr key={i}>
                    <td className="mono">{c.local}:{c.port}</td>
                    <td className="mono" style={{ color: "var(--fg)" }}>{c.remote}:{c.remotePort}</td>
                    <td className="dim">{c.proto}</td>
                    <td className="truncate">{c.process || <span className="dim">—</span>}</td>
                    <td className="num dim">{c.pid || "—"}</td>
                    <td className="dim mono truncate" style={{ fontSize: "var(--fs-xs)" }}>{c.cmd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === "interfaces" && (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Interface</th>
                <th style={{ width: 90 }}>State</th>
                <th style={{ width: 150 }}>Address</th>
                <th className="right" style={{ width: 110 }}>In</th>
                <th className="right" style={{ width: 110 }}>Out</th>
                <th className="right" style={{ width: 120 }}>Total in</th>
                <th className="right" style={{ width: 120 }}>Total out</th>
              </tr>
            </thead>
            <tbody>
              {(m?.network.interfaces ?? []).map((i) => (
                <tr key={i.name}>
                  <td className="mono" style={{ color: "var(--fg)" }}>{i.name}</td>
                  <td><Badge tone={i.up ? "ok" : "default"}>{i.up ? "up" : "down"}</Badge></td>
                  <td className="mono dim">{i.addr || "—"}</td>
                  <td className="right num">{bits(i.rxRate)}</td>
                  <td className="right num">{bits(i.txRate)}</td>
                  <td className="right num dim">{bytes(i.rxTotal)}</td>
                  <td className="right num dim">{bytes(i.txTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu.node}
    </div>
  );
}

function matches(c: { port: number; process: string; cmd: string; label: string; remote: string; local: string }, q: string) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    String(c.port).includes(s) ||
    c.process?.toLowerCase().includes(s) ||
    c.cmd?.toLowerCase().includes(s) ||
    c.label?.toLowerCase().includes(s) ||
    c.remote?.includes(s) ||
    c.local?.includes(s)
  );
}
