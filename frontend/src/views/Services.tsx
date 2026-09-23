import { useMemo, useState } from "react";
import * as api from "../../wailsjs/go/main/App";
import type { services as svc } from "../../wailsjs/go/models";
import { usePoll } from "../lib/hooks";
import { Badge, Button, Dialog, Dot, Empty, Panel, SearchInput, Segmented, Tooltip, useToast } from "../components/ui";
import {
  IconContainer, IconDatabase, IconLogs, IconPlay, IconRestart, IconServices, IconStop,
} from "../components/ui/icons";

type Scope = "all" | "running" | "stopped";

const KIND_ORDER = ["database", "cache", "container", "web", "runtime"];

function kindIcon(kind: string) {
  if (kind === "container") return <IconContainer size={13} />;
  if (kind === "database" || kind === "cache") return <IconDatabase size={13} />;
  return <IconServices size={13} />;
}

export function Services() {
  const toast = useToast();
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ service: svc.Service; text: string } | null>(null);

  const { data, refresh } = usePoll(() => api.ListServices(), 4000, []);

  const groups = useMemo(() => {
    const list = (data ?? [])
      .filter((s) => (scope === "all" ? true : scope === "running" ? s.status === "running" : s.status !== "running"))
      .filter((s) => !query || `${s.name} ${s.detail} ${s.kind}`.toLowerCase().includes(query.toLowerCase()));
    const byKind = new Map<string, svc.Service[]>();
    for (const s of list) {
      const arr = byKind.get(s.kind) ?? [];
      arr.push(s);
      byKind.set(s.kind, arr);
    }
    return [...byKind.entries()].sort(
      (a, b) => (KIND_ORDER.indexOf(a[0]) + 10) % 20 - (KIND_ORDER.indexOf(b[0]) + 10) % 20,
    );
  }, [data, scope, query]);

  const act = async (s: svc.Service, action: "start" | "stop" | "restart") => {
    setBusy(`${s.id}:${action}`);
    try {
      await api.ServiceAction(s.id, s.source, action);
      toast(`${s.name} ${action}ed`, "ok");
      setTimeout(refresh, 600);
    } catch (e) {
      toast(`${s.name}: ${String(e).replace(/^Error: /, "")}`, "danger");
    } finally {
      setBusy(null);
    }
  };

  const openLogs = async (s: svc.Service) => {
    try {
      const text = await api.ServiceLogs(s.id, s.source, 300);
      setLogs({ service: s, text: text || "No log output." });
    } catch (e) {
      toast(String(e), "danger");
    }
  };

  const running = (data ?? []).filter((s) => s.status === "running").length;

  return (
    <div className="view">
      <header className="view__head">
        <h1 className="view__title">Services</h1>
        <span className="view__meta num">{running} running · {(data?.length ?? 0) - running} stopped</span>
        <div className="view__tools">
          <Segmented
            value={scope}
            options={[{ value: "all", label: "All" }, { value: "running", label: "Running" }, { value: "stopped", label: "Stopped" }]}
            onChange={setScope}
          />
          <SearchInput value={query} onValue={setQuery} placeholder="Filter services" />
        </div>
      </header>

      <div className="view__body" style={{ padding: 0 }}>
        {groups.length === 0 ? (
          <Empty
            icon={<IconServices size={15} />}
            title="No developer services detected"
            text="deck looks for databases, caches, container runtimes and web servers registered with systemd or Docker. Install or start one and it will appear here."
          />
        ) : (
          groups.map(([kind, list]) => (
            <div key={kind}>
              <div className="group-title">{kindIcon(kind)} {kind}<span className="num" style={{ marginLeft: 2 }}>{list.length}</span></div>
              <div className="svc-grid" style={{ paddingTop: 0 }}>
                {list.map((s) => (
                  <article className="svc" key={`${s.source}:${s.id}`}>
                    <div className="svc__top">
                      <Dot tone={s.status === "running" ? "ok" : s.status === "failed" ? "danger" : "default"} pulse={s.status === "running"} />
                      <span className="svc__name truncate">{s.name}</span>
                      <span className="spacer" />
                      <Badge>{s.source}</Badge>
                    </div>
                    <div className="svc__detail truncate" title={s.detail}>{s.detail || "—"}</div>
                    {s.ports?.length > 0 && (
                      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                        {s.ports.slice(0, 5).map((p) => <Badge key={p} tone="accent" mono>:{p}</Badge>)}
                      </div>
                    )}
                    <div className="svc__foot">
                      {s.status === "running" ? (
                        <>
                          <Button size="sm" icon={<IconRestart size={12} />} busy={busy === `${s.id}:restart`} onClick={() => act(s, "restart")}>
                            Restart
                          </Button>
                          <Button size="sm" variant="ghost" icon={<IconStop size={11} />} busy={busy === `${s.id}:stop`} onClick={() => act(s, "stop")}>
                            Stop
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="primary" icon={<IconPlay size={11} />} busy={busy === `${s.id}:start`} onClick={() => act(s, "start")}>
                          Start
                        </Button>
                      )}
                      <span className="spacer" />
                      <Tooltip content="Recent log output">
                        <Button size="sm" variant="ghost" icon={<IconLogs size={12} />} onClick={() => openLogs(s)} aria-label="Logs" />
                      </Tooltip>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog
        open={!!logs}
        title={logs ? `${logs.service.name} · recent output` : ""}
        width={780}
        onClose={() => setLogs(null)}
        footer={<Button size="sm" onClick={() => setLogs(null)}>Close</Button>}
      >
        <pre
          className="mono"
          style={{
            margin: 0, maxHeight: "46vh", overflow: "auto", fontSize: "var(--fs-xs)",
            lineHeight: 1.55, whiteSpace: "pre-wrap", userSelect: "text", color: "var(--fg-2)",
          }}
        >
          {logs?.text}
        </pre>
      </Dialog>
    </div>
  );
}
