// Metrics store. The Go side pushes one snapshot per tick; we keep a bounded
// history here so every chart can render without its own polling loop.
import { useSyncExternalStore } from "react";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import type { system } from "../../wailsjs/go/models";

export type Snapshot = system.Snapshot;

export const HISTORY = 180;

type SeriesKey =
  | "cpu"
  | "mem"
  | "swap"
  | "gpu"
  | "gpuMem"
  | "netRx"
  | "netTx"
  | "diskRead"
  | "diskWrite"
  | "temp";

type History = Record<SeriesKey, number[]> & { cores: number[][]; time: number[] };

function emptyHistory(): History {
  return {
    cpu: [], mem: [], swap: [], gpu: [], gpuMem: [], netRx: [], netTx: [],
    diskRead: [], diskWrite: [], temp: [], cores: [], time: [],
  };
}

const listeners = new Set<() => void>();
let snapshot: Snapshot | null = null;
let version = 0;
export const history: History = emptyHistory();

function push(key: SeriesKey, value: number) {
  const arr = history[key];
  arr.push(Number.isFinite(value) ? value : 0);
  if (arr.length > HISTORY) arr.shift();
}

function ingest(s: Snapshot) {
  snapshot = s;
  version++;
  push("cpu", s.cpu?.usage ?? 0);
  push("mem", s.memory?.percent ?? 0);
  push("swap", s.swap?.percent ?? 0);
  push("netRx", s.network?.rxRate ?? 0);
  push("netTx", s.network?.txRate ?? 0);
  push("diskRead", s.diskIO?.readRate ?? 0);
  push("diskWrite", s.diskIO?.writeRate ?? 0);
  const gpu = s.gpus?.[0];
  push("gpu", gpu?.usage ?? 0);
  push("gpuMem", gpu && gpu.memTotal ? (gpu.memUsed / gpu.memTotal) * 100 : 0);
  push("temp", hottest(s));
  history.time.push(s.time);
  if (history.time.length > HISTORY) history.time.shift();

  const cores = s.cpu?.perCore ?? [];
  cores.forEach((v, i) => {
    if (!history.cores[i]) history.cores[i] = [];
    const arr = history.cores[i];
    arr.push(v);
    if (arr.length > HISTORY) arr.shift();
  });

  listeners.forEach((l) => l());
}

export function hottest(s: Snapshot | null): number {
  if (!s?.temps?.length) return 0;
  return s.temps.reduce((max, t) => (t.value > max ? t.value : max), 0);
}

let started = false;
export function startMetrics() {
  if (started) return;
  started = true;
  EventsOn("metrics", (s: Snapshot) => ingest(s));
}

/** Seeds the store with the first snapshot so the UI is never empty on mount. */
export function seed(s: Snapshot) {
  ingest(s);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useMetrics(): Snapshot | null {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** Version counter for components that draw imperatively from `history`. */
export function useTick(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

export function latest(): Snapshot | null {
  return snapshot;
}
