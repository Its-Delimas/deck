import { useApp } from "../lib/app";
import * as api from "../../wailsjs/go/main/App";
import { bytes, duration } from "../lib/format";
import { useMetrics } from "../lib/store";
import { Badge, Button, Segmented, Switch, useToast } from "../components/ui";
import { IconRefresh } from "../components/ui/icons";

const ACCENTS = [
  { id: "indigo", color: "#6e7bff" },
  { id: "violet", color: "#a371f7" },
  { id: "cyan", color: "#2dd4bf" },
  { id: "amber", color: "#f0a742" },
  { id: "rose", color: "#fb7185" },
];

export function Settings() {
  const { settings, update, host, recent } = useApp();
  const m = useMetrics();
  const toast = useToast();

  return (
    <div className="view">
      <header className="view__head">
        <h1 className="view__title">Settings</h1>
        <span className="view__meta">Preferences are stored in your user config directory</span>
      </header>

      <div className="view__body">
        <div className="settings">
          <h3>Appearance</h3>
          <div className="setting">
            <div className="setting__text">
              <div className="setting__name">Accent colour</div>
              <div className="setting__desc">Used for selection, focus and primary actions.</div>
            </div>
            <div className="setting__control swatches">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  className="swatch"
                  style={{ background: a.color, color: a.color }}
                  data-active={settings.accent === a.id}
                  aria-label={a.id}
                  onClick={() => update({ accent: a.id })}
                />
              ))}
            </div>
          </div>
          <div className="setting">
            <div className="setting__text">
              <div className="setting__name">Density</div>
              <div className="setting__desc">Compact reduces row height and padding for smaller displays.</div>
            </div>
            <div className="setting__control">
              <Segmented
                value={settings.density}
                options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]}
                onChange={(v) => update({ density: v })}
              />
            </div>
          </div>
          <div className="setting">
            <div className="setting__text">
              <div className="setting__name">Temperature unit</div>
            </div>
            <div className="setting__control">
              <Segmented
                value={settings.tempUnit}
                options={[{ value: "c", label: "°C" }, { value: "f", label: "°F" }]}
                onChange={(v) => update({ tempUnit: v })}
              />
            </div>
          </div>

          <h3>Monitoring</h3>
          <div className="setting">
            <div className="setting__text">
              <div className="setting__name">Sample rate</div>
              <div className="setting__desc">How often metrics are collected. Faster sampling costs slightly more CPU.</div>
            </div>
            <div className="setting__control">
              <Segmented
                value={String(settings.pollInterval)}
                options={[
                  { value: "500", label: "2 Hz" },
                  { value: "1000", label: "1 Hz" },
                  { value: "2000", label: "0.5 Hz" },
                  { value: "5000", label: "0.2 Hz" },
                ]}
                onChange={(v) => { update({ pollInterval: Number(v) }); api.SetPollInterval(Number(v)); }}
              />
            </div>
          </div>
          <div className="setting">
            <div className="setting__text">
              <div className="setting__name">Show system processes</div>
              <div className="setting__desc">Include idle root-owned processes in the process list.</div>
            </div>
            <div className="setting__control">
              <Switch checked={settings.showSystemProcs} onChange={(v) => update({ showSystemProcs: v })} label="Show system processes" />
            </div>
          </div>
          <div className="setting">
            <div className="setting__text">
              <div className="setting__name">Confirm before terminating</div>
              <div className="setting__desc">Ask before sending SIGTERM or SIGKILL to a process.</div>
            </div>
            <div className="setting__control">
              <Switch checked={settings.confirmKill} onChange={(v) => update({ confirmKill: v })} label="Confirm before terminating" />
            </div>
          </div>

          <h3>Projects</h3>
          <div className="setting">
            <div className="setting__text">
              <div className="setting__name">Recent projects</div>
              <div className="setting__desc">{recent.length ? recent.join(", ") : "None yet."}</div>
            </div>
            <div className="setting__control">
              <Button size="sm" onClick={() => { update({ recentProjects: [], activeProject: "" }); toast("Recent projects cleared", "ok"); }}>
                Clear
              </Button>
            </div>
          </div>

          <h3>Machine</h3>
          <div className="setting">
            <div className="setting__text">
              <div className="setting__name">{host?.hostname}</div>
              <div className="setting__desc">
                {host?.platform} {host?.version} · kernel {host?.kernel} · {host?.arch}
              </div>
            </div>
            <div className="setting__control row">
              <Badge mono>{host?.cores}C / {host?.threads}T</Badge>
              <Badge mono>{bytes(host?.memTotal)}</Badge>
            </div>
          </div>
          <div className="setting">
            <div className="setting__text">
              <div className="setting__name">{host?.cpuModel}</div>
              <div className="setting__desc">
                Uptime {duration(m?.uptime)} · {m?.cpu.procs ?? 0} processes · shell {host?.shell}
              </div>
            </div>
            <div className="setting__control">
              <Button size="sm" variant="ghost" icon={<IconRefresh size={12} />} onClick={() => location.reload()}>Reload UI</Button>
            </div>
          </div>

          <h3>Keyboard</h3>
          <div className="setting"><div className="setting__text"><div className="setting__name">Command palette</div></div><div className="setting__control"><Badge mono>Ctrl K</Badge></div></div>
          <div className="setting"><div className="setting__text"><div className="setting__name">Switch view</div></div><div className="setting__control"><Badge mono>Ctrl 1–7</Badge></div></div>
          <div className="setting"><div className="setting__text"><div className="setting__name">Collapse sidebar</div></div><div className="setting__control"><Badge mono>Ctrl B</Badge></div></div>
          <div className="setting"><div className="setting__text"><div className="setting__name">Focus filter</div></div><div className="setting__control"><Badge mono>/</Badge></div></div>
          <div className="setting"><div className="setting__text"><div className="setting__name">Terminate selected process</div></div><div className="setting__control"><Badge mono>Del</Badge></div></div>
        </div>
      </div>
    </div>
  );
}
