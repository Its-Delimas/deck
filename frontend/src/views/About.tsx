import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../../wailsjs/go/main/App";
import type { health, hwinfo } from "../../wailsjs/go/models";
import { EventsOff, EventsOn } from "../../wailsjs/runtime/runtime";
import { usePoll } from "../lib/hooks";
import { useApp } from "../lib/app";
import { Badge, Button, Dot, Empty, Meter, Panel, Switch, Tooltip, useToast } from "../components/ui";
import {
  IconAlert, IconCheck, IconCopy, IconInfo, IconPlay, IconRefresh, IconStop,
} from "../components/ui/icons";

type Progress = { id: string; label: string; index: number; total: number } | null;

const VERDICT_TONE: Record<string, "ok" | "warn" | "danger" | "accent" | "default"> = {
  ok: "ok", warn: "warn", danger: "danger", info: "accent", skipped: "default",
};

export function About() {
  const { host, focus, version } = useApp();
  const toast = useToast();
  const [sources, setSources] = useState(false);
  const [checks, setChecks] = useState<health.Check[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);

  const { data: report, refresh, loading } = usePoll(() => api.GetMachineReport(), 0, []);
  // The battery is the one part of the inventory that moves, so it refreshes.
  const { data: battery } = usePoll(() => api.GetBattery(), 20000, []);
  const bat = battery ?? report?.battery ?? null;

  useEffect(() => {
    EventsOn("health:progress", (id: string, label: string, index: number, total: number) =>
      setProgress({ id, label, index, total }));
    return () => EventsOff("health:progress");
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setChecks([]);
    setProgress(null);
    try {
      const results = await api.RunHealthCheck();
      setChecks(results);
      const bad = results.filter((c) => c.verdict === "danger").length;
      toast(bad ? `Health check finished — ${bad} problem${bad > 1 ? "s" : ""} found` : "Health check finished", bad ? "danger" : "ok");
    } catch (e) {
      toast(String(e), "danger");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [toast]);

  // The command palette can ask for a run directly.
  useEffect(() => {
    if (focus?.view === "about" && focus.value === "run" && !running && checks.length === 0) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const asText = useMemo(() => buildReport(report, bat, checks), [report, bat, checks]);

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text);
    toast(`${what} copied`, "ok");
  };

  return (
    <div className="view">
      <header className="view__head">
        <h1 className="view__title">About this machine</h1>
        <span className="view__meta">{report ? `${report.vendor} · ${report.form || "computer"}` : "reading hardware…"}</span>
        <div className="view__tools">
          <label className="row" style={{ gap: 6, color: "var(--fg-3)", fontSize: "var(--fs-sm)" }}>
            <Switch checked={sources} onChange={setSources} label="Show sources" />
            Show sources
          </label>
          <Tooltip content="Copy the whole report as text">
            <Button size="sm" icon={<IconCopy size={12} />} onClick={() => copy(asText, "Report")}>Copy report</Button>
          </Tooltip>
          <Tooltip content="Re-read every value">
            <Button size="sm" variant="ghost" icon={<IconRefresh size={13} />} onClick={refresh} aria-label="Refresh" />
          </Tooltip>
        </div>
      </header>

      <div className="view__body">
        <div className="about-hero">
          <div style={{ minWidth: 0 }}>
            <div className="about-model truncate">{report?.model || host?.hostname || "Unknown machine"}</div>
            <div className="about-sub">
              {[report?.vendor, report?.form, host?.platform && `${host.platform} ${host.version}`, `deck ${version}`]
                .filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="about-note">
            <IconInfo size={13} />
            <span>
              Every value below is read live from the kernel and firmware on this machine, with its
              source shown. Nothing is estimated, and nothing is taken from a vendor datasheet.
            </span>
          </div>
        </div>

        <div className="grid grid--main" style={{ alignItems: "start" }}>
          <div style={{ display: "grid", gap: "var(--sp-4)", minWidth: 0 }}>
            {(report?.sections ?? []).map((section) => (
              <Panel
                key={section.id}
                title={section.title}
                actions={
                  <Tooltip content={`Copy ${section.title.toLowerCase()}`}>
                    <button className="iconbtn" aria-label="Copy section"
                      onClick={() => copy(sectionText(section), section.title)}>
                      <IconCopy size={12} />
                    </button>
                  </Tooltip>
                }
              >
                <dl className="spec">
                  {section.fields.map((f, i) => (
                    <div className="spec__row" key={`${f.label}-${i}`}>
                      <dt>{f.label}</dt>
                      <dd>
                        {f.value ? (
                          <>
                            <span className={f.mono ? "mono" : undefined}>{f.value}</span>
                            {f.detail && <span className="spec__detail">{f.detail}</span>}
                          </>
                        ) : (
                          <span className="spec__missing">not available — {f.note}</span>
                        )}
                        {sources && f.source && <span className="spec__source mono">{f.source}</span>}
                      </dd>
                      {f.value && (
                        <button className="iconbtn spec__copy" aria-label={`Copy ${f.label}`}
                          onClick={() => copy(f.value, f.label)}>
                          <IconCopy size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </dl>
              </Panel>
            ))}
            {loading && !report && <Panel title="System"><Empty title="Reading hardware…" /></Panel>}
          </div>

          <div style={{ display: "grid", gap: "var(--sp-4)", minWidth: 0 }}>
            <Panel
              title="Battery"
              subtitle={bat?.present ? bat.name : undefined}
              actions={bat?.present ? (
                <Tooltip content="Copy battery details">
                  <button className="iconbtn" aria-label="Copy battery" onClick={() => copy(batteryText(bat), "Battery")}>
                    <IconCopy size={12} />
                  </button>
                </Tooltip>
              ) : undefined}
            >
              {!bat?.present ? (
                <Empty title="No battery" text={bat?.note || "This machine has no battery device."} />
              ) : (
                <div style={{ padding: "var(--sp-4)" }}>
                  {bat.healthKnown ? (
                    <>
                      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                        <span className="dim">Health</span>
                        <span className="about-health num" data-tone={healthTone(bat.health)}>
                          {bat.health.toFixed(0)}%
                        </span>
                      </div>
                      <Meter value={bat.health} large tone={healthTone(bat.health)} />
                      <div className="spec__detail" style={{ marginTop: 6 }}>
                        holds {bat.fullWh.toFixed(1)} Wh of its {bat.designWh.toFixed(1)} Wh design capacity
                        {bat.health < 100 && ` — ${(100 - bat.health).toFixed(0)}% worn`}
                      </div>
                    </>
                  ) : (
                    <div className="spec__missing">{bat.note}</div>
                  )}

                  <dl className="spec" style={{ marginTop: 14 }}>
                    <Row label="Charge" value={`${bat.percent.toFixed(0)}%`} detail={`${bat.nowWh.toFixed(1)} Wh now`} />
                    <Row label="Status" value={bat.status} detail={bat.onAC ? "AC connected" : "on battery"} />
                    <Row label="Cycles" value={bat.cyclesKnown ? String(bat.cycles) : ""} note="this battery does not report a cycle count" />
                    <Row label="Draw" value={bat.powerW ? `${bat.powerW.toFixed(1)} W` : ""} note="no current reading exposed" />
                    <Row label="Voltage" value={bat.voltageV ? `${bat.voltageV.toFixed(2)} V` : ""} note="not reported" />
                    <Row label="Chemistry" value={bat.technology} note="not reported" />
                    <Row label="Manufacturer" value={bat.manufacturer} note="not reported" />
                    <Row label="Model" value={bat.model} note="not reported" />
                    <Row label="Serial" value={bat.serial} note="not reported" mono />
                    {sources && <Row label="Source" value={bat.source} mono />}
                  </dl>
                </div>
              )}
            </Panel>

            <Panel
              title="Health check"
              subtitle={checks.length ? `${checks.length} measurements` : undefined}
              actions={
                <>
                  {checks.length > 0 && !running && (
                    <Tooltip content="Copy results">
                      <button className="iconbtn" aria-label="Copy results" onClick={() => copy(checksText(checks), "Results")}>
                        <IconCopy size={12} />
                      </button>
                    </Tooltip>
                  )}
                  {running ? (
                    <Button size="sm" variant="danger" icon={<IconStop size={11} />} onClick={() => api.CancelHealthCheck()}>
                      Stop
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" icon={<IconPlay size={11} />} onClick={run}>
                      {checks.length ? "Run again" : "Run health check"}
                    </Button>
                  )}
                </>
              }
            >
              {running ? (
                <div style={{ padding: "var(--sp-4)" }}>
                  <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                    <span className="spinner" />
                    <span>{progress?.label ?? "Starting…"}</span>
                    <span className="spacer" />
                    <span className="num dim">{progress ? `${progress.index}/${progress.total}` : ""}</span>
                  </div>
                  <Meter value={progress ? (progress.index / progress.total) * 100 : 4} />
                  <p className="spec__detail" style={{ marginTop: 10 }}>
                    deck is loading every core, moving real data through memory and the disk, and
                    sampling the battery counter over ten seconds. Expect the fans to spin up.
                  </p>
                </div>
              ) : checks.length === 0 ? (
                <Empty
                  icon={<IconCheck size={15} />}
                  title="No measurements yet"
                  text="The health check runs real work on this machine — CPU load, memory copies, a disk write and read, and a timed battery sample — so the numbers reflect the hardware in front of you, not a specification."
                  action={<Button size="sm" variant="primary" icon={<IconPlay size={11} />} onClick={run}>Run health check</Button>}
                />
              ) : (
                <div className="checks">
                  {checks.map((c) => (
                    <div className="check" key={c.id}>
                      <div className="check__top">
                        {c.verdict === "danger" || c.verdict === "warn" ? (
                          <IconAlert size={12} className={`alert--${c.verdict}`} />
                        ) : (
                          <Dot tone={VERDICT_TONE[c.verdict] ?? "default"} />
                        )}
                        <span className="check__label">{c.label}</span>
                        <span className="spacer" />
                        {c.value ? (
                          <span className="check__value num">{c.value}</span>
                        ) : (
                          <Badge>{c.verdict === "skipped" ? "not available" : c.verdict}</Badge>
                        )}
                      </div>
                      {c.detail && <div className="check__detail">{c.detail}</div>}
                      {c.error && <div className="check__detail lvl-error">{c.error}</div>}
                      {sources && c.method && <div className="check__method mono">{c.method}</div>}
                    </div>
                  ))}
                  <p className="check__footnote">
                    Measured on this machine at {new Date().toLocaleString()}. Turn on “Show sources”
                    to see exactly how each figure was obtained.
                  </p>
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, detail, note, mono }: {
  label: string; value: string; detail?: string; note?: string; mono?: boolean;
}) {
  return (
    <div className="spec__row">
      <dt>{label}</dt>
      <dd>
        {value ? (
          <>
            <span className={mono ? "mono" : undefined}>{value}</span>
            {detail && <span className="spec__detail">{detail}</span>}
          </>
        ) : (
          <span className="spec__missing">not available{note ? ` — ${note}` : ""}</span>
        )}
      </dd>
    </div>
  );
}

function healthTone(health: number): "ok" | "warn" | "danger" {
  if (health < 60) return "danger";
  if (health < 80) return "warn";
  return "ok";
}

function sectionText(section: hwinfo.Section): string {
  const lines = section.fields.map((f) =>
    `${f.label}: ${f.value || `(not available — ${f.note})`}${f.detail ? ` (${f.detail})` : ""}${f.source ? `   [${f.source}]` : ""}`);
  return `## ${section.title}\n${lines.join("\n")}`;
}

function batteryText(b: hwinfo.Battery): string {
  if (!b.present) return `## Battery\n${b.note}`;
  return [
    "## Battery",
    `Health: ${b.healthKnown ? `${b.health.toFixed(1)}% (${b.fullWh.toFixed(1)} Wh of ${b.designWh.toFixed(1)} Wh design)` : `unknown — ${b.note}`}`,
    `Cycles: ${b.cyclesKnown ? b.cycles : "not reported"}`,
    `Charge: ${b.percent.toFixed(0)}% · ${b.nowWh.toFixed(1)} Wh`,
    `Status: ${b.status}${b.onAC ? " (AC connected)" : ""}`,
    `Draw: ${b.powerW ? `${b.powerW.toFixed(1)} W` : "not reported"}`,
    `Chemistry: ${b.technology || "not reported"}`,
    `Manufacturer: ${b.manufacturer || "not reported"}`,
    `Model: ${b.model || "not reported"}`,
    `Serial: ${b.serial || "not reported"}`,
    `[${b.source}]`,
  ].join("\n");
}

function checksText(checks: health.Check[]): string {
  return ["## Health check (measured live)", ...checks.map((c) =>
    `${c.label}: ${c.value || c.verdict}${c.detail ? `\n    ${c.detail}` : ""}\n    method: ${c.method}`)].join("\n");
}

/** Builds the plain-text report the copy button hands over. */
function buildReport(report: hwinfo.Report | null, battery: hwinfo.Battery | null, checks: health.Check[]): string {
  if (!report) return "";
  const parts = [
    `# ${report.vendor} ${report.model}`.trim(),
    `Generated by deck on ${new Date(report.generated).toLocaleString()}`,
    "All values read from the kernel and firmware of this machine.",
    "",
    ...report.sections.map(sectionText),
  ];
  if (battery) parts.push("", batteryText(battery));
  if (checks.length) parts.push("", checksText(checks));
  return parts.join("\n\n");
}
