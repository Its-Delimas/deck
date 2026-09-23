import { useEffect, useState } from "react";
import { useApp } from "../../lib/app";
import { hottest, useMetrics } from "../../lib/store";
import { bits, duration, pct, temp } from "../../lib/format";
import { Dot, Tooltip } from "../ui";
import { IconArrowDown, IconArrowUp } from "../ui/icons";

/** Always-visible vitals. Health is a single glance, bottom-left to bottom-right. */
export function StatusBar() {
  const m = useMetrics();
  const { host, settings } = useApp();
  const [clock, setClock] = useState(() => new Date().toTimeString().slice(0, 5));

  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toTimeString().slice(0, 5)), 20000);
    return () => clearInterval(id);
  }, []);

  const cpu = m?.cpu.usage ?? 0;
  const mem = m?.memory.percent ?? 0;
  const hot = hottest(m);
  const health = cpu > 92 || mem > 94 ? "danger" : cpu > 75 || mem > 85 || hot > 85 ? "warn" : "ok";
  const healthLabel = health === "ok" ? "Healthy" : health === "warn" ? "Under load" : "Saturated";

  return (
    <footer className="statusbar">
      <Tooltip content={`CPU ${pct(cpu)} · Memory ${pct(mem)}${hot ? ` · ${temp(hot, settings.tempUnit as "c" | "f")}` : ""}`}>
        <div className="statusbar__item">
          <Dot tone={health} pulse={health !== "ok"} />
          <span style={{ color: "var(--fg-2)" }}>{healthLabel}</span>
        </div>
      </Tooltip>
      <span className="statusbar__sep" />
      <div className="statusbar__item">CPU <span className="num">{pct(cpu)}</span></div>
      <div className="statusbar__item">MEM <span className="num">{pct(mem)}</span></div>
      {m?.gpus?.[0] && <div className="statusbar__item">GPU <span className="num">{pct(m.gpus[0].usage)}</span></div>}
      {hot > 0 && <div className="statusbar__item">TEMP <span className="num">{temp(hot, settings.tempUnit as "c" | "f")}</span></div>}
      <span className="statusbar__sep" />
      <div className="statusbar__item"><IconArrowDown size={11} /><span className="num">{bits(m?.network.rxRate)}</span></div>
      <div className="statusbar__item"><IconArrowUp size={11} /><span className="num">{bits(m?.network.txRate)}</span></div>

      <div className="spacer" />
      {host && (
        <>
          <div className="statusbar__item truncate">{host.user}@{host.hostname}</div>
          <span className="statusbar__sep" />
          <div className="statusbar__item">{host.platform} · {host.kernel}</div>
          <span className="statusbar__sep" />
        </>
      )}
      <Tooltip content="System uptime">
        <div className="statusbar__item">up <span className="num">{duration(m?.uptime)}</span></div>
      </Tooltip>
      <span className="statusbar__sep" />
      <div className="statusbar__item num">{clock}</div>
    </footer>
  );
}
