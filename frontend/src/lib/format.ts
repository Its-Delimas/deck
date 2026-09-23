// Formatting helpers. Every number the UI prints goes through here so units,
// precision and alignment stay consistent across screens.

const KB = 1024;

export function bytes(n: number | undefined, digits = 1): string {
  if (!n || n < 0) return "0 B";
  if (n < KB) return `${Math.round(n)} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let v = n / KB;
  let i = 0;
  while (v >= KB && i < units.length - 1) {
    v /= KB;
    i++;
  }
  return `${v.toFixed(v >= 100 || digits === 0 ? 0 : v >= 10 ? 1 : digits)} ${units[i]}`;
}

/** Splits a byte count so the value and unit can be styled separately. */
export function bytesParts(n: number | undefined): [string, string] {
  const s = bytes(n);
  const i = s.lastIndexOf(" ");
  return [s.slice(0, i), s.slice(i + 1)];
}

export function rate(bytesPerSec: number | undefined): string {
  return `${bytes(bytesPerSec, 1)}/s`;
}

/** Network throughput is conventionally read in bits. */
export function bits(bytesPerSec: number | undefined): string {
  const n = (bytesPerSec || 0) * 8;
  if (n < 1000) return `${Math.round(n)} bps`;
  const units = ["Kbps", "Mbps", "Gbps"];
  let v = n / 1000;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function pct(n: number | undefined, digits = 0): string {
  return `${(n ?? 0).toFixed(digits)}%`;
}

export function duration(seconds: number | undefined): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function since(ms: number | undefined): string {
  if (!ms) return "—";
  return duration((Date.now() - ms) / 1000);
}

export function ago(ms: number | undefined): string {
  if (!ms) return "—";
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function clockTime(ms: number): string {
  const d = new Date(ms);
  return d.toTimeString().slice(0, 8);
}

export function timeWithMs(ms: number): string {
  const d = new Date(ms);
  return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

export function temp(celsius: number, unit: "c" | "f" = "c"): string {
  return unit === "f" ? `${Math.round(celsius * 1.8 + 32)}°F` : `${Math.round(celsius)}°C`;
}

/** Collapses a long command line to something readable in a single row. */
export function shortCmd(cmd: string, max = 90): string {
  if (!cmd) return "";
  const trimmed = cmd.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function basename(path: string): string {
  if (!path) return "";
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || path;
}

/** Shortens a path for display: /home/me/dev/app -> ~/dev/app. */
export function tildePath(path: string, home: string): string {
  if (home && path.startsWith(home)) return `~${path.slice(home.length)}`;
  return path;
}

export function severityOf(v: number, warn: number, danger: number): "ok" | "warn" | "danger" {
  if (v >= danger) return "danger";
  if (v >= warn) return "warn";
  return "ok";
}
