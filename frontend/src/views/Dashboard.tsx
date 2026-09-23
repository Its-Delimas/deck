import { useMemo, type JSX } from "react";
import * as api from "../../wailsjs/go/main/App";
import { useApp } from "../lib/app";
import { history, hottest, useMetrics } from "../lib/store";
import { usePoll } from "../lib/hooks";
import { bits, bytes, bytesParts, duration, pct, rate, temp } from "../lib/format";
import { Chart, CoreBars, Ring, Sparkline } from "../components/chart/Chart";
import { Badge, Button, Dot, Empty, Meter, Panel, Segmented, Tooltip } from "../components/ui";
import {
  IconAlert, IconArrowDown, IconArrowUp, IconCheck, IconCpu, IconExternal, IconGpu,
  IconMemory, IconNetwork, IconStorage, IconThermo,
} from "../components/ui/icons";

/** A compact vital: label, dominant value, trend, and the series behind it. */
function Tile({ label, icon, value, unit, delta, series, color, tone, meter, onClick }: {
  label: string; icon: JSX.Element; value: string; unit?: string; delta?: number;
  series: number[]; color: string; tone?: "ok" | "warn" | "danger"; meter?: number; onClick?: () => void;
}) {
  const dir = delta == null || Math.abs(delta) < 0.35 ? null : delta > 0 ? "up" : "down";
  return (
    <button className="tile" onClick={onClick} data-clickable={!!onClick}>
      <div className="tile__head">
        {icon}
        <span className="tile__label">{label}</span>
        {dir && (
          <span className={`tile__delta tile__delta--${dir}`}>
            {dir === "up" ? <IconArrowUp size={10} /> : <IconArrowDown size={10} />}
            <span className="num">{Math.abs(delta!).toFixed(1)}</span>
          </span>
        )}
      </div>
      <div className="tile__value">
        <span className="num">{value}</span>
        {unit && <span className="tile__unit">{unit}</span>}
      </div>
      {meter != null ? (
        <Meter value={meter} tone={tone} />
      ) : (
        <div className="tile__spark"><Sparkline data={series} color={color} width={120} height={20} /></div>
      )}
    </button>
  );
}

function delta(series: number[]): number | undefined {
  if (series.length < 4) return undefined;
  return series[series.length - 1] - series[series.length - 4];
}

