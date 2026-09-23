import { useCallback, useEffect, useRef, useState } from "react";

/** Calls `fn` immediately and then on an interval, skipping while hidden. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const run = useCallback(async () => {
    try {
      const result = await fn();
      if (!alive.current) return;
      setData(result);
      setError(null);
    } catch (e: unknown) {
      if (alive.current) setError(String(e));
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    alive.current = true;
    run();
    if (ms <= 0) return () => { alive.current = false; };
    const id = setInterval(() => {
      if (!document.hidden) run();
    }, ms);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [run, ms]);

  return { data, error, loading, refresh: run };
}

type Combo = string; // e.g. "mod+k", "shift+?", "escape"

function matches(e: KeyboardEvent, combo: Combo): boolean {
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const need = new Set(parts.slice(0, -1));
  const mod = e.ctrlKey || e.metaKey;
  if (need.has("mod") !== mod) return false;
  if (need.has("shift") !== e.shiftKey) return false;
  if (need.has("alt") !== e.altKey) return false;
  return e.key.toLowerCase() === key;
}

/** Global shortcut. Ignores keystrokes typed into inputs unless `always`. */
export function useHotkey(combo: Combo, handler: (e: KeyboardEvent) => void, always = false) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing && !always) return;
      if (!matches(e, combo)) return;
      e.preventDefault();
      ref.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [combo, always]);
}

export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* storage may be unavailable; the UI still works */
      }
    },
    [key],
  );
  return [value, set];
}

/** Debounces a fast-changing value, for search fields. */
export function useDebounced<T>(value: T, ms = 140): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Tracks an element's size without a layout thrash on every render. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1 ? prev : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}
