import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../../wailsjs/go/main/App";
import type { storage } from "../../wailsjs/go/models";
import { useApp } from "../lib/app";
import { useMetrics } from "../lib/store";
import { ago, bytes, pct, tildePath } from "../lib/format";
import { Ring } from "../components/chart/Chart";
import { Badge, Button, Empty, Meter, Panel, Tooltip, useToast } from "../components/ui";
import { IconChevronRight, IconFile, IconFolder, IconRefresh, IconStorage } from "../components/ui/icons";

export function Storage() {
  const m = useMetrics();
  const { host, project } = useApp();
  const toast = useToast();
  const [path, setPath] = useState<string>("");
  const [result, setResult] = useState<storage.ScanResult | null>(null);
  const [loading, setLoading] = useState(false);

  const scan = useCallback(async (target: string) => {
    setLoading(true);
    try {
      const r = await api.ScanPath(target);
      setResult(r);
      setPath(r.path);
    } catch (e) {
      toast(`Cannot read ${target}: ${String(e)}`, "danger");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    api.HomeDir().then((home) => scan(home)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const crumbs = useMemo(() => {
    if (!path) return [];
    const parts = path.split("/").filter(Boolean);
    const out: { label: string; full: string }[] = [{ label: "/", full: "/" }];
    let acc = "";
    for (const p of parts) {
      acc += `/${p}`;
      out.push({ label: p, full: acc });
    }
    return out;
  }, [path]);

  const entries = result?.entries ?? [];

  return (
    <div className="view">
      <header className="view__head">
        <h1 className="view__title">Storage</h1>
        <span className="view__meta num">
          {result ? `${bytes(result.total)} · ${result.items.toLocaleString()} files` : "—"}
        </span>
        <div className="view__tools">
          {project && (
            <Button size="sm" icon={<IconFolder size={12} />} onClick={() => scan(project.path)}>
              Scan {project.name}
            </Button>
          )}
          <Button size="sm" icon={<IconFolder size={12} />} onClick={async () => {
            const dir = await api.PickProject();
            if (dir) void scan(dir);
          }}>
            Choose folder
          </Button>
          <Tooltip content="Rescan">
            <Button size="sm" variant="ghost" icon={<IconRefresh size={13} />} busy={loading} onClick={() => scan(path)} aria-label="Rescan" />
          </Tooltip>
        </div>
      </header>

      <div className="view__body">
        <Panel title="Volumes" subtitle={`${m?.disks?.length ?? 0} mounted`}>
          <div className="disks">
            {(m?.disks ?? []).map((d) => (
              <div className="disks__item" key={d.mount}>
                <Ring value={d.percent} size={44} />
                <div className="disks__meta">
                  <div className="row">
                    <span className="disks__mount truncate">{d.mount}</span>
                    <Badge mono>{d.fstype}</Badge>
                  </div>
                  <div className="dim num" style={{ fontSize: "var(--fs-xs)" }}>{bytes(d.free)} free of {bytes(d.total)}</div>
                  <div className="dim mono truncate" style={{ fontSize: "var(--fs-xs)" }}>{d.device}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <div style={{ height: "var(--sp-4)" }} />

        <div className="grid grid--main" style={{ marginBottom: 0, alignItems: "start" }}>
          <Panel
            title={
              <span className="crumbs">
                {crumbs.map((c, i) => (
                  <span key={c.full} className="row" style={{ gap: 0 }}>
                    {i > 0 && <IconChevronRight size={10} style={{ opacity: 0.4 }} />}
                    <button onClick={() => scan(c.full)}>{c.label}</button>
                  </span>
                ))}
              </span>
            }
            subtitle={result?.reclaimable ? `${bytes(result.reclaimable)} in build artefacts` : undefined}
            actions={
              result?.parent && result.parent !== result.path ? (
                <Button size="sm" variant="ghost" onClick={() => scan(result.parent)}>Up</Button>
              ) : undefined
            }
          >
            {loading && entries.length === 0 ? (
              <Empty title="Measuring…" text="Walking the directory tree and totalling file sizes." />
            ) : entries.length === 0 ? (
              <Empty icon={<IconStorage size={15} />} title="Empty directory" text="Nothing to measure here." />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "40%" }}>Name</th>
                    <th className="right" style={{ width: 90 }}>Size</th>
                    <th style={{ width: 150 }}>Share</th>
                    <th className="right" style={{ width: 80 }}>Items</th>
                    <th style={{ width: 100 }}>Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.slice(0, 300).map((e) => (
                    <tr
                      key={e.path}
                      style={{ cursor: e.isDir ? "pointer" : "default" }}
                      onClick={() => e.isDir && scan(e.path)}
                    >
                      <td className="truncate" style={{ color: "var(--fg)" }}>
                        <span style={{ display: "inline-flex", verticalAlign: -2, marginRight: 7, color: "var(--fg-4)" }}>
                          {e.isDir ? <IconFolder size={12} /> : <IconFile size={12} />}
                        </span>
                        {e.name}
                        {e.kind === "artifact" && <span className="tag">reclaimable</span>}
                      </td>
                      <td className="right num">{bytes(e.size)}</td>
                      <td>
                        <div className="bar-cell">
                          <Meter value={e.percent} tone={e.percent > 45 ? "warn" : undefined} />
                          <span className="num dim" style={{ fontSize: "var(--fs-xs)", minWidth: 34, textAlign: "right" }}>
                            {pct(e.percent)}
                          </span>
                        </div>
                      </td>
                      <td className="right num dim">{e.items.toLocaleString()}</td>
                      <td className="dim" style={{ fontSize: "var(--fs-xs)" }}>{ago(e.modTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Largest files" subtitle={result?.largest?.length ? `${result.largest.length}` : undefined}>
            {result?.largest?.length ? (
              <div className="env">
                {result.largest.slice(0, 16).map((f) => (
                  <div className="env__row" key={f.path} title={f.path}>
                    <IconFile size={12} style={{ color: "var(--fg-4)", flex: "none" }} />
                    <span className="truncate" style={{ color: "var(--fg)" }}>{f.name}</span>
                    <span className="spacer" />
                    <span className="num dim">{bytes(f.size)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon={<IconFile size={15} />} title="No files measured yet" text="Scan a directory to find the biggest files inside it." />
            )}
          </Panel>
        </div>

        {result?.path && (
          <div className="dim mono" style={{ marginTop: 10, fontSize: "var(--fs-xs)" }}>
            {tildePath(result.path, host?.home ?? "")}
          </div>
        )}
      </div>
    </div>
  );
}