export function Dashboard() {
  const m = useMetrics();
  const { go, settings, jump, update } = useApp();
  const { data: procs } = usePoll(() => api.ListProcesses(), 2000, []);
  const { data: ports } = usePoll(() => api.ListPorts(), 4000, []);
  const { data: services } = usePoll(() => api.ListServices(), 6000, []);

  const top = useMemo(() => (procs ?? []).slice(0, 8), [procs]);
  const devPorts = useMemo(
    () => (ports ?? []).filter((p) => p.state === "LISTEN" && p.pid > 0 && p.port > 1000).slice(0, 8),
    [ports],
  );
  const runningServices = useMemo(() => (services ?? []).filter((s) => s.status === "running"), [services]);

  const hot = hottest(m);
  const gpu = m?.gpus?.[0];
  const unit = (settings.tempUnit as "c" | "f") || "c";

  // "Is something abnormal?" — one list, ranked, rather than scattered warnings.
  const alerts = useMemo(() => {
    const out: { tone: "warn" | "danger"; title: string; detail: string; action?: () => void }[] = [];
    if (!m) return out;
    if (m.cpu.usage > 88) out.push({ tone: "danger", title: "CPU saturated", detail: `${pct(m.cpu.usage)} sustained · load ${m.cpu.load1.toFixed(2)}`, action: () => go("processes") });
    if (m.memory.percent > 90) out.push({ tone: "danger", title: "Memory pressure", detail: `${bytes(m.memory.used)} of ${bytes(m.memory.total)} used`, action: () => go("processes") });
    else if (m.memory.percent > 80) out.push({ tone: "warn", title: "Memory filling up", detail: `${bytes(m.memory.available)} available`, action: () => go("processes") });
    if (m.swap.total > 0 && m.swap.percent > 25) out.push({ tone: "warn", title: "Swapping", detail: `${bytes(m.swap.used)} swapped out` });
    if (hot > 85) out.push({ tone: "danger", title: "Thermal load", detail: `Hottest sensor at ${temp(hot, unit)}` });
    for (const d of m.disks ?? []) {
      if (d.percent > 92) out.push({ tone: "danger", title: `${d.mount} almost full`, detail: `${bytes(d.free)} free of ${bytes(d.total)}`, action: () => go("storage") });
      else if (d.percent > 85) out.push({ tone: "warn", title: `${d.mount} filling up`, detail: `${bytes(d.free)} free`, action: () => go("storage") });
    }
    for (const s of services ?? []) {
      if (s.status === "failed") out.push({ tone: "danger", title: `${s.name} failed`, detail: s.detail || s.source, action: () => go("services") });
    }
    const hogs = (procs ?? []).filter((p) => p.cpu > 85);
    for (const p of hogs.slice(0, 2)) {
      out.push({ tone: "warn", title: `${p.name} at ${pct(p.cpu)} CPU`, detail: `pid ${p.pid} · ${bytes(p.memRss)}`, action: () => jump("processes", String(p.pid)) });
    }
    const zombies = (procs ?? []).filter((p) => p.state === "zombie").length;
    if (zombies > 2) out.push({ tone: "warn", title: `${zombies} zombie processes`, detail: "Parents are not reaping children", action: () => go("processes") });
    return out.slice(0, 6);
  }, [m, procs, services, hot, unit, go, jump]);

  const [memValue, memUnit] = bytesParts(m?.memory.used);

  return (
    <div className="view">
      <header className="view__head">
        <h1 className="view__title">Dashboard</h1>
        <span className="view__meta">
          {m ? `up ${duration(m.uptime)} · ${m.cpu.threads} threads · ${bytes(m.memory.total)}` : "connecting…"}
        </span>
        <div className="view__tools">
          <Segmented
            value={String(settings.pollInterval)}
            options={[
              { value: "500", label: "2 Hz" },
              { value: "1000", label: "1 Hz" },
              { value: "3000", label: "0.3 Hz" },
            ]}
            onChange={(v) => update({ pollInterval: Number(v) })}
          />
        </div>
      </header>

      <div className="view__body">
        <div className="tiles">
          <Tile
            label="CPU" icon={<IconCpu size={13} />} value={pct(m?.cpu.usage)} delta={delta(history.cpu)}
            series={history.cpu} color="var(--c1)" onClick={() => go("processes")}
          />
          <Tile
            label="Memory" icon={<IconMemory size={13} />} value={memValue} unit={memUnit}
            delta={delta(history.mem)} series={history.mem} color="var(--c2)"
            meter={m?.memory.percent ?? 0}
            tone={(m?.memory.percent ?? 0) > 90 ? "danger" : (m?.memory.percent ?? 0) > 78 ? "warn" : "ok"}
            onClick={() => go("processes")}
          />
          {gpu ? (
            <Tile label="GPU" icon={<IconGpu size={13} />} value={pct(gpu.usage)} delta={delta(history.gpu)}
              series={history.gpu} color="var(--c6)" />
          ) : (
            <Tile label="Swap" icon={<IconMemory size={13} />} value={bytes(m?.swap.used)} series={history.swap}
              color="var(--c6)" meter={m?.swap.percent ?? 0} />
          )}
          <Tile
            label="Network" icon={<IconNetwork size={13} />} value={bits(m?.network.rxRate)}
            series={history.netRx} color="var(--c5)" onClick={() => go("network")}
          />
          <Tile
            label="Disk I/O" icon={<IconStorage size={13} />} value={rate(m?.diskIO.writeRate)}
            series={history.diskWrite} color="var(--c3)" onClick={() => go("storage")}
          />
        </div>

        <div className="grid grid--main">
          <Panel
            title="Processor"
            subtitle={m ? `${m.cpu.cores} cores · ${m.cpu.threads} threads${m.cpu.freq ? ` · ${(m.cpu.freq / 1000).toFixed(1)} GHz` : ""}` : undefined}
            actions={
              <span className="row" style={{ gap: 10, color: "var(--fg-4)", fontSize: "var(--fs-xs)" }}>
                <Tooltip content="Load average over 1, 5 and 15 minutes">
                  <span className="num">
                    {m ? `${m.cpu.load1.toFixed(2)} ${m.cpu.load5.toFixed(2)} ${m.cpu.load15.toFixed(2)}` : "—"}
                  </span>
                </Tooltip>
                {hot > 0 && (
                  <span className="row" style={{ gap: 3 }}>
                    <IconThermo size={11} />
                    <span className="num" style={{ color: hot > 80 ? "var(--warn)" : undefined }}>{temp(hot, unit)}</span>
                  </span>
                )}
              </span>
            }
          >
            <div style={{ padding: "12px 12px 10px" }}>
              <Chart
                series={[
                  { data: history.cpu, color: "var(--c1)", label: "CPU" },
                  { data: history.mem, color: "var(--c2)", label: "MEM", fill: false, dashed: true },
                ]}
                height={112}
                max={100}
                times={history.time}
                format={(v) => `${v.toFixed(1)}%`}
              />
              <div className="axis"><span>3 min ago</span><span className="spacer" /><span>now</span></div>
              <div style={{ marginTop: 10 }}>
                <CoreBars values={m?.cpu.perCore ?? []} />
              </div>
            </div>
          </Panel>

          <Panel title="Attention" subtitle={alerts.length ? `${alerts.length}` : undefined}>
            {alerts.length === 0 ? (
              <Empty
                icon={<IconCheck size={15} />}
                title="Nothing needs you"
                text="CPU, memory, disks, thermals and services are all within normal ranges."
              />
            ) : (
              <ul className="alerts">
                {alerts.map((a, i) => (
                  <li key={i}>
                    <button onClick={a.action} disabled={!a.action}>
                      <IconAlert size={13} className={`alert--${a.tone}`} />
                      <span className="alerts__text">
                        <span className="alerts__title">{a.title}</span>
                        <span className="alerts__detail truncate">{a.detail}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid grid--main">
          <Panel
            title="Top processes"
            actions={<Button size="sm" variant="ghost" onClick={() => go("processes")}>View all</Button>}
          >
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "42%" }}>Process</th>
                  <th style={{ width: 62 }}>PID</th>
                  <th className="right" style={{ width: 66 }}>CPU</th>
                  <th className="right" style={{ width: 78 }}>Memory</th>
                  <th style={{ width: 90 }}>User</th>
                </tr>
              </thead>
              <tbody>
                {top.map((p) => (
                  <tr key={p.pid} onClick={() => jump("processes", String(p.pid))} style={{ cursor: "pointer" }}>
                    <td className="truncate" style={{ color: "var(--fg)" }}>
                      {p.name}
                      {p.kind && <span className="tag">{p.kind}</span>}
                    </td>
                    <td className="num dim">{p.pid}</td>
                    <td className="right num" style={{ color: p.cpu > 50 ? "var(--warn)" : undefined }}>{pct(p.cpu, 1)}</td>
                    <td className="right num">{bytes(p.memRss)}</td>
                    <td className="dim truncate">{p.user}</td>
                  </tr>
                ))}
                {top.length === 0 && (
                  <tr><td colSpan={5}><span className="dim">Reading process table…</span></td></tr>
                )}
              </tbody>
            </table>
          </Panel>

          <Panel
            title="Developer environment"
            subtitle={`${devPorts.length} ports · ${runningServices.length} services`}
            actions={<Button size="sm" variant="ghost" onClick={() => go("network")}>Ports</Button>}
          >
            {devPorts.length === 0 && runningServices.length === 0 ? (
              <Empty
                icon={<IconNetwork size={15} />}
                title="No developer services detected"
                text="Start a dev server, database or container and it will appear here with its port and owning process."
              />
            ) : (
              <div className="env">
                {devPorts.map((p) => (
                  <div className="env__row" key={`${p.proto}-${p.port}`}>
                    <span className="env__port num">{p.port}</span>
                    <span className="env__arrow">→</span>
                    <span className="env__name truncate">{p.label || p.process || "unknown"}</span>
                    <span className="env__proc truncate mono dim">{p.process}</span>
                    <Tooltip content={`Open http://localhost:${p.port}`}>
                      <button className="iconbtn" onClick={() => api.OpenURL(`http://localhost:${p.port}`)} aria-label="Open in browser">
                        <IconExternal size={12} />
                      </button>
                    </Tooltip>
                  </div>
                ))}
                {runningServices.slice(0, 5).map((s) => (
                  <div className="env__row" key={s.id}>
                    <Dot tone="ok" />
                    <span className="env__name truncate" style={{ marginLeft: 4 }}>{s.name}</span>
                    <Badge>{s.source}</Badge>
                    <span className="env__proc truncate dim">{s.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Storage" subtitle={`${m?.disks?.length ?? 0} volumes`} actions={<Button size="sm" variant="ghost" onClick={() => go("storage")}>Analyse</Button>}>
          <div className="disks">
            {(m?.disks ?? []).map((d) => (
              <div className="disks__item" key={d.mount}>
                <Ring value={d.percent} />
                <div className="disks__meta">
                  <div className="row">
                    <span className="disks__mount truncate">{d.mount}</span>
                    <Badge mono>{d.fstype}</Badge>
                  </div>
                  <div className="dim num" style={{ fontSize: "var(--fs-xs)" }}>
                    {bytes(d.free)} free of {bytes(d.total)}
                  </div>
                  <div className="dim num" style={{ fontSize: "var(--fs-xs)" }}>
                    R {rate(d.readRate)} · W {rate(d.writeRate)}
                  </div>
                </div>
              </div>
            ))}
            {!m?.disks?.length && <Empty title="No volumes" text="No mounted filesystems were reported." />}
          </div>
        </Panel>
      </div>
    </div>
  );
}
